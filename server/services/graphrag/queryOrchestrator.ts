import { Neo4jService } from '../neo4j';
import { TemplateQueryEngine } from './templateQueryEngine';
import { NLPProcessor, NLPResult } from './nlpProcessor';
import { LangChainGraphRAG } from './langchainGraphRAG';
import type { GraphRAGResult } from './langchainGraphRAG';
import { LangfuseService } from '../langfuse';

export interface QueryResult {
  success: boolean;
  stage: number;
  method: string;
  query: string;
  cypher?: string;
  results?: any[];
  answer?: string;
  error?: string;
  suggestions?: string[];
  processingTime: number;
  nlpAnalysis?: NLPResult;
  confidence?: number;
  metadata?: any;
  fromCache?: boolean;
  timestamp?: number;
}

interface QueryStrategy {
  approach: 'progressive' | 'direct-llm' | 'hybrid-parallel' | 'template-first';
  complexity: {
    score: number;
    indicators: string[];
    length: number;
    hasNegation: boolean;
  };
}

export class QueryOrchestrator {
  private templateEngine: TemplateQueryEngine;
  private nlpProcessor: NLPProcessor;
  private langchainGraphRAG: LangChainGraphRAG;
  private langfuseService: LangfuseService;
  private queryCache: Map<string, QueryResult>;
  private metrics: {
    queries: number;
    cacheHits: number;
    successByStage: Record<number, number>;
    totalLatency: Record<number, number>;
    errorsByStage: Record<number, number>;
  };

  constructor(private neo4jService: Neo4jService) {
    this.templateEngine = new TemplateQueryEngine(neo4jService);
    this.nlpProcessor = new NLPProcessor();
    this.langchainGraphRAG = new LangChainGraphRAG();
    this.langfuseService = new LangfuseService();
    this.queryCache = new Map();
    
    this.metrics = {
      queries: 0,
      cacheHits: 0,
      successByStage: { 1: 0, 2: 0, 3: 0, 4: 0 },
      totalLatency: { 1: 0, 2: 0, 3: 0, 4: 0 },
      errorsByStage: { 1: 0, 2: 0, 3: 0, 4: 0 }
    };
  }

  async processQuery(
    userQuery: string, 
    options: {
      skipCache?: boolean;
      skipTemplates?: boolean;
      skipNLP?: boolean;
      skipLangfuse?: boolean;
      skipLangChain?: boolean;
      forceStrategy?: string;
      maxRetries?: number;
    } = {}
  ): Promise<QueryResult> {
    const startTime = Date.now();
    this.metrics.queries++;
    
    console.log(`[QueryOrchestrator] Processing query: "${userQuery}"`);
    console.log(`[QueryOrchestrator] Options:`, options);

    // Check cache
    if (!options.skipCache) {
      const cacheKey = this.generateCacheKey(userQuery, options);
      if (this.queryCache.has(cacheKey)) {
        const cached = this.queryCache.get(cacheKey)!;
        console.log(`[QueryOrchestrator] Cache hit for query`);
        this.metrics.cacheHits++;
        return { ...cached, fromCache: true };
      }
    }

    // Determine strategy
    const strategy = this.determineStrategy(userQuery, options);
    console.log(`[QueryOrchestrator] Using strategy: ${strategy.approach}, complexity: ${strategy.complexity.score}`);

    let result: QueryResult | null = null;

    try {
      switch (strategy.approach) {
        case 'template-first':
          result = await this.templateFirstProcessing(userQuery, options);
          break;
        case 'progressive':
          result = await this.progressiveProcessing(userQuery, options);
          break;
        case 'direct-llm':
          result = await this.directLLMProcessing(userQuery, options);
          break;
        case 'hybrid-parallel':
          result = await this.hybridParallelProcessing(userQuery, options);
          break;
        default:
          result = await this.progressiveProcessing(userQuery, options);
      }

      // Update metrics
      if (result.success) {
        this.metrics.successByStage[result.stage] = (this.metrics.successByStage[result.stage] || 0) + 1;
        this.metrics.totalLatency[result.stage] = (this.metrics.totalLatency[result.stage] || 0) + result.processingTime;
      } else {
        this.metrics.errorsByStage[result.stage || 0] = (this.metrics.errorsByStage[result.stage || 0] || 0) + 1;
      }

      // Cache successful results
      if (result.success && !options.skipCache) {
        const cacheKey = this.generateCacheKey(userQuery, options);
        this.cacheResult(cacheKey, result);
      }

    } catch (error) {
      console.error(`[QueryOrchestrator] Processing failed:`, error);
      result = {
        success: false,
        stage: 0,
        method: 'error',
        query: userQuery,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      };
    }

    result.processingTime = Date.now() - startTime;
    console.log(`[QueryOrchestrator] Completed in ${result.processingTime}ms - Success: ${result.success} - Stage: ${result.stage}`);
    
    return result;
  }

