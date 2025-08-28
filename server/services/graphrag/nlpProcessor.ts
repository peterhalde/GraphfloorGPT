import natural from 'natural';

interface Intent {
  intent: string;
  confidence: number;
}

interface ExtractedEntities {
  [key: string]: string[];
}

export interface NLPResult {
  originalQuery: string;
  intent: Intent;
  entities: ExtractedEntities;
  keywords: string[];
  confidence: number;
}

export class NLPProcessor {
  private tokenizer: natural.WordTokenizer;
  private tfidf: natural.TfIdf;
  private intentClassifier: Record<string, string[]>;
  private entityPatterns: Record<string, RegExp>;
  private stopWords: Set<string>;

  constructor() {
    this.tokenizer = new natural.WordTokenizer();
    this.tfidf = new natural.TfIdf();
    this.intentClassifier = this.initializeIntentClassifier();
    this.entityPatterns = this.initializeEntityPatterns();
    this.stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'has', 'had', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'can', 'could', 'shall', 'should'
      // Removed 'what', 'which', 'do', 'have', 'how' as they can be important for query understanding
    ]);
  }

  private initializeIntentClassifier(): Record<string, string[]> {
    return {
      'list_ingredients': ['ingredient', 'ingredients'],
      'list_recipes': ['recipe', 'recipes', 'dish', 'dishes', 'meal', 'meals'],
      'find_procedures': ['step', 'steps', 'instruction', 'instructions', 'how', 'procedure', 'process', 'method', 'way'],
      'find_properties': ['time', 'duration', 'temperature', 'size', 'weight', 'amount', 'quantity', 'measure'],
      'find_relationships': ['connected', 'related', 'linked', 'depends', 'requires', 'uses', 'produces', 'affects'],
      'count_entities': ['count', 'number', 'many', 'much', 'total'],
      'list_entities': ['list', 'show', 'display', 'all', 'every', 'each', 'get', 'find', 'which', 'what', 'nodes', 'have', 'exist', 'see'],
      'describe_entity': ['describe', 'explain', 'tell', 'about', 'details', 'information'],
      'find_components': ['component', 'part', 'module', 'system', 'unit', 'element', 'piece', 'contains', 'made', 'consists', 'includes'],
      'analyze_network': ['network', 'graph', 'connection', 'path', 'route', 'chain', 'link']
    };
  }

  private initializeEntityPatterns(): Record<string, RegExp> {
    return {
      // Capitalized words (likely proper nouns/entity names)
      properNouns: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
      // Quoted strings
      quotedEntities: /["']([^"']+)["']/g,
      // Common measurement patterns
      quantities: /\b(\d+(?:\.\d+)?)\s*(cup|cups|tablespoon|tbsp|teaspoon|tsp|pound|lb|ounce|oz|gram|g|kilogram|kg|ml|liter|l)s?\b/gi,
      // Time patterns
      timeUnits: /\b(\d+)\s*(minute|minutes|hour|hours|second|seconds|day|days)s?\b/gi,
      // Temperature patterns
      temperatures: /\b(\d+)\s*(?:°|degree|degrees)\s*([CF]|celsius|fahrenheit)?\b/gi,
      // Alphanumeric identifiers
      identifiers: /\b([A-Z0-9]{2,}(?:[-_][A-Z0-9]+)*)\b/g
    };
  }

  async processQuery(userQuery: string): Promise<NLPResult> {
    const intent = this.classifyIntent(userQuery);
    const entities = this.extractEntities(userQuery);
    const keywords = this.extractKeywords(userQuery);
    const confidence = this.calculateConfidence(intent, entities, keywords);

    return {
      originalQuery: userQuery,
      intent,
      entities,
      keywords,
      confidence
    };
  }

  private classifyIntent(query: string): Intent {
    const tokens = this.tokenizer.tokenize(query.toLowerCase()) || [];
    const queryLower = query.toLowerCase();
    const scores = new Map<string, number>();

    // Special patterns for specific intents  
    // Check for queries asking about ingredients OF something specific
    const hasSpecificEntity = tokens.some(t => t.length > 3 && t[0] === t[0].toUpperCase()) || 
                             tokens.includes('flammkuchen') || 
                             queryLower.includes('for ') || 
                             queryLower.includes('in ') ||
                             queryLower.includes('of ');
    
    if (queryLower.includes('ingredients') && hasSpecificEntity) {
      // "ingredients for X", "ingredients needed for X", "ingredients in X", "ingredients of X"
      return {
        intent: 'find_ingredients',
        confidence: 0.9
      };
    }
    
    if ((queryLower.includes('list') || queryLower.includes('show') || queryLower.includes('all')) && queryLower.includes('ingredients')) {
      // "list all ingredients", "show me all ingredients"
      return {
        intent: 'list_ingredients',
        confidence: 0.9
      };
    }

    // Calculate scores for each intent
    for (const [intent, keywords] of Object.entries(this.intentClassifier)) {
      let score = 0;
      let matches = 0;
      
      for (const keyword of keywords) {
        if (tokens.some(token => token.includes(keyword) || keyword.includes(token))) {
          score += 1;
          matches++;
        }
      }
      
      // Normalize by number of keywords
      if (matches > 0) {
        scores.set(intent, score / keywords.length);
      }
    }

    // Find best matching intent
    let bestIntent = 'unknown';
    let maxScore = 0;

    scores.forEach((score, intent) => {
      if (score > maxScore) {
        maxScore = score;
        bestIntent = intent;
      }
    });

    return {
      intent: bestIntent,
      confidence: Math.min(maxScore, 1.0)
    };
  }

  private extractEntities(query: string): ExtractedEntities {
    const entities: ExtractedEntities = {};

    // Extract proper nouns
    const properNouns = Array.from(query.matchAll(this.entityPatterns.properNouns));
    if (properNouns.length > 0) {
      entities.properNouns = properNouns.map(match => match[1]);
    }

    // Extract quoted entities
    const quoted = Array.from(query.matchAll(this.entityPatterns.quotedEntities));
    if (quoted.length > 0) {
      entities.quotedEntities = quoted.map(match => match[1]);
    }

    // Extract quantities
    const quantities = Array.from(query.matchAll(this.entityPatterns.quantities));
    if (quantities.length > 0) {
      entities.quantities = quantities.map(match => match[0]);
    }

    // Extract time units
    const timeUnits = Array.from(query.matchAll(this.entityPatterns.timeUnits));
    if (timeUnits.length > 0) {
      entities.timeUnits = timeUnits.map(match => match[0]);
    }

    // Extract temperatures
    const temperatures = Array.from(query.matchAll(this.entityPatterns.temperatures));
    if (temperatures.length > 0) {
      entities.temperatures = temperatures.map(match => match[0]);
    }

    // Extract identifiers
    const identifiers = Array.from(query.matchAll(this.entityPatterns.identifiers));
    if (identifiers.length > 0) {
      entities.identifiers = identifiers.map(match => match[1]);
    }

    // Extract potential entity names (multi-word sequences not in stop words)
    const tokens = this.tokenizer.tokenize(query.toLowerCase()) || [];
    const potentialEntities: string[] = [];
    
    for (let i = 0; i < tokens.length; i++) {
      if (!this.stopWords.has(tokens[i]) && tokens[i].length > 2) {
        // Single word entity
        potentialEntities.push(tokens[i]);
        
        // Try to build multi-word entities
        if (i < tokens.length - 1 && !this.stopWords.has(tokens[i + 1])) {
          potentialEntities.push(`${tokens[i]} ${tokens[i + 1]}`);
        }
      }
    }
    
    if (potentialEntities.length > 0) {
      entities.candidates = potentialEntities;
    }

    return entities;
  }

  private extractKeywords(query: string): string[] {
    const tokens = this.tokenizer.tokenize(query.toLowerCase()) || [];
    
    // Filter out stop words and short tokens
    const keywords = tokens.filter(token => 
      !this.stopWords.has(token) && 
      token.length > 2 &&
      !/^\d+$/.test(token) // Not just numbers
    );

    // Remove duplicates and return
    return Array.from(new Set(keywords));
  }

  private calculateConfidence(intent: Intent, entities: ExtractedEntities, keywords: string[]): number {
    let confidence = 0;

    // Intent confidence contributes 40%
    confidence += intent.confidence * 0.4;

    // Entity extraction contributes 30%
    const entityScore = Math.min(Object.keys(entities).length * 0.1, 0.3);
    confidence += entityScore;

    // Keyword richness contributes 30%
    const keywordScore = Math.min(keywords.length * 0.05, 0.3);
    confidence += keywordScore;

    return Math.min(confidence, 1.0);
  }

  suggestQueryImprovements(nlpResult: NLPResult): string[] {
    const suggestions: string[] = [];

    if (nlpResult.confidence < 0.3) {
      suggestions.push('Try using more specific terms or entity names');
    }

    if (nlpResult.intent.intent === 'unknown') {
      suggestions.push('Consider using action words like: find, show, list, count, describe');
    }

    if (Object.keys(nlpResult.entities).length === 0) {
      suggestions.push('Include specific names or identifiers in your query');
    }

    if (nlpResult.keywords.length < 2) {
      suggestions.push('Add more descriptive keywords to your query');
    }

    // Intent-specific suggestions
    switch (nlpResult.intent.intent) {
      case 'find_ingredients':
        suggestions.push('Example: "What ingredients are in chocolate cake?"');
        break;
      case 'find_recipes':
        suggestions.push('Example: "Show me recipes with tomatoes"');
        break;
      case 'find_relationships':
        suggestions.push('Example: "How is flour related to bread?"');
        break;
      case 'count_entities':
        suggestions.push('Example: "How many ingredients do we have?"');
        break;
    }

    return suggestions;
  }
}