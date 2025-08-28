import neo4j, { Driver } from "neo4j-driver";

export class Neo4jService {
  private driver: Driver;

  constructor() {
    const uri = process.env.NEO4J_URI || "bolt://localhost:7687";
    const username = process.env.NEO4J_USERNAME || "neo4j";
    const password = process.env.NEO4J_PASSWORD || "";

    if (!password) {
      throw new Error("NEO4J_PASSWORD must be provided");
    }

    this.driver = neo4j.driver(uri, neo4j.auth.basic(username, password));
  }

  async createNode(node: {
    id: string;
    name: string;
    description?: string;
    type: string;
    category?: string;
    properties?: any;
  }): Promise<void> {
    const session = this.driver.session();
    try {
      // Create a safe node type label (remove spaces and special chars)
      let safeType = node.type.replace(/[^a-zA-Z0-9_]/g, '_') || 'Entity';
      
      // Ensure label doesn't start with a number (Neo4j requirement)
      if (/^\d/.test(safeType)) {
        safeType = 'node_' + safeType;
      }
      
      await session.run(
        `CREATE (n:${safeType} {
          id: $id,
          name: $name,
          description: $description,
          type: $type,
          category: $category
        })`,
        {
          id: node.id,
          name: node.name,
          description: node.description || "",
          type: node.type,
          category: node.category || node.type
        }
      );
    } finally {
      await session.close();
    }
  }

  async createRelationship(relation: {
    fromNodeId: string;
    toNodeId: string;
    relationshipType: string;
    properties?: any;
  }): Promise<void> {
    const session = this.driver.session();
    try {
      // Create a safe relationship type (remove spaces and special chars)
      const safeRelType = relation.relationshipType.replace(/[^a-zA-Z0-9_]/g, '_') || 'RELATES_TO';
      
      await session.run(
        `MATCH (from {id: $fromId}), (to {id: $toId})
         CREATE (from)-[r:${safeRelType}]->(to)`,
        {
          fromId: relation.fromNodeId,
          toId: relation.toNodeId
        }
      );
    } finally {
      await session.close();
    }
  }

  async executeQuery(query: string, parameters: any = {}): Promise<any[]> {
    const session = this.driver.session();
    try {
      const result = await session.run(query, parameters);
      return result.records.map(record => record.toObject());
    } finally {
      await session.close();
    }
  }

  async getGraphStats(): Promise<{
    totalNodes: number;
    totalRelations: number;
    nodeTypes: Array<{ type: string; count: number }>;
  }> {
    const session = this.driver.session();
    try {
      const nodeCountResult = await session.run("MATCH (n) RETURN count(n) as count");
      const relationCountResult = await session.run("MATCH ()-[r]->() RETURN count(r) as count");
      const nodeTypesResult = await session.run(
        "MATCH (n) RETURN labels(n)[0] as type, count(n) as count ORDER BY count DESC"
      );

      const totalNodes = nodeCountResult.records[0]?.get("count").toNumber() || 0;
      const totalRelations = relationCountResult.records[0]?.get("count").toNumber() || 0;
      const nodeTypes = nodeTypesResult.records.map(record => ({
        type: record.get("type"),
        count: record.get("count").toNumber()
      }));

      return { totalNodes, totalRelations, nodeTypes };
    } finally {
      await session.close();
    }
  }

  async getGraphVisualizationData(): Promise<{
    nodes: Array<{ id: string; name: string; type: string; category?: string; group: number }>;
    links: Array<{ source: string; target: string; type: string }>;
  }> {
    const session = this.driver.session();
    try {
      const result = await session.run(`
        MATCH (n)-[r]->(m)
        RETURN n.id as sourceId, n.name as sourceName, labels(n)[0] as sourceType,
               n.category as sourceCategory, n.type as sourceOriginalType,
               m.id as targetId, m.name as targetName, labels(m)[0] as targetType,
               m.category as targetCategory, m.type as targetOriginalType,
               type(r) as relationType
        LIMIT 1000
      `);

      const nodeMap = new Map();
      const links: Array<{ source: string; target: string; type: string }> = [];

      result.records.forEach(record => {
        const sourceId = record.get("sourceId");
        const sourceName = record.get("sourceName");
        const sourceType = record.get("sourceType");
        const sourceCategory = record.get("sourceCategory");
        const sourceOriginalType = record.get("sourceOriginalType");
        const targetId = record.get("targetId");
        const targetName = record.get("targetName");
        const targetType = record.get("targetType");
        const targetCategory = record.get("targetCategory");
        const targetOriginalType = record.get("targetOriginalType");
        const relationType = record.get("relationType");

        // Add nodes to map - use category for coloring if available
        nodeMap.set(sourceId, {
          id: sourceId,
          name: sourceName,
          type: sourceCategory || sourceOriginalType || sourceType,  // Use category for color mapping
          category: sourceCategory,
          group: this.getNodeGroup(sourceType)
        });
        nodeMap.set(targetId, {
          id: targetId,
          name: targetName,
          type: targetCategory || targetOriginalType || targetType,  // Use category for color mapping
          category: targetCategory,
          group: this.getNodeGroup(targetType)
        });

        // Add link
        links.push({
          source: sourceId,
          target: targetId,
          type: relationType
        });
      });

      return {
        nodes: Array.from(nodeMap.values()),
        links
      };
    } finally {
      await session.close();
    }
  }

  private getNodeGroup(type: string): number {
    const typeGroups: { [key: string]: number } = {
      'Entity': 1,
      'Concept': 2,
      'Process': 3,
      'Equipment': 4,
      'Material': 5
    };
    return typeGroups[type] || 0;
  }

  async close(): Promise<void> {
    await this.driver.close();
  }
}

export const neo4jService = new Neo4jService();
