import { Neo4jService } from '../neo4j';

interface QueryTemplate {
  pattern: RegExp;
  domain: string;
  template: string;
  extractor: (match: RegExpMatchArray) => Record<string, any>;
  description: string;
}

export class TemplateQueryEngine {
  private templates: QueryTemplate[];

  constructor(private neo4jService: Neo4jService) {
    this.templates = this.initializeTemplates();
  }

  private initializeTemplates(): QueryTemplate[] {
    return [
      // General node queries - HIGHEST PRIORITY
      {
        pattern: /^(?:which|what|show me|list all|show all|get all)?\s*nodes?\s*(?:do you have|exist|are there|in the graph)?.*$/i,
        domain: 'general',
        description: 'Show all nodes in the graph',
        template: `
          MATCH (n) 
          WITH n.type as type, count(*) as typeCount, collect(n)[..5] as samples
          RETURN type, typeCount, 
                 [s in samples | {name: s.name, description: s.description}] as examples
          ORDER BY typeCount DESC
        `,
        extractor: (match) => ({})
      },
      {
        pattern: /^(?:show|list|get|what are|which are)\s*(?:all\s*)?(?:the\s*)?nodes?$/i,
        domain: 'general',
        description: 'Show all nodes simple',
        template: `
          MATCH (n) 
          RETURN n.name as name, n.type as type, n.description as description 
          LIMIT 50
        `,
        extractor: (match) => ({})
      },
      {
        pattern: /^(?:what|which|show me|list)\s+types?\s+(?:of\s+)?nodes?/i,
        domain: 'general',
        description: 'Show node types',
        template: `
          MATCH (n) 
          RETURN DISTINCT n.type as nodeType, count(*) as count 
          ORDER BY count DESC
        `,
        extractor: (match) => ({})
      },
      // Recipe/Ingredient domain templates
      {
        pattern: /(?:what|which|show me|list|find|get|^)\s*(?:are\s+)?(?:the\s+)?ingredients?\s+(?:are\s+)?(?:for|of|in)\s+(.+)/i,
        domain: 'recipe',
        description: 'Find ingredients for a specific recipe/dish',
        template: `
          MATCH (ingredient)-[r]->(dish) 
          WHERE type(r) IN ['PART_OF', 'CONTAINS']
                AND toLower(dish.name) CONTAINS toLower($entityName)
                AND ingredient.type = 'ingredient'
          WITH dish.name as entity, 
               collect(DISTINCT {
                 name: ingredient.name, 
                 description: ingredient.description,
                 type: ingredient.type
               }) as ingredients
          RETURN entity, ingredients
        `,
        extractor: (match) => ({ entityName: match[1].trim().replace(/[?!.,;:]$/, '') })
      },
      {
        pattern: /(?:what|which|show me|list|find|get|^)\s*(?:recipes?|dishes?|meals?)\s+(?:with|containing|using|that have|use)\s+(.+)/i,
        domain: 'recipe',
        description: 'Find recipes containing a specific ingredient',
        template: `
          MATCH (ingredient)-[r]->(recipe)
          WHERE type(r) IN ['PART_OF', 'CONTAINS']
                AND toLower(ingredient.name) CONTAINS toLower($ingredientName) 
                AND ingredient.type = 'ingredient'
                AND recipe.type IN ['recipe', 'dish', 'meal']
          WITH ingredient.name as searchedIngredient,
               collect(DISTINCT {
                 name: recipe.name, 
                 description: recipe.description,
                 type: recipe.type
               }) as recipes
          RETURN searchedIngredient, recipes
        `,
        extractor: (match) => ({ ingredientName: match[1].trim().replace(/[?!.,;:]$/, '') })
      },
      {
        pattern: /(?:what is|describe|tell me about|explain)\s+(.+)/i,
        domain: 'general',
        description: 'Find specific entity by name',
        template: `
          MATCH (n) 
          WHERE toLower(n.name) CONTAINS toLower($entityName)
          OPTIONAL MATCH (n)-[r]-(related)
          RETURN n as entity,
                 collect(DISTINCT {
                   relationship: type(r),
                   node: related.name,
                   nodeType: related.type
                 }) as relationships
          LIMIT 5
        `,
        extractor: (match) => ({ entityName: match[1].trim().replace(/[?!.,;:]$/, '') })
      },
      // Component/System templates
      {
        pattern: /(?:what|which|show me|list)\s+(?:components?|parts?)\s+(?:of|in|for)\s+(.+)/i,
        domain: 'technical',
        description: 'Find components of a system',
        template: `
          MATCH (system)
          WHERE toLower(system.name) CONTAINS toLower($systemName)
          OPTIONAL MATCH (system)-[r:HAS_COMPONENT|PART_OF|CONTAINS]-(component)
          RETURN system.name as systemName,
                 system.type as systemType,
                 collect(DISTINCT {
                   name: component.name,
                   type: component.type,
                   description: component.description
                 }) as components
        `,
        extractor: (match) => ({ systemName: match[1].trim() })
      },
      // Process/Step templates
      {
        pattern: /(?:how to|steps to|process for|procedure for)\s+(.+)/i,
        domain: 'process',
        description: 'Find process or steps',
        template: `
          MATCH (process)
          WHERE toLower(process.name) CONTAINS toLower($processName)
                OR toLower(process.description) CONTAINS toLower($processName)
          OPTIONAL MATCH (process)-[r:REQUIRES|USES|PRODUCES]-(related)
          RETURN process.name as processName,
                 process.description as description,
                 collect(DISTINCT {
                   relationship: type(r),
                   name: related.name,
                   type: related.type
                 }) as relatedEntities
        `,
        extractor: (match) => ({ processName: match[1].trim() })
      },
      // Relationship queries
      {
        pattern: /(?:how|what)\s+(?:does|is)\s+(.+?)\s+(?:connected to|related to|linked to|associated with)\s+(.+)/i,
        domain: 'relationship',
        description: 'Find relationship between two entities',
        template: `
          MATCH path = shortestPath((n1)-[*..3]-(n2))
          WHERE toLower(n1.name) CONTAINS toLower($entity1)
                AND toLower(n2.name) CONTAINS toLower($entity2)
          RETURN n1.name as source,
                 n2.name as target,
                 [rel in relationships(path) | type(rel)] as relationshipPath,
                 length(path) as pathLength
        `,
        extractor: (match) => ({ entity1: match[1].trim(), entity2: match[2].trim() })
      },
      // Count/Statistics queries
      {
        pattern: /(?:how many|count|number of)\s+(.+)/i,
        domain: 'statistics',
        description: 'Count entities',
        template: `
          MATCH (n)
          WHERE toLower(n.type) CONTAINS toLower($entityType)
                OR toLower(n.name) CONTAINS toLower($entityType)
          RETURN count(n) as count,
                 n.type as type,
                 collect(DISTINCT n.name)[..10] as examples
          GROUP BY n.type
        `,
        extractor: (match) => ({ entityType: match[1].trim() })
      },
    ];
  }

