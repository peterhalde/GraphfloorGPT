import Anthropic from '@anthropic-ai/sdk';

export class LangfuseService {
  private anthropic: Anthropic;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY must be provided");
    }

    this.anthropic = new Anthropic({
      apiKey: apiKey,
    });
  }

  async extractNodesAndRelations(textContent: string, documentId: string): Promise<{
    nodes: Array<{
      name: string;
      description: string;
      type: string;
      confidence: number;
    }>;
    relations: Array<{
      fromNode: string;
      toNode: string;
      relationshipType: string;
      description: string;
      confidence: number;
    }>;
  }> {
    console.log("Processing document with Claude AI for entity extraction");
    
    const prompt = `
Analyze the following text and extract entities (nodes) and relationships between them for a knowledge graph.

Instructions:
1. Identify important entities: people, places, concepts, objects, processes, equipment, materials, organizations
2. Determine meaningful relationships between these entities
3. Provide confidence scores (0.0-1.0) for each extraction
4. Focus on domain-specific concepts and avoid generic words like "the", "and", "of"
5. Extract 5-15 meaningful entities and their relationships

Text to analyze:
${textContent}

Return ONLY a valid JSON object with this exact structure:
{
  "nodes": [
    {
      "name": "Entity Name",
      "description": "Brief description of what this entity represents",
      "type": "person|equipment|process|concept|material|organization|location",
      "confidence": 0.85
    }
  ],
  "relations": [
    {
      "fromNode": "Source Entity Name",
      "toNode": "Target Entity Name", 
      "relationshipType": "USES|CONTROLS|PRODUCES|PART_OF|MANAGES|CONTAINS|REQUIRES|AFFECTS",
      "description": "Brief description of the relationship",
      "confidence": 0.90
    }
  ]
}`;

    try {
      console.log("=== CLAUDE AI EXTRACTION DEBUG ===");
      console.log("Document ID:", documentId);
      console.log("Text content length:", textContent.length);
      console.log("Text preview (first 300 chars):", textContent.substring(0, 300));
      console.log("Full prompt being sent to Claude:");
      console.log(prompt);
      console.log("=== END DEBUG INFO ===");
      
      console.log("Sending request to Claude AI...");
      const startTime = Date.now();
      
      const response = await this.anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: prompt
        }]
      });
      
      console.log(`Claude AI responded in ${Date.now() - startTime}ms`);
      
      const content = response.content[0];
      console.log("=== CLAUDE RESPONSE DEBUG ===");
      console.log("Raw Claude response:", content.text);
      console.log("=== END CLAUDE RESPONSE DEBUG ===");
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      // Clean and parse the JSON response
      let cleanedText = content.text.trim();
      
      // Remove markdown code block markers if present
      if (cleanedText.startsWith('```json')) {
        cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      console.log("=== JSON PARSING DEBUG ===");
      console.log("Cleaned text for parsing:", cleanedText);
      console.log("=== END JSON PARSING DEBUG ===");
      
      const result = JSON.parse(cleanedText);
      
      console.log("=== PARSED RESULT DEBUG ===");
      console.log("Parsed nodes:", result.nodes);
      console.log("Parsed relations:", result.relations);
      console.log("=== END PARSED RESULT DEBUG ===");
      
      // Validate and normalize the response
      if (!result.nodes || !Array.isArray(result.nodes)) {
        throw new Error('Invalid response: missing or invalid nodes array');
      }
      
      if (!result.relations || !Array.isArray(result.relations)) {
        throw new Error('Invalid response: missing or invalid relations array');
      }

      return {
        nodes: result.nodes.map((node: any) => ({
          name: String(node.name || '').trim(),
          description: String(node.description || '').trim(),
          type: String(node.type || 'concept').toLowerCase(),
          confidence: Math.max(0, Math.min(1, Number(node.confidence) || 0.5))
        })),
        relations: result.relations.map((rel: any) => ({
          fromNode: String(rel.fromNode || '').trim(),
          toNode: String(rel.toNode || '').trim(),
          relationshipType: String(rel.relationshipType || 'RELATED_TO').toUpperCase(),
          description: String(rel.description || '').trim(),
          confidence: Math.max(0, Math.min(1, Number(rel.confidence) || 0.5))
        }))
      };
    } catch (error) {
      console.error("Error with Claude API:", error);
      throw new Error(`Failed to extract entities: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async translateNaturalLanguageQuery(query: string): Promise<{
    graphQuery: string;
    queryType: string;
    explanation: string;
  }> {
    console.log("Translating natural language query with Claude AI");
    
    const prompt = `
You are a Neo4j Cypher query translator. Convert the following natural language query into a valid Cypher query.

The graph database contains:
- Nodes with labels: Person, Equipment, Process, Concept, Material, Organization, Location
- Common relationships: USES, CONTROLS, PRODUCES, PART_OF, MANAGES, CONTAINS, REQUIRES, AFFECTS, RELATED_TO
- Node properties: name, description, type, confidence
- Relationship properties: description, confidence

Natural language query: "${query}"

Return ONLY a valid JSON object with this structure:
{
  "graphQuery": "MATCH (n) WHERE n.name CONTAINS 'example' RETURN n LIMIT 10",
  "queryType": "search|analysis|relationship",
  "explanation": "This query searches for nodes containing the term 'example'"
}`;

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: prompt
        }]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      const result = JSON.parse(content.text);
      
      return {
        graphQuery: String(result.graphQuery || '').trim(),
        queryType: String(result.queryType || 'search').toLowerCase(),
        explanation: String(result.explanation || '').trim()
      };
    } catch (error) {
      console.error("Error translating query with Claude:", error);
      throw new Error(`Failed to translate query: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async findSimilarNodes(node1: any, node2: any): Promise<{
    similarityScore: number;
    reasoning: string;
  }> {
    try {
      const prompt = `
Compare these two nodes and determine their similarity score (0.0-1.0).

Node 1:
Name: ${node1.name}
Description: ${node1.description}
Type: ${node1.type}

Node 2:
Name: ${node2.name}
Description: ${node2.description}
Type: ${node2.type}

Consider semantic similarity, context, and domain relevance.

Return ONLY a valid JSON object:
{
  "similarityScore": 0.85,
  "reasoning": "Brief explanation of similarity assessment"
}`;

      const response = await this.anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        messages: [{
          role: "user",
          content: prompt
        }]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      const result = JSON.parse(content.text);
      
      return {
        similarityScore: Math.max(0, Math.min(1, Number(result.similarityScore) || 0)),
        reasoning: String(result.reasoning || '').trim()
      };
    } catch (error) {
      console.error("Error calculating node similarity:", error);
      throw new Error(`Failed to calculate similarity: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export const langfuseService = new LangfuseService();