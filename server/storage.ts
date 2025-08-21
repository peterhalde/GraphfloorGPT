import {
  users,
  documents,
  graphNodes,
  graphRelations,
  duplicateCandidates,
  queryTranslations,
  chatSessions,
  chatMessages,
  type User,
  type InsertUser,
  type Document,
  type InsertDocument,
  type GraphNode,
  type InsertGraphNode,
  type GraphRelation,
  type InsertGraphRelation,
  type DuplicateCandidate,
  type InsertDuplicateCandidate,
  type QueryTranslation,
  type InsertQueryTranslation,
  type ChatSession,
  type InsertChatSession,
  type ChatMessage,
  type InsertChatMessage,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or, like, gte, lte, inArray, sql } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Documents
  createDocument(document: InsertDocument): Promise<Document>;
  getDocument(id: string): Promise<Document | undefined>;
  getDocuments(): Promise<Document[]>;
  updateDocumentStatus(id: string, status: string, errorMessage?: string): Promise<void>;
  updateDocumentContent(id: string, textContent: string): Promise<void>;
  deleteDocument(id: string): Promise<void>;

  // Graph Nodes
  createGraphNode(node: InsertGraphNode): Promise<GraphNode>;
  getGraphNode(id: string): Promise<GraphNode | undefined>;
  getGraphNodesByStatus(status: string): Promise<GraphNode[]>;
  getGraphNodesByDocument(documentId: string): Promise<GraphNode[]>;
  updateGraphNodeStatus(id: string, status: string): Promise<void>;
  deleteGraphNode(id: string): Promise<void>;
  getGraphNodesWithRelations(): Promise<GraphNode[]>;

  // Graph Relations
  createGraphRelation(relation: InsertGraphRelation): Promise<GraphRelation>;
  getGraphRelation(id: string): Promise<GraphRelation | undefined>;
  getGraphRelationsByStatus(status: string): Promise<GraphRelation[]>;
  getGraphRelationsByDocument(documentId: string): Promise<GraphRelation[]>;
  updateGraphRelationStatus(id: string, status: string): Promise<void>;
  deleteGraphRelation(id: string): Promise<void>;

  // Duplicate Candidates
  createDuplicateCandidate(candidate: InsertDuplicateCandidate): Promise<DuplicateCandidate>;
  getDuplicateCandidatesByStatus(status: string): Promise<DuplicateCandidate[]>;
  updateDuplicateCandidateStatus(id: string, status: string): Promise<void>;

  // Query Translations
  createQueryTranslation(translation: InsertQueryTranslation): Promise<QueryTranslation>;
  getQueryTranslations(): Promise<QueryTranslation[]>;
  updateQueryTranslationApproval(id: string, approved: boolean): Promise<void>;

  // Chat
  createChatSession(): Promise<ChatSession>;
  getChatSession(id: string): Promise<ChatSession | undefined>;
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  getChatMessages(sessionId: string): Promise<ChatMessage[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async createDocument(document: InsertDocument): Promise<Document> {
    const [doc] = await db.insert(documents).values(document).returning();
    return doc;
  }

  async getDocument(id: string): Promise<Document | undefined> {
    const [doc] = await db.select().from(documents).where(eq(documents.id, id));
    return doc || undefined;
  }

  async getDocuments(): Promise<Document[]> {
    return await db.select().from(documents).orderBy(desc(documents.uploadedAt));
  }

  async updateDocumentStatus(id: string, status: string, errorMessage?: string): Promise<void> {
    await db
      .update(documents)
      .set({ status, errorMessage })
      .where(eq(documents.id, id));
  }

  async updateDocumentContent(id: string, textContent: string): Promise<void> {
    await db
      .update(documents)
      .set({ textContent })
      .where(eq(documents.id, id));
  }

  async deleteDocument(id: string): Promise<void> {
    await db.delete(documents).where(eq(documents.id, id));
  }

  async createGraphNode(node: InsertGraphNode): Promise<GraphNode> {
    const [graphNode] = await db.insert(graphNodes).values(node).returning();
    return graphNode;
  }

  async getGraphNode(id: string): Promise<GraphNode | undefined> {
    const [node] = await db.select().from(graphNodes).where(eq(graphNodes.id, id));
    return node || undefined;
  }

  async getGraphNodesByStatus(status: string): Promise<GraphNode[]> {
    return await db
      .select({
        id: graphNodes.id,
        name: graphNodes.name,
        description: graphNodes.description,
        type: graphNodes.type,
        properties: graphNodes.properties,
        sourceDocumentId: graphNodes.sourceDocumentId,
        sourceDocumentName: documents.originalName,
        confidence: graphNodes.confidence,
        status: graphNodes.status,
        createdAt: graphNodes.createdAt,
        approvedAt: graphNodes.approvedAt,
      })
      .from(graphNodes)
      .leftJoin(documents, eq(graphNodes.sourceDocumentId, documents.id))
      .where(eq(graphNodes.status, status))
      .orderBy(desc(graphNodes.createdAt));
  }

  async getGraphNodesByDocument(documentId: string): Promise<GraphNode[]> {
    return await db
      .select()
      .from(graphNodes)
      .where(eq(graphNodes.sourceDocumentId, documentId))
      .orderBy(desc(graphNodes.createdAt));
  }

  async updateGraphNodeStatus(id: string, status: string): Promise<void> {
    await db
      .update(graphNodes)
      .set({ status, approvedAt: status === "approved" ? new Date() : null })
      .where(eq(graphNodes.id, id));
  }

  async deleteGraphNode(id: string): Promise<void> {
    await db.delete(graphNodes).where(eq(graphNodes.id, id));
  }

  async deleteGraphNode(id: string): Promise<void> {
    await db.delete(graphNodes).where(eq(graphNodes.id, id));
  }

  async getGraphNodesWithRelations(): Promise<GraphNode[]> {
    return await db
      .select()
      .from(graphNodes)
      .where(eq(graphNodes.status, "approved"))
      .orderBy(desc(graphNodes.createdAt));
  }

  async createGraphRelation(relation: InsertGraphRelation): Promise<GraphRelation> {
    const [graphRelation] = await db.insert(graphRelations).values(relation).returning();
    return graphRelation;
  }

  async getGraphRelation(id: string): Promise<GraphRelation | undefined> {
    const [relation] = await db.select().from(graphRelations).where(eq(graphRelations.id, id));
    return relation || undefined;
  }

  async getGraphRelationsByStatus(status: string): Promise<any[]> {
    // Use raw SQL to get relations with node names since we need to join the same table twice
    const result = await db.execute(sql`
      SELECT 
        r.id,
        r.from_node_id as "fromNodeId",
        r.to_node_id as "toNodeId", 
        fn.name as "fromNodeName",
        tn.name as "toNodeName",
        r.relationship_type as "relationshipType",
        r.description,
        r.properties,
        r.source_document_id as "sourceDocumentId",
        d.original_name as "sourceDocumentName",
        r.confidence,
        r.status,
        r.created_at as "createdAt",
        r.approved_at as "approvedAt"
      FROM graph_relations r
      LEFT JOIN graph_nodes fn ON r.from_node_id = fn.id
      LEFT JOIN graph_nodes tn ON r.to_node_id = tn.id
      LEFT JOIN documents d ON r.source_document_id = d.id
      WHERE r.status = ${status}
      ORDER BY r.created_at DESC
    `);
    
    return result.rows;
  }

  async getGraphRelationsByDocument(documentId: string): Promise<GraphRelation[]> {
    return await db
      .select()
      .from(graphRelations)
      .where(eq(graphRelations.sourceDocumentId, documentId))
      .orderBy(desc(graphRelations.createdAt));
  }

  async updateGraphRelationStatus(id: string, status: string): Promise<void> {
    await db
      .update(graphRelations)
      .set({ status, approvedAt: status === "approved" ? new Date() : null })
      .where(eq(graphRelations.id, id));
  }

  async deleteGraphRelation(id: string): Promise<void> {
    await db.delete(graphRelations).where(eq(graphRelations.id, id));
  }

  async createDuplicateCandidate(candidate: InsertDuplicateCandidate): Promise<DuplicateCandidate> {
    const [duplicateCandidate] = await db.insert(duplicateCandidates).values(candidate).returning();
    return duplicateCandidate;
  }

  async getDuplicateCandidatesByStatus(status: string): Promise<DuplicateCandidate[]> {
    return await db
      .select()
      .from(duplicateCandidates)
      .where(eq(duplicateCandidates.status, status))
      .orderBy(desc(duplicateCandidates.createdAt));
  }

  async updateDuplicateCandidateStatus(id: string, status: string): Promise<void> {
    await db
      .update(duplicateCandidates)
      .set({ status, resolvedAt: new Date() })
      .where(eq(duplicateCandidates.id, id));
  }

  async getDuplicateCandidateById(id: string): Promise<DuplicateCandidate | undefined> {
    const [candidate] = await db.select().from(duplicateCandidates).where(eq(duplicateCandidates.id, id));
    return candidate || undefined;
  }

  async getDuplicateCandidateByNodePair(nodeId1: string, nodeId2: string): Promise<DuplicateCandidate | undefined> {
    const [candidate] = await db
      .select()
      .from(duplicateCandidates)
      .where(
        or(
          and(eq(duplicateCandidates.nodeId1, nodeId1), eq(duplicateCandidates.nodeId2, nodeId2)),
          and(eq(duplicateCandidates.nodeId1, nodeId2), eq(duplicateCandidates.nodeId2, nodeId1))
        )
      );
    return candidate || undefined;
  }

  async deleteDuplicateCandidate(candidateId: string): Promise<void> {
    await db.delete(duplicateCandidates).where(eq(duplicateCandidates.id, candidateId));
  }

  async redirectNodeRelations(fromNodeId: string, toNodeId: string): Promise<void> {
    // Update outgoing relations (where fromNodeId is the source)
    await db
      .update(graphRelations)
      .set({ fromNodeId: toNodeId })
      .where(eq(graphRelations.fromNodeId, fromNodeId));

    // Update incoming relations (where fromNodeId is the target)
    await db
      .update(graphRelations)
      .set({ toNodeId: toNodeId })
      .where(eq(graphRelations.toNodeId, fromNodeId));
  }

  async createQueryTranslation(translation: InsertQueryTranslation): Promise<QueryTranslation> {
    const [queryTranslation] = await db.insert(queryTranslations).values(translation).returning();
    return queryTranslation;
  }

  async getQueryTranslations(): Promise<QueryTranslation[]> {
    return await db
      .select()
      .from(queryTranslations)
      .orderBy(desc(queryTranslations.createdAt));
  }

  async updateQueryTranslationApproval(id: string, approved: boolean): Promise<void> {
    await db
      .update(queryTranslations)
      .set({ approved })
      .where(eq(queryTranslations.id, id));
  }

  async createChatSession(): Promise<ChatSession> {
    const [session] = await db.insert(chatSessions).values({}).returning();
    return session;
  }

  async getChatSession(id: string): Promise<ChatSession | undefined> {
    const [session] = await db.select().from(chatSessions).where(eq(chatSessions.id, id));
    return session || undefined;
  }

  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const [chatMessage] = await db.insert(chatMessages).values(message).returning();
    return chatMessage;
  }

  async getChatMessages(sessionId: string): Promise<ChatMessage[]> {
    return await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(chatMessages.timestamp);
  }
}

export const storage = new DatabaseStorage();
