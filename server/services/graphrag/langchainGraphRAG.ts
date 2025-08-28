import { GraphCypherQAChain } from '@langchain/community/chains/graph_qa/cypher';
import { Neo4jGraph } from '@langchain/community/graphs/neo4j_graph';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { modelProvider } from '../llm/modelProvider';

export interface GraphRAGResult {
  success: boolean;
  method: string;
  stage: number;
  question?: string;
  answer?: string;
  cypher?: string;
  context?: any;
  processingTime?: number;
  error?: string;
  suggestion?: string;
  metadata?: {
    llmModel: string;
    returnedIntermediateSteps: boolean;
  };
}

export class LangChainGraphRAG {
  private graph: Neo4jGraph | null = null;
  private llm: BaseChatModel;
  private qaChain: GraphCypherQAChain | null = null;
  private initializationPromise: Promise<void> | null = null;
  private initialized = false;

  constructor() {
    // Use the model provider to get the current model
    this.llm = modelProvider.getLangChainModel();
    
    this.initializationPromise = this.initialize();
  }

  async refreshModel(): Promise<void> {
    // Get the new model from the provider
    this.llm = modelProvider.getLangChainModel();
    
    // Reinitialize the QA chain with the new model
    if (this.graph && this.initialized) {
      await this.initializeQAChain();
    }
  }

  private async initializeQAChain(): Promise<void> {
    // Create the GraphCypher QA Chain with custom prompt
    const cypherPrompt = `Task: Generate a Cypher query to retrieve information from a Neo4j graph database based on the user's question.

IMPORTANT CONTEXT:
- Nodes have BOTH dynamic labels (like :recipe, :entity, :process) AND a 'type' property
- All nodes have these properties: id, name, description, type
- The 'type' property value matches the node label (in lowercase)
- You can query by label: MATCH (n:recipe) or by property: MATCH (n) WHERE n.type = 'recipe'

Instructions:
1. Use the provided schema for node labels and relationship types
2. For general "show nodes" queries, return comprehensive data: name, type, description
3. Use case-insensitive matching with toLower() for text comparisons
4. Default LIMIT 25 for general queries, more for specific searches
5. Return meaningful aliases for clarity

Common Patterns:
- Show all nodes: MATCH (n) RETURN n.name as name, n.type as type, n.description as description LIMIT 25
- Find by type: MATCH (n:ingredient) RETURN n OR MATCH (n) WHERE n.type = 'ingredient' RETURN n
- Find by name: MATCH (n) WHERE toLower(n.name) CONTAINS toLower('search') RETURN n
- Count by type: MATCH (n) RETURN n.type as type, count(*) as count ORDER BY count DESC

Schema:
{schema}

User Question: {question}

Cypher Query:`;

    this.qaChain = GraphCypherQAChain.fromLLM({
      llm: this.llm,
      graph: this.graph!,
      verbose: process.env.NODE_ENV === 'development',
      returnIntermediateSteps: true,
      cypherPrompt,
      returnDirect: false,
      topK: 10,
    });
  }