  private determineStrategy(userQuery: string, options: any): QueryStrategy {
    const complexity = this.analyzeQueryComplexity(userQuery);
    
    if (options.forceStrategy) {
      return { approach: options.forceStrategy, complexity };
    }

    // Simple queries - use templates first
    if (complexity.score < 0.3) {
      return { approach: 'template-first', complexity };
    }
    
    // Moderate complexity - progressive approach
    if (complexity.score < 0.6) {
      return { approach: 'progressive', complexity };
    }
    
    // High complexity - try parallel processing
    if (complexity.score < 0.8) {
      return { approach: 'hybrid-parallel', complexity };
    }
    
    // Very complex - go straight to LLM
    return { approach: 'direct-llm', complexity };
  }

  private analyzeQueryComplexity(userQuery: string): QueryStrategy['complexity'] {
    const complexityIndicators = [
      'multi-hop', 'relationship', 'connected', 'path', 'chain',
      'analyze', 'compare', 'aggregate', 'count', 'average',
      'most', 'least', 'best', 'worst', 'similar', 'related',
      'between', 'through', 'via', 'complex', 'detailed'
    ];

    const tokens = userQuery.toLowerCase().split(/\s+/);
    let complexityScore = 0;
    const foundIndicators: string[] = [];

    for (const indicator of complexityIndicators) {
      if (tokens.some(token => token.includes(indicator))) {
        complexityScore += 0.15;
        foundIndicators.push(indicator);
      }
    }

    // Long queries are often more complex
    if (tokens.length > 10) complexityScore += 0.2;
    if (tokens.length > 20) complexityScore += 0.2;

    // Questions with multiple entities
    const properNouns = userQuery.match(/\b[A-Z][a-z]+\b/g) || [];
    if (properNouns.length > 2) complexityScore += 0.2;

    // Negations add complexity
    const hasNegation = tokens.some(token => ['not', 'without', 'except', 'excluding'].includes(token));
    if (hasNegation) complexityScore += 0.2;

    return {
      score: Math.min(complexityScore, 1.0),
      indicators: foundIndicators,
      length: tokens.length,
      hasNegation
    };
  }

  private async templateFirstProcessing(userQuery: string, options: any): Promise<QueryResult> {
    const startTime = Date.now();
    
    // Stage 1: Try template matching (fastest)
    if (!options.skipTemplates) {
      console.log(`[QueryOrchestrator] Stage 1: Template matching`);
      const templateResult = await this.templateEngine.processQuery(userQuery);
      
      if (templateResult.success && templateResult.results !== undefined) {
        return {
          success: true,
          stage: 1,
          method: templateResult.method,
          query: userQuery,
          cypher: templateResult.cypher,
          results: templateResult.results,
          processingTime: Date.now() - startTime,
          confidence: 0.9
        };
      }
    }

    // Fall back to progressive if templates fail
    return this.progressiveProcessing(userQuery, options);
  }

