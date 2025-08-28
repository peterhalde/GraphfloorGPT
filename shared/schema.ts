import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, jsonb, boolean, uuid, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const documents = pgTable("documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: text("mime_type").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  status: text("status").notNull().default("uploaded"), // uploaded, processing, processed, failed
  textContent: text("text_content"),
  errorMessage: text("error_message"),
});

export const graphNodes = pgTable("graph_nodes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type").notNull(), // entity, concept, etc.
  properties: jsonb("properties").default({}),
  sourceDocumentId: varchar("source_document_id").references(() => documents.id),
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  status: text("status").notNull().default("pending"), // pending, approved, rejected
  createdAt: timestamp("created_at").defaultNow().notNull(),
  approvedAt: timestamp("approved_at"),
});

export const graphRelations = pgTable("graph_relations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fromNodeId: varchar("from_node_id").references(() => graphNodes.id).notNull(),
  toNodeId: varchar("to_node_id").references(() => graphNodes.id).notNull(),
  relationshipType: text("relationship_type").notNull(),
  description: text("description"),
  properties: jsonb("properties").default({}),
  sourceDocumentId: varchar("source_document_id").references(() => documents.id),
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  status: text("status").notNull().default("pending"), // pending, approved, rejected
  createdAt: timestamp("created_at").defaultNow().notNull(),
  approvedAt: timestamp("approved_at"),
});

export const duplicateCandidates = pgTable("duplicate_candidates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nodeId1: varchar("node_id_1").references(() => graphNodes.id).notNull(),
  nodeId2: varchar("node_id_2").references(() => graphNodes.id).notNull(),
  similarityScore: decimal("similarity_score", { precision: 5, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"), // pending, merged, kept_separate
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
});

export const queryTranslations = pgTable("query_translations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  naturalLanguageQuery: text("natural_language_query").notNull(),
  graphQuery: text("graph_query").notNull(),
  queryType: text("query_type").notNull(), // cypher, etc.
  executionTime: integer("execution_time"), // in milliseconds
  resultCount: integer("result_count"),
  status: text("status").notNull().default("success"), // success, failed
  errorMessage: text("error_message"),
  approved: boolean("approved").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const categories = pgTable("categories", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const chatSessions = pgTable("chat_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => chatSessions.id).notNull(),
  role: text("role").notNull(), // user, assistant
  content: text("content").notNull(),
  queryTranslationId: varchar("query_translation_id").references(() => queryTranslations.id),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Relations
export const documentsRelations = relations(documents, ({ many }) => ({
  nodes: many(graphNodes),
  relations: many(graphRelations),
}));

export const graphNodesRelations = relations(graphNodes, ({ one, many }) => ({
  sourceDocument: one(documents, {
    fields: [graphNodes.sourceDocumentId],
    references: [documents.id],
  }),
  outgoingRelations: many(graphRelations, { relationName: "fromNode" }),
  incomingRelations: many(graphRelations, { relationName: "toNode" }),
}));

export const graphRelationsRelations = relations(graphRelations, ({ one }) => ({
  fromNode: one(graphNodes, {
    fields: [graphRelations.fromNodeId],
    references: [graphNodes.id],
    relationName: "fromNode",
  }),
  toNode: one(graphNodes, {
    fields: [graphRelations.toNodeId],
    references: [graphNodes.id],
    relationName: "toNode",
  }),
  sourceDocument: one(documents, {
    fields: [graphRelations.sourceDocumentId],
    references: [documents.id],
  }),
}));

export const duplicateCandidatesRelations = relations(duplicateCandidates, ({ one }) => ({
  node1: one(graphNodes, {
    fields: [duplicateCandidates.nodeId1],
    references: [graphNodes.id],
    relationName: "node1",
  }),
  node2: one(graphNodes, {
    fields: [duplicateCandidates.nodeId2],
    references: [graphNodes.id],
    relationName: "node2",
  }),
}));

export const chatSessionsRelations = relations(chatSessions, ({ many }) => ({
  messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  session: one(chatSessions, {
    fields: [chatMessages.sessionId],
    references: [chatSessions.id],
  }),
  queryTranslation: one(queryTranslations, {
    fields: [chatMessages.queryTranslationId],
    references: [queryTranslations.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  uploadedAt: true,
});

export const insertGraphNodeSchema = createInsertSchema(graphNodes).omit({
  id: true,
  createdAt: true,
  approvedAt: true,
});

export const insertGraphRelationSchema = createInsertSchema(graphRelations).omit({
  id: true,
  createdAt: true,
  approvedAt: true,
});

export const insertDuplicateCandidateSchema = createInsertSchema(duplicateCandidates).omit({
  id: true,
  createdAt: true,
  resolvedAt: true,
});

export const insertQueryTranslationSchema = createInsertSchema(queryTranslations).omit({
  id: true,
  createdAt: true,
});

export const insertChatSessionSchema = createInsertSchema(chatSessions).omit({
  id: true,
  createdAt: true,
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  timestamp: true,
});

export const insertCategorySchema = createInsertSchema(categories).omit({
  createdAt: true,
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

export type InsertGraphNode = z.infer<typeof insertGraphNodeSchema>;
export type GraphNode = typeof graphNodes.$inferSelect;

export type InsertGraphRelation = z.infer<typeof insertGraphRelationSchema>;
export type GraphRelation = typeof graphRelations.$inferSelect;

export type InsertDuplicateCandidate = z.infer<typeof insertDuplicateCandidateSchema>;
export type DuplicateCandidate = typeof duplicateCandidates.$inferSelect;

export type InsertQueryTranslation = z.infer<typeof insertQueryTranslationSchema>;
export type QueryTranslation = typeof queryTranslations.$inferSelect;

export type InsertChatSession = z.infer<typeof insertChatSessionSchema>;
export type ChatSession = typeof chatSessions.$inferSelect;

export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;

export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categories.$inferSelect;