  private async initialize(): Promise<void> {
    try {
      console.log('[LangChainGraphRAG] Initializing Neo4j Graph connection...');
      
      const neo4jUri = process.env.NEO4J_URI || 'bolt://localhost:7687';
      const neo4jUsername = process.env.NEO4J_USERNAME || 'neo4j';
      const neo4jPassword = process.env.NEO4J_PASSWORD || '';

      if (!neo4jPassword) {
        throw new Error('NEO4J_PASSWORD must be provided');
      }

      // Initialize Neo4j Graph connection
      this.graph = await Neo4jGraph.initialize({
        url: neo4jUri,
        username: neo4jUsername,
        password: neo4jPassword,
      });

      console.log('[LangChainGraphRAG] Graph connection established');

      // Refresh the schema
      await this.graph.refreshSchema();
      console.log('[LangChainGraphRAG] Schema refreshed');

      // Initialize the QA chain
      await this.initializeQAChain();

      this.initialized = true;
      console.log('[LangChainGraphRAG] Initialization complete');
    } catch (error) {
      console.error('[LangChainGraphRAG] Initialization failed:', error);
      this.initialized = false;
      throw error;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
    if (!this.initialized || !this.qaChain || !this.graph) {
      throw new Error('LangChainGraphRAG not properly initialized');
    }
  }

  async queryGraph(question: string, options: {
    domain?: string;
    includeExamples?: boolean;
    maxRetries?: number;
  } = {}): Promise<GraphRAGResult> {
    await this.ensureInitialized();
    
    const startTime = Date.now();
    const maxRetries = options.maxRetries || 2;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        console.log(`[LangChainGraphRAG] Processing query (attempt ${attempt + 1}): "${question}"`);
        
        // Enhance question with domain context
        const enhancedQuestion = this.enhanceQuestion(question, options);
        
        // Execute the chain
        const result = await this.qaChain!.invoke({
          query: enhancedQuestion,
        });

        const processingTime = Date.now() - startTime;

        // Extract cypher query from intermediate steps
        let cypherQuery: string | undefined;
        let context: any;
        
        if (result.intermediateSteps && Array.isArray(result.intermediateSteps)) {
          const cypherStep = result.intermediateSteps.find((step: any) => step.query);
          if (cypherStep) {
            cypherQuery = cypherStep.query;
            context = cypherStep.context;
          }
        }

        console.log(`[LangChainGraphRAG] Query successful in ${processingTime}ms`);
        
        return {
          success: true,
          method: 'langchain-graphcypher',
          stage: 4,
          question: enhancedQuestion,
          answer: result.result || result.text || 'No results found',
          cypher: cypherQuery,
          context,
          processingTime,
          metadata: {
            llmModel: modelProvider.getCurrentConfig().model,
            returnedIntermediateSteps: !!result.intermediateSteps
          }
        };

      } catch (error) {
        console.error(`[LangChainGraphRAG] Query attempt ${attempt + 1} failed:`, error);
        lastError = error as Error;
        
        if (attempt < maxRetries - 1) {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }

    // All attempts failed
    const processingTime = Date.now() - startTime;
    
    return {
      success: false,
      method: 'langchain-graphcypher',
      stage: 4,
      error: lastError?.message || 'Unknown error',
      suggestion: this.generateErrorSuggestion(lastError),
      processingTime
    };
  }

  private enhanceQuestion(question: string, options: { domain?: string; includeExamples?: boolean }): string {
    let enhancedQuestion = question;

    // Add domain context
    if (options.domain === 'recipe') {
      enhancedQuestion = `In the context of recipes, ingredients, and cooking: ${question}`;
    } else if (options.domain === 'technical') {
      enhancedQuestion = `In the context of technical systems and components: ${question}`;
    } else if (options.domain === 'process') {
      enhancedQuestion = `In the context of processes and procedures: ${question}`;
    }

    // Add instruction for better responses
    if (options.includeExamples) {
      enhancedQuestion += '\nProvide specific details and include all relevant relationships.';
    }

    return enhancedQuestion;
  }

  private generateErrorSuggestion(error: Error | null): string {
    if (!error) return 'Please try rephrasing your question';
    
    const message = error.message.toLowerCase();
    
    if (message.includes('syntax')) {
      return 'Try rephrasing your question more clearly or use simpler terms';
    } else if (message.includes('timeout')) {
      return 'Your query might be too complex. Try breaking it into smaller questions';
    } else if (message.includes('rate limit')) {
      return 'API rate limit reached. Please wait a moment before trying again';
    } else if (message.includes('connection') || message.includes('driver')) {
      return 'Database connection issue. Please try again in a moment';
    } else if (message.includes('schema')) {
      return 'The query structure might not match the database. Try using different entity names';
    }
    
    return 'Please try rephrasing your question or contact support if the issue persists';
  }

  async refreshSchema(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.ensureInitialized();
      await this.graph!.refreshSchema();
      console.log('[LangChainGraphRAG] Schema refreshed successfully');
      return { success: true };
    } catch (error) {
      console.error('[LangChainGraphRAG] Failed to refresh schema:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async getGraphSchema(): Promise<string | null> {
    try {
      await this.ensureInitialized();
      return this.graph!.getSchema();
    } catch (error) {
      console.error('[LangChainGraphRAG] Failed to get schema:', error);
      return null;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.ensureInitialized();
      // Try a simple query to test connection
      const result = await this.graph!.query('MATCH (n) RETURN count(n) as count LIMIT 1');
      return true;
    } catch (error) {
      console.error('[LangChainGraphRAG] Connection test failed:', error);
      return false;
    }
  }
}