  private async progressiveProcessing(userQuery: string, options: any): Promise<QueryResult> {
    const startTime = Date.now();
    
    // Stage 1: Template matching
    if (!options.skipTemplates) {
      console.log(`[QueryOrchestrator] Stage 1: Template matching`);
      const templateResult = await this.templateEngine.processQuery(userQuery);
      
      if (templateResult.success && templateResult.results !== undefined) {
        return {
          success: true,
          stage: 1,
          method: templateResult.method,
          query: userQuery,
          cypher: templateResult.cypher,
          results: templateResult.results,
          processingTime: Date.now() - startTime,
          confidence: 0.9
        };
      }
    }

    // Stage 2: NLP-enhanced processing
    if (!options.skipNLP) {
      console.log(`[QueryOrchestrator] Stage 2: NLP processing`);
      const nlpResult = await this.nlpProcessor.processQuery(userQuery);
      console.log(`[QueryOrchestrator] NLP Intent: ${nlpResult.intent.intent}, Keywords:`, nlpResult.keywords);
      
      if (nlpResult.confidence > 0.3) {
        const enhancedQuery = await this.generateNLPEnhancedQuery(nlpResult);
        
        if (enhancedQuery.success && enhancedQuery.results) {
          return {
            success: true,
            stage: 2,
            method: 'nlp-enhanced',
            query: userQuery,
            cypher: enhancedQuery.cypher,
            results: enhancedQuery.results,
            nlpAnalysis: nlpResult,
            processingTime: Date.now() - startTime,
            confidence: nlpResult.confidence
          };
        }
      }
    }

    // Stage 3: Langfuse Claude translation (existing approach)
    if (!options.skipLangfuse) {
      console.log(`[QueryOrchestrator] Stage 3: Langfuse Claude translation`);
      try {
        const translation = await this.langfuseService.translateNaturalLanguageQuery(userQuery);
        
        if (translation.graphQuery) {
          const results = await this.neo4jService.executeQuery(translation.graphQuery);
          
          return {
            success: true,
            stage: 3,
            method: 'langfuse-claude',
            query: userQuery,
            cypher: translation.graphQuery,
            results,
            processingTime: Date.now() - startTime,
            confidence: 0.7,
            metadata: {
              queryType: translation.queryType,
              explanation: translation.explanation
            }
          };
        }
      } catch (error) {
        console.error(`[QueryOrchestrator] Langfuse translation failed:`, error);
      }
    }

    // Stage 4: LangChain GraphCypherQAChain (most powerful)
    if (!options.skipLangChain) {
      console.log(`[QueryOrchestrator] Stage 4: LangChain GraphRAG`);
      const graphRAGResult = await this.langchainGraphRAG.queryGraph(userQuery, {
        includeExamples: true,
        maxRetries: options.maxRetries || 2
      });
      
      if (graphRAGResult.success) {
        return {
          success: true,
          stage: 4,
          method: graphRAGResult.method,
          query: userQuery,
          cypher: graphRAGResult.cypher,
          answer: graphRAGResult.answer,
          processingTime: Date.now() - startTime,
          confidence: 0.8,
          metadata: graphRAGResult.metadata
        };
      }
    }

    // All stages failed
    return {
      success: false,
      stage: 0,
      method: 'none',
      query: userQuery,
      error: 'Unable to process query using any method',
      suggestions: await this.generateFailureSuggestions(userQuery),
      processingTime: Date.now() - startTime
    };
  }

  private async directLLMProcessing(userQuery: string, options: any): Promise<QueryResult> {
    const startTime = Date.now();
    
    console.log(`[QueryOrchestrator] Direct LLM processing`);
    
    // Go straight to LangChain GraphRAG for complex queries
    const graphRAGResult = await this.langchainGraphRAG.queryGraph(userQuery, {
      includeExamples: true,
      maxRetries: options.maxRetries || 3
    });
    
    if (graphRAGResult.success) {
      return {
        success: true,
        stage: 4,
        method: graphRAGResult.method,
        query: userQuery,
        cypher: graphRAGResult.cypher,
        answer: graphRAGResult.answer,
        processingTime: Date.now() - startTime,
        confidence: 0.8,
        metadata: graphRAGResult.metadata
      };
    }
    
    // Fall back to progressive if direct LLM fails
    return this.progressiveProcessing(userQuery, { ...options, skipLangChain: true });
  }

  private async hybridParallelProcessing(userQuery: string, options: any): Promise<QueryResult> {
    const startTime = Date.now();
    
    console.log(`[QueryOrchestrator] Hybrid parallel processing`);
    
    // Run multiple approaches in parallel
    const promises: Promise<any>[] = [];
    
    if (!options.skipTemplates) {
      promises.push(this.templateEngine.processQuery(userQuery));
    }
    
    if (!options.skipNLP) {
      promises.push(this.nlpProcessor.processQuery(userQuery));
    }
    
    if (!options.skipLangfuse) {
      promises.push(this.langfuseService.translateNaturalLanguageQuery(userQuery).catch(e => null));
    }
    
    const results = await Promise.allSettled(promises);
    
    // Process template result
    if (results[0]?.status === 'fulfilled' && results[0].value?.success) {
      return {
        success: true,
        stage: 1,
        method: 'template',
        query: userQuery,
        cypher: results[0].value.cypher,
        results: results[0].value.results,
        processingTime: Date.now() - startTime,
        confidence: 0.9
      };
    }
    
    // Process NLP result
    if (results[1]?.status === 'fulfilled' && results[1].value?.confidence > 0.3) {
      const enhancedQuery = await this.generateNLPEnhancedQuery(results[1].value);
      if (enhancedQuery.success) {
        return {
          success: true,
          stage: 2,
          method: 'nlp-enhanced',
          query: userQuery,
          cypher: enhancedQuery.cypher,
          results: enhancedQuery.results,
          nlpAnalysis: results[1].value,
          processingTime: Date.now() - startTime,
          confidence: results[1].value.confidence
        };
      }
    }
    
    // Process Langfuse result
    if (results[2]?.status === 'fulfilled' && results[2].value?.graphQuery) {
      try {
        const queryResults = await this.neo4jService.executeQuery(results[2].value.graphQuery);
        return {
          success: true,
          stage: 3,
          method: 'langfuse-claude',
          query: userQuery,
          cypher: results[2].value.graphQuery,
          results: queryResults,
          processingTime: Date.now() - startTime,
          confidence: 0.7
        };
      } catch (error) {
        console.error(`[QueryOrchestrator] Failed to execute Langfuse query:`, error);
      }
    }
    
    // Fall back to LangChain if all parallel attempts fail
    return this.directLLMProcessing(userQuery, options);
  }

  private async generateNLPEnhancedQuery(nlpResult: NLPResult): Promise<any> {
    const { intent, entities, keywords } = nlpResult;
    
    let cypher = '';
    const parameters: Record<string, any> = {};
    
    // Generate Cypher based on intent
    switch (intent.intent) {
      case 'list_ingredients':
        // List all ingredients in the graph
        cypher = `
          MATCH (n)
          WHERE n.type = 'ingredient'
          RETURN collect(DISTINCT {name: n.name, description: n.description})[..50] as ingredients
        `;
        break;
        
      case 'list_recipes':
        // List all recipes in the graph
        cypher = `
          MATCH (n)
          WHERE n.type IN ['recipe', 'dish', 'meal']
          RETURN collect(DISTINCT {name: n.name, description: n.description})[..50] as recipes
        `;
        break;
        
      case 'find_ingredients':
        if (entities.properNouns?.length > 0 || entities.candidates?.length > 0) {
          const entityName = entities.properNouns?.[0] || entities.candidates?.[0];
          cypher = `
            MATCH (ingredient)-[r]->(dish)
            WHERE type(r) IN ['PART_OF', 'CONTAINS']
                  AND toLower(dish.name) CONTAINS toLower($entityName)
                  AND ingredient.type = 'ingredient'
            WITH dish.name as entity,
                 collect(DISTINCT ingredient.name) as ingredients
            RETURN entity, ingredients
          `;
          parameters.entityName = entityName;
        } else {
          // If no specific entity mentioned, show all ingredients
          cypher = `
            MATCH (n)
            WHERE n.type = 'ingredient'
            RETURN collect(DISTINCT {name: n.name, description: n.description})[..50] as ingredients
          `;
        }
        break;
        
      case 'find_recipes':
        if (entities.properNouns?.length > 0 || entities.candidates?.length > 0) {
          const ingredientName = entities.properNouns?.[0] || entities.candidates?.[0];
          cypher = `
            MATCH (ingredient)-[r]->(recipe)
            WHERE type(r) IN ['PART_OF', 'CONTAINS']
                  AND toLower(ingredient.name) CONTAINS toLower($ingredientName)
                  AND ingredient.type = 'ingredient'
                  AND recipe.type IN ['recipe', 'dish', 'meal']
            WITH ingredient.name as searchedIngredient,
                 collect(DISTINCT recipe.name) as recipes
            RETURN searchedIngredient, recipes
          `;
          parameters.ingredientName = ingredientName;
        }
        break;
        
      case 'count_entities':
        if (keywords.length > 0) {
          cypher = `
            MATCH (n)
            WHERE any(keyword in $keywords WHERE 
              toLower(n.type) CONTAINS toLower(keyword) OR
              toLower(n.name) CONTAINS toLower(keyword)
            )
            RETURN n.type as type, count(n) as count
            ORDER BY count DESC
          `;
          parameters.keywords = keywords;
        }
        break;
        
      case 'list_entities':
        // Check if asking about nodes in general
        const queryLower = nlpResult.originalQuery.toLowerCase();
        if (queryLower.includes('node') && (queryLower.includes('have') || queryLower.includes('exist') || queryLower.includes('do you'))) {
          // Query asking about what nodes exist in the graph - return comprehensive view
          cypher = `
            MATCH (n)
            WITH n.type as type, count(*) as typeCount, collect(n)[..5] as samples
            RETURN type, typeCount, 
                   [s in samples | {name: s.name, description: s.description}] as examples
            ORDER BY typeCount DESC
          `;
        } else if ((keywords.includes('all') || keywords.includes('list')) && keywords.length > 1) {
          // Query asking for all of a specific type (e.g., "all recipes", "list ingredients")
          const typeKeyword = keywords.filter(k => k !== 'all' && k !== 'list')[0];
          if (typeKeyword) {
            cypher = `
              MATCH (n)
              WHERE toLower(n.type) = toLower($nodeType)
                    OR toLower(n.type) = toLower($nodeType) + 's'
                    OR toLower(n.type) + 's' = toLower($nodeType)
                    OR toLower(labels(n)[0]) = toLower($nodeType)
                    OR toLower(labels(n)[0]) = toLower($nodeType) + 's'
                    OR toLower(labels(n)[0]) + 's' = toLower($nodeType)
              RETURN n.type as type,
                     collect(DISTINCT {
                       name: n.name,
                       description: n.description
                     }) as entities
              LIMIT 100
            `;
            parameters.nodeType = typeKeyword;
          } else {
            // Fallback: show all nodes if no specific type
            cypher = `
              MATCH (n)
              WITH n.type as type, count(*) as typeCount, collect(n)[..5] as samples
              RETURN type, typeCount, 
                     [s in samples | {name: s.name, description: s.description}] as examples
              ORDER BY typeCount DESC
            `;
          }
        } else if (keywords.length > 0) {
          // General entity listing based on keywords
          cypher = `
            MATCH (n)
            WHERE any(keyword in $keywords WHERE 
              toLower(n.type) CONTAINS toLower(keyword) OR
              toLower(n.name) CONTAINS toLower(keyword)
            )
            RETURN n.type as type,
                   collect(DISTINCT n.name)[..20] as entities
          `;
          parameters.keywords = keywords;
        }
        break;
        
      default:
        // Keyword-based fallback
        if (keywords.length > 0) {
          cypher = `
            MATCH (n)
            WHERE any(keyword in $keywords WHERE 
              toLower(n.name) CONTAINS toLower(keyword) OR
              toLower(n.description) CONTAINS toLower(keyword)
            )
            RETURN n.name as name, 
                   labels(n) as labels,
                   n.type as type, 
                   n.description as description
            LIMIT 10
          `;
          parameters.keywords = keywords;
        }
    }
    
    if (cypher) {
      try {
        const results = await this.neo4jService.executeQuery(cypher, parameters);
        return {
          success: true,
          cypher,
          parameters,
          results
        };
      } catch (error) {
        console.error(`[QueryOrchestrator] NLP-enhanced query failed:`, error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    }
    
    return { success: false, error: 'Could not generate query from NLP analysis' };
  }

  private async generateFailureSuggestions(userQuery: string): Promise<string[]> {
    const suggestions: string[] = [];
    
    // Get available patterns from template engine
    const patterns = this.templateEngine.getAvailablePatterns();
    suggestions.push('Try queries like:');
    patterns.slice(0, 3).forEach(pattern => suggestions.push(`  • ${pattern}`));
    
    // Add NLP suggestions
    const nlpResult = await this.nlpProcessor.processQuery(userQuery);
    const nlpSuggestions = this.nlpProcessor.suggestQueryImprovements(nlpResult);
    suggestions.push(...nlpSuggestions);
    
    return suggestions;
  }

  private generateCacheKey(query: string, options: any): string {
    return `${query.toLowerCase()}:${JSON.stringify(options)}`;
  }

  private cacheResult(key: string, result: QueryResult): void {
    // Simple LRU cache
    if (this.queryCache.size >= 100) {
      const firstKey = this.queryCache.keys().next().value;
      if (firstKey) {
        this.queryCache.delete(firstKey);
      }
    }
    this.queryCache.set(key, { ...result, timestamp: Date.now() });
  }

  getMetrics() {
    const totalQueries = this.metrics.queries;
    const successByStage = Object.fromEntries(
      Object.entries(this.metrics.successByStage).map(([k, v]) => [k, v || 0])
    );
    const averageLatency = Object.fromEntries(
      Object.entries(this.metrics.totalLatency).map(([k, v]) => {
        const count = this.metrics.successByStage[parseInt(k)] || 0;
        return [k, count > 0 ? v / count : 0];
      })
    );
    const errorCounts = Object.fromEntries(
      Object.entries(this.metrics.errorsByStage).map(([k, v]) => [k, v || 0])
    );
    
    // Calculate overall stats
    const totalSuccess = Object.values(this.metrics.successByStage).reduce((a, b) => a + b, 0);
    const totalErrors = Object.values(this.metrics.errorsByStage).reduce((a, b) => a + b, 0);
    const successRate = totalQueries > 0 ? totalSuccess / totalQueries : 0;
    
    // Calculate average response time across all stages
    const totalLatency = Object.values(this.metrics.totalLatency).reduce((a, b) => a + b, 0);
    const avgResponseTime = totalSuccess > 0 ? totalLatency / totalSuccess : 0;
    
    // Calculate cache metrics
    const cacheHitRate = this.metrics.cacheHits > 0 ? this.metrics.cacheHits / totalQueries : 0;

    return {
      totalQueries,
      successByStage,
      averageLatency,
      errorCounts,
      // UI-friendly metrics
      successRate,
      avgResponseTime,
      cacheHitRate,
      cacheHits: this.metrics.cacheHits,
    };
  }

  clearCache(): void {
    this.queryCache.clear();
    console.log('[QueryOrchestrator] Cache cleared');
  }
}