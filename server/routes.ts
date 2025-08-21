import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import path from "path";
import { promises as fs } from "fs";
import { storage } from "./storage";
import { langfuseService } from "./services/langfuse";
import { neo4jService } from "./services/neo4j";
import { pdfService } from "./services/pdf";
import { db } from "./db";
import { graphRelations, duplicateCandidates, graphNodes } from "@shared/schema";
import { eq, or, inArray } from "drizzle-orm";
import {
  insertDocumentSchema,
  insertGraphNodeSchema,
  insertGraphRelationSchema,
  insertQueryTranslationSchema,
  insertChatMessageSchema,
} from "@shared/schema";

// Define multer request interface
interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

// Configure multer for file uploads
const upload = multer({
  dest: "uploads/",
  fileFilter: (req: any, file: any, cb: any) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Document upload and processing
  app.post("/api/documents/upload", upload.single("file"), async (req: MulterRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const document = await storage.createDocument({
        filename: req.file.filename,
        originalName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        status: "uploaded",
      });

      // Start processing in background
      processDocument(document.id, req.file.path);

      res.json({ document });
    } catch (error) {
      console.error("Error uploading document:", error);
      res.status(500).json({ error: "Failed to upload document" });
    }
  });

  // Get documents
  app.get("/api/documents", async (req, res) => {
    try {
      const documents = await storage.getDocuments();
      res.json({ documents });
    } catch (error) {
      console.error("Error fetching documents:", error);
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  // View document content
  app.get("/api/documents/:id/view", async (req, res) => {
    try {
      const { id } = req.params;
      const document = await storage.getDocument(id);
      
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      res.json({ 
        document: {
          id: document.id,
          originalName: document.originalName,
          filename: document.filename,
          status: document.status,
          uploadedAt: document.uploadedAt,
          fileSize: document.fileSize
        }
      });
    } catch (error) {
      console.error("Error fetching document content:", error);
      res.status(500).json({ error: "Failed to fetch document content" });
    }
  });

  // Serve PDF files directly
  app.get("/api/documents/:id/file", async (req, res) => {
    try {
      const { id } = req.params;
      const document = await storage.getDocument(id);
      
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      const filePath = path.join("uploads", document.filename);
      
      // Check if file exists
      try {
        await fs.access(filePath);
      } catch {
        return res.status(404).json({ error: "File not found" });
      }

      // Set appropriate headers for PDF with CORS and security settings
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${document.originalName}"`);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      
      // Send the file
      res.sendFile(path.resolve(filePath));
    } catch (error) {
      console.error("Error serving document file:", error);
      res.status(500).json({ error: "Failed to serve document file" });
    }
  });

  // Reprocess a document (failed or processed)
  app.post("/api/documents/:id/reprocess", async (req, res) => {
    try {
      console.log("Reprocess route hit with ID:", req.params.id);
      const { id } = req.params;
      const document = await storage.getDocument(id);
      
      if (!document) {
        console.log("Document not found for ID:", id);
        return res.status(404).json({ error: "Document not found" });
      }

      console.log("Found document, starting reprocessing:", document.originalName);
      
      // Clear existing nodes and relations for this document
      // First get all nodes for this document
      const relatedNodes = await storage.getGraphNodesByDocument(id);
      const nodeIds = relatedNodes.map(node => node.id);
      
      if (nodeIds.length > 0) {
        // Use a transaction to ensure all deletions happen atomically
        await db.transaction(async (tx) => {
          // Delete ALL relations that reference any of these nodes (from any document)
          // This includes relations where these nodes are either fromNodeId or toNodeId
          await tx.delete(graphRelations).where(
            or(
              inArray(graphRelations.fromNodeId, nodeIds),
              inArray(graphRelations.toNodeId, nodeIds)
            )
          );
          
          // Delete ALL duplicate candidates that reference any of these nodes
          await tx.delete(duplicateCandidates).where(
            or(
              inArray(duplicateCandidates.nodeId1, nodeIds),
              inArray(duplicateCandidates.nodeId2, nodeIds)
            )
          );
          
          // Now safely delete the nodes using direct DB call
          await tx.delete(graphNodes).where(inArray(graphNodes.id, nodeIds));
        });
      }
      
      // Reset document status to processing
      await storage.updateDocumentStatus(id, "processing");

      // Trigger background processing
      const filePath = path.join("uploads", document.filename);
      console.log("Starting background processing for file:", filePath);
      processDocument(id, filePath).catch(console.error);
      
      res.json({ success: true, message: "Reprocessing started" });
    } catch (error) {
      console.error("Error reprocessing document:", error);
      res.status(500).json({ error: "Failed to reprocess document" });
    }
  });

  // Delete a document
  app.delete("/api/documents/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const document = await storage.getDocument(id);
      
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      // Delete the physical file
      const filePath = path.join("uploads", document.filename);
      try {
        await fs.unlink(filePath);
      } catch (error) {
        console.warn("Could not delete file:", filePath, error);
      }

      // Delete related nodes and relations using the same pattern as reprocess
      const relatedNodes = await storage.getGraphNodesByDocument(id);
      const nodeIds = relatedNodes.map(node => node.id);
      
      if (nodeIds.length > 0) {
        // Use a transaction to ensure all deletions happen atomically
        await db.transaction(async (tx) => {
          // Delete ALL relations that reference any of these nodes
          await tx.delete(graphRelations).where(
            or(
              inArray(graphRelations.fromNodeId, nodeIds),
              inArray(graphRelations.toNodeId, nodeIds)
            )
          );
          
          // Delete ALL duplicate candidates that reference any of these nodes
          await tx.delete(duplicateCandidates).where(
            or(
              inArray(duplicateCandidates.nodeId1, nodeIds),
              inArray(duplicateCandidates.nodeId2, nodeIds)
            )
          );
          
          // Now safely delete the nodes using direct DB call
          await tx.delete(graphNodes).where(inArray(graphNodes.id, nodeIds));
        });
      }

      // Delete the document record
      await storage.deleteDocument(id);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting document:", error);
      res.status(500).json({ error: "Failed to delete document" });
    }
  });

  // Get pending nodes and relations
  app.get("/api/nodes/pending", async (req, res) => {
    try {
      const pendingNodes = await storage.getGraphNodesByStatus("pending");
      const pendingRelations = await storage.getGraphRelationsByStatus("pending");
      res.json({ nodes: pendingNodes, relations: pendingRelations });
    } catch (error) {
      console.error("Error fetching pending items:", error);
      res.status(500).json({ error: "Failed to fetch pending items" });
    }
  });

  // Get approved nodes
  app.get("/api/nodes/approved", async (req, res) => {
    try {
      const approvedNodes = await storage.getGraphNodesByStatus("approved");
      res.json({ nodes: approvedNodes });
    } catch (error) {
      console.error("Error fetching approved nodes:", error);
      res.status(500).json({ error: "Failed to fetch approved nodes" });
    }
  });

  // Approve/reject nodes
  app.patch("/api/nodes/:id/status", async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!["approved", "rejected"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      await storage.updateGraphNodeStatus(id, status);

      // If approved, also create in Neo4j
      if (status === "approved") {
        const node = await storage.getGraphNode(id);
        if (node) {
          console.log("=== NEO4J DEBUG ===");
          console.log("Node data:", JSON.stringify(node, null, 2));
          console.log("Node properties type:", typeof node.properties);
          console.log("Node properties value:", node.properties);
          console.log("=== END NEO4J DEBUG ===");
          
          // Skip Neo4j creation for now - just update PostgreSQL status
          console.log("Successfully updated node status to approved (Neo4j creation skipped for debugging)");
          
          // await neo4jService.createNode({
          //   id: String(node.id),
          //   name: String(node.name),
          //   description: String(node.description || ""),
          //   type: String(node.type)
          // });
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating node status:", error);
      res.status(500).json({ error: "Failed to update node status" });
    }
  });

  // Approve/reject relations
  app.patch("/api/relations/:id/status", async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!["approved", "rejected"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      await storage.updateGraphRelationStatus(id, status);

      // If approved, skip Neo4j for now - just update PostgreSQL status
      if (status === "approved") {
        console.log(`Successfully updated relation ${id} status to approved (Neo4j creation skipped for debugging)`);
        // const relation = await storage.getGraphRelation(id);
        // if (relation) {
        //   await neo4jService.createRelationship({
        //     fromNodeId: relation.fromNodeId,
        //     toNodeId: relation.toNodeId,
        //     relationshipType: relation.relationshipType,
        //   });
        // }
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating relation status:", error);
      res.status(500).json({ error: "Failed to update relation status" });
    }
  });

  // Approve all pending nodes and relations
  app.post("/api/nodes/approve-all", async (req, res) => {
    try {
      const pendingNodes = await storage.getGraphNodesByStatus("pending");
      const pendingRelations = await storage.getGraphRelationsByStatus("pending");
      
      // Approve all pending nodes
      for (const node of pendingNodes) {
        await storage.updateGraphNodeStatus(node.id, "approved");
        console.log(`Approved node: ${node.name} (${node.id})`);
        // TODO: Create in Neo4j when enabled
      }
      
      // Approve all pending relations
      for (const relation of pendingRelations) {
        await storage.updateGraphRelationStatus(relation.id, "approved");
        console.log(`Approved relation: ${relation.fromNodeName} → ${relation.toNodeName} (${relation.id})`);
        // TODO: Create in Neo4j when enabled
      }
      
      res.json({ 
        success: true, 
        approvedNodes: pendingNodes.length,
        approvedRelations: pendingRelations.length 
      });
    } catch (error) {
      console.error("Error approving all items:", error);
      res.status(500).json({ error: "Failed to approve all items" });
    }
  });

  // Delete a node and all its relations
  app.delete("/api/nodes/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      // Find all relations that reference this node
      const nodeRelations = await db
        .select()
        .from(graphRelations)
        .where(or(
          eq(graphRelations.fromNodeId, id),
          eq(graphRelations.toNodeId, id)
        ));
      
      // Delete relations from Neo4j first (when enabled)
      for (const relation of nodeRelations) {
        console.log(`Would delete relation from Neo4j: ${relation.id}`);
        // TODO: Delete from Neo4j when enabled
      }
      
      // Delete node from Neo4j (when enabled)
      console.log(`Would delete node from Neo4j: ${id}`);
      // TODO: Delete from Neo4j when enabled
      
      // Delete relations from PostgreSQL
      await db.delete(graphRelations).where(or(
        eq(graphRelations.fromNodeId, id),
        eq(graphRelations.toNodeId, id)
      ));
      
      // Delete node from PostgreSQL
      await storage.deleteGraphNode(id);
      
      res.json({ success: true, deletedRelations: nodeRelations.length });
    } catch (error) {
      console.error("Error deleting node:", error);
      res.status(500).json({ error: "Failed to delete node" });
    }
  });

  // Delete a relation
  app.delete("/api/relations/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      // Delete from Neo4j first (when enabled)
      console.log(`Would delete relation from Neo4j: ${id}`);
      // TODO: Delete from Neo4j when enabled
      
      // Delete from PostgreSQL
      await storage.deleteGraphRelation(id);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting relation:", error);
      res.status(500).json({ error: "Failed to delete relation" });
    }
  });

  // Run deduplication analysis
  app.post("/api/duplicates/analyze", async (req, res) => {
    try {
      const { threshold = 80 } = req.body;
      const { deduplicationService } = await import("./services/deduplication");
      
      const result = await deduplicationService.runDeduplicationAnalysis(threshold);
      res.json(result);
    } catch (error) {
      console.error("Error running deduplication analysis:", error);
      res.status(500).json({ error: "Failed to run deduplication analysis" });
    }
  });

  // Get duplicate candidates with full node details  
  app.get("/api/duplicates/candidates", async (req, res) => {
    try {
      const candidates = await storage.getDuplicateCandidatesByStatus("pending");
      
      // Enrich candidates with full node details
      const enrichedCandidates = await Promise.all(
        candidates.map(async (candidate) => {
          const node1 = await storage.getGraphNode(candidate.nodeId1);
          const node2 = await storage.getGraphNode(candidate.nodeId2);
          const node1Document = node1?.sourceDocumentId ? await storage.getDocument(node1.sourceDocumentId) : null;
          const node2Document = node2?.sourceDocumentId ? await storage.getDocument(node2.sourceDocumentId) : null;
          
          return {
            ...candidate,
            node1: {
              id: node1?.id,
              name: node1?.name,
              description: node1?.description,
              type: node1?.type,
              documentName: node1Document?.originalName
            },
            node2: {
              id: node2?.id,
              name: node2?.name,  
              description: node2?.description,
              type: node2?.type,
              documentName: node2Document?.originalName
            }
          };
        })
      );
      
      res.json({ candidates: enrichedCandidates });
    } catch (error) {
      console.error("Error fetching duplicate candidates:", error);
      res.status(500).json({ error: "Failed to fetch duplicate candidates" });
    }
  });

  // Merge duplicate candidate
  app.post("/api/duplicates/:id/merge", async (req, res) => {
    try {
      const candidate = await storage.getDuplicateCandidateById(req.params.id);
      if (!candidate) {
        return res.status(404).json({ error: "Candidate not found" });
      }

      // Get the nodes to merge
      const node1 = await storage.getGraphNode(candidate.nodeId1);
      const node2 = await storage.getGraphNode(candidate.nodeId2);
      
      if (!node1 || !node2) {
        return res.status(404).json({ error: "Nodes not found" });
      }

      console.log(`Merging nodes: "${node1.name}" (keeping) and "${node2.name}" (removing)`);

      // Merge logic: keep node1, update all relations pointing to node2 to point to node1
      const relations = await storage.getGraphRelationsByStatus("approved");
      let updatedRelations = 0;
      
      for (const relation of relations) {
        let needsUpdate = false;
        
        if (relation.fromNodeId === candidate.nodeId2 || relation.toNodeId === candidate.nodeId2) {
          // Create updated relation with node1 replacing node2
          const updatedFromNodeId = relation.fromNodeId === candidate.nodeId2 ? candidate.nodeId1 : relation.fromNodeId;
          const updatedToNodeId = relation.toNodeId === candidate.nodeId2 ? candidate.nodeId1 : relation.toNodeId;
          
          // Delete old relation and create new one
          await storage.deleteGraphRelation(relation.id);
          await storage.createGraphRelation({
            ...relation,
            fromNodeId: updatedFromNodeId,
            toNodeId: updatedToNodeId,
            id: undefined // Let database generate new ID
          });
          updatedRelations++;
          console.log(`Updated relation: ${relation.relationshipType} from ${relation.fromNodeId} to ${relation.toNodeId}`);
        }
      }

      // Mark candidate as resolved FIRST (before deleting the node to avoid foreign key constraint)
      await storage.deleteDuplicateCandidate(req.params.id);
      await storage.createDuplicateCandidate({ 
        ...candidate,
        status: "merged" 
      });

      // Then delete node2
      await storage.deleteGraphNode(candidate.nodeId2);

      console.log(`Merge complete: Updated ${updatedRelations} relations, deleted node "${node2.name}"`);
      res.json({ success: true, updatedRelations });
    } catch (error) {
      console.error("Error merging duplicate:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Keep duplicate candidates separate
  app.post("/api/duplicates/:id/keep-separate", async (req, res) => {
    try {
      const candidate = await storage.getDuplicateCandidateById(req.params.id);
      await storage.deleteDuplicateCandidate(req.params.id);
      await storage.createDuplicateCandidate({ 
        ...candidate,
        status: "kept_separate" 
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error keeping duplicates separate:", error);
      res.status(500).json({ error: "Failed to keep duplicates separate" });
    }
  });

  // Equivalence management endpoints
  app.get("/api/equivalences", async (req, res) => {
    try {
      const { defaultEquivalences } = await import("@shared/userEquivalences");
      res.json(defaultEquivalences);
    } catch (error) {
      console.error("Error fetching equivalences:", error);
      res.status(500).json({ error: "Failed to fetch equivalences" });
    }
  });

  app.post("/api/equivalences/nodes", async (req, res) => {
    try {
      const { key, value } = req.body;
      // TODO: Implement persistent storage for user equivalences
      // For now, we'll just return success - this could be stored in database
      res.json({ success: true });
    } catch (error) {
      console.error("Error adding node equivalence:", error);
      res.status(500).json({ error: "Failed to add node equivalence" });
    }
  });

  app.post("/api/equivalences/relations", async (req, res) => {
    try {
      const { key, value } = req.body;
      // TODO: Implement persistent storage for user equivalences
      res.json({ success: true });
    } catch (error) {
      console.error("Error adding relation equivalence:", error);
      res.status(500).json({ error: "Failed to add relation equivalence" });
    }
  });

  app.delete("/api/equivalences/:type", async (req, res) => {
    try {
      const { type } = req.params;
      const { key, value } = req.body;
      // TODO: Implement persistent storage for user equivalences
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing equivalence:", error);
      res.status(500).json({ error: "Failed to remove equivalence" });
    }
  });

  // Get deduplication statistics
  app.get("/api/duplicates/stats", async (req, res) => {
    try {
      const mergedCandidates = await storage.getDuplicateCandidatesByStatus("merged");
      const keptSeparateCandidates = await storage.getDuplicateCandidatesByStatus("kept_separate");
      const totalResolved = mergedCandidates.length + keptSeparateCandidates.length;
      
      const accuracyRate = totalResolved > 0 
        ? Math.round((mergedCandidates.length / totalResolved) * 100 * 100) / 100
        : 0;

      res.json({
        autoMerged: mergedCandidates.length,
        keptSeparate: keptSeparateCandidates.length,
        totalResolved,
        accuracyRate
      });
    } catch (error) {
      console.error("Error fetching duplicate stats:", error);
      res.status(500).json({ error: "Failed to fetch duplicate stats" });
    }
  });

  // Clear all duplicate candidates (for testing)
  app.delete("/api/duplicates/clear-all", async (req, res) => {
    try {
      await db.delete(duplicateCandidates);
      res.json({ success: true, message: "All duplicate candidates cleared" });
    } catch (error) {
      console.error("Error clearing candidates:", error);
      res.status(500).json({ error: "Failed to clear candidates" });
    }
  });

  // Create duplicate candidate manually (for testing)
  app.post("/api/duplicates/candidates", async (req, res) => {
    try {
      const { nodeId1, nodeId2, similarityScore, status = "pending" } = req.body;
      
      const candidate = await storage.createDuplicateCandidate({
        nodeId1,
        nodeId2,
        similarityScore,
        status
      });
      
      res.json({ success: true, candidate });
    } catch (error) {
      console.error("Error creating duplicate candidate:", error);
      res.status(500).json({ error: "Failed to create candidate" });
    }
  });

  // Get graph visualization data
  app.get("/api/graph/visualization", async (req, res) => {
    try {
      const data = await neo4jService.getGraphVisualizationData();
      res.json(data);
    } catch (error) {
      console.error("Error fetching graph data:", error);
      res.status(500).json({ error: "Failed to fetch graph data" });
    }
  });

  // Get graph statistics
  app.get("/api/graph/stats", async (req, res) => {
    try {
      const stats = await neo4jService.getGraphStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching graph stats:", error);
      res.status(500).json({ error: "Failed to fetch graph stats" });
    }
  });

  // Chat endpoints
  app.post("/api/chat/sessions", async (req, res) => {
    try {
      const session = await storage.createChatSession();
      res.json({ session });
    } catch (error) {
      console.error("Error creating chat session:", error);
      res.status(500).json({ error: "Failed to create chat session" });
    }
  });

  app.get("/api/chat/sessions/:id/messages", async (req, res) => {
    try {
      const { id } = req.params;
      const messages = await storage.getChatMessages(id);
      res.json({ messages });
    } catch (error) {
      console.error("Error fetching chat messages:", error);
      res.status(500).json({ error: "Failed to fetch chat messages" });
    }
  });

  app.post("/api/chat/sessions/:id/messages", async (req, res) => {
    try {
      const { id: sessionId } = req.params;
      const { content } = req.body;

      // Create user message
      const userMessage = await storage.createChatMessage({
        sessionId,
        role: "user",
        content,
      });

      // Translate query and execute
      try {
        const translation = await langfuseService.translateNaturalLanguageQuery(content);
        
        // Store the translation
        const queryTranslation = await storage.createQueryTranslation({
          naturalLanguageQuery: content,
          graphQuery: translation.graphQuery,
          queryType: translation.queryType,
          status: "success",
        });

        // Execute the graph query
        const startTime = Date.now();
        const results = await neo4jService.executeQuery(translation.graphQuery);
        const executionTime = Date.now() - startTime;

        // Generate assistant response
        const responseContent = formatQueryResults(results);
        
        const assistantMessage = await storage.createChatMessage({
          sessionId,
          role: "assistant",
          content: responseContent,
          queryTranslationId: queryTranslation.id,
        });

        res.json({ userMessage, assistantMessage, queryTranslation });
      } catch (queryError) {
        // Store failed translation
        await storage.createQueryTranslation({
          naturalLanguageQuery: content,
          graphQuery: "",
          queryType: "cypher",
          status: "failed",
          errorMessage: queryError instanceof Error ? queryError.message : "Unknown error",
        });

        const errorMessage = await storage.createChatMessage({
          sessionId,
          role: "assistant",
          content: "I'm sorry, I couldn't understand your query. Please try rephrasing it or being more specific about what you're looking for.",
        });

        res.json({ userMessage, assistantMessage: errorMessage });
      }
    } catch (error) {
      console.error("Error processing chat message:", error);
      res.status(500).json({ error: "Failed to process chat message" });
    }
  });

  // Developer console endpoints
  app.get("/api/dev/query-translations", async (req, res) => {
    try {
      const translations = await storage.getQueryTranslations();
      res.json({ translations });
    } catch (error) {
      console.error("Error fetching query translations:", error);
      res.status(500).json({ error: "Failed to fetch query translations" });
    }
  });

  app.patch("/api/dev/query-translations/:id/approve", async (req, res) => {
    try {
      const { id } = req.params;
      const { approved } = req.body;
      
      await storage.updateQueryTranslationApproval(id, approved);
      res.json({ success: true });
    } catch (error) {
      console.error("Error approving query translation:", error);
      res.status(500).json({ error: "Failed to approve query translation" });
    }
  });

  app.post("/api/dev/execute-query", async (req, res) => {
    try {
      const { query } = req.body;
      
      if (!query) {
        return res.status(400).json({ error: "Query is required" });
      }

      const results = await neo4jService.executeQuery(query);
      res.json({ results });
    } catch (error) {
      console.error("Error executing manual query:", error);
      res.status(500).json({ error: "Failed to execute query" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

// Background processing function
async function processDocument(documentId: string, filePath: string) {
  try {
    await storage.updateDocumentStatus(documentId, "processing");

    // Extract text from PDF
    const textContent = await pdfService.extractText(filePath);
    await storage.updateDocumentContent(documentId, textContent);

    // Extract nodes and relations using Langfuse
    const extraction = await langfuseService.extractNodesAndRelations(textContent, documentId);

    // Store extracted nodes
    for (const nodeData of extraction.nodes) {
      await storage.createGraphNode({
        name: nodeData.name,
        description: nodeData.description,
        type: nodeData.type,
        confidence: nodeData.confidence.toString(),
        sourceDocumentId: documentId,
        status: "pending",
      });
    }

    // Store extracted relations
    for (const relationData of extraction.relations) {
      // Find the actual node IDs (simplified - in reality would need better matching)
      const fromNodeCandidates = await storage.getGraphNodesByStatus("pending");
      const toNodeCandidates = await storage.getGraphNodesByStatus("pending");
      
      const fromNode = fromNodeCandidates.find(n => n.name === relationData.fromNode);
      const toNode = toNodeCandidates.find(n => n.name === relationData.toNode);

      if (fromNode && toNode) {
        await storage.createGraphRelation({
          fromNodeId: fromNode.id,
          toNodeId: toNode.id,
          relationshipType: relationData.relationshipType,
          description: relationData.description,
          confidence: relationData.confidence.toString(),
          sourceDocumentId: documentId,
          status: "pending",
        });
      }
    }

    await storage.updateDocumentStatus(documentId, "processed");
  } catch (error) {
    console.error("Error processing document:", error);
    await storage.updateDocumentStatus(
      documentId,
      "failed",
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}

function formatQueryResults(results: any[]): string {
  if (results.length === 0) {
    return "No results found for your query.";
  }

  // Format results in a human-readable way
  let response = `Found ${results.length} result(s):\n\n`;
  
  results.slice(0, 10).forEach((result, index) => {
    response += `${index + 1}. `;
    const entries = Object.entries(result);
    entries.forEach(([key, value], i) => {
      response += `${key}: ${value}`;
      if (i < entries.length - 1) response += ", ";
    });
    response += "\n";
  });

  if (results.length > 10) {
    response += `\n... and ${results.length - 10} more results.`;
  }

  return response;
}