  async processQuery(userQuery: string): Promise<{
    success: boolean;
    method: string;
    domain?: string;
    cypher?: string;
    parameters?: Record<string, any>;
    results?: any[];
    error?: string;
    suggestion?: string;
    matchedPattern?: string;
  }> {
    console.log(`[TemplateEngine] Processing query: ${userQuery}`);
    
    for (const template of this.templates) {
      const match = userQuery.match(template.pattern);
      if (match) {
        try {
          const parameters = template.extractor(match);
          console.log(`[TemplateEngine] Matched pattern: ${template.description}`);
          console.log(`[TemplateEngine] Parameters:`, parameters);
          
          const results = await this.neo4jService.executeQuery(template.template, parameters);
          
          return {
            success: true,
            method: 'template',
            domain: template.domain,
            cypher: template.template,
            parameters,
            results,
            matchedPattern: template.description
          };
        } catch (error) {
          console.error('[TemplateEngine] Query execution failed:', error);
          continue;
        }
      }
    }
    
    return { 
      success: false, 
      method: 'template',
      error: 'No matching template found',
      suggestion: 'Try rephrasing your query using terms like: "show me", "list all", "ingredients for", "components of", etc.'
    };
  }

  getAvailablePatterns(): string[] {
    return this.templates.map(t => t.description);
  }
}