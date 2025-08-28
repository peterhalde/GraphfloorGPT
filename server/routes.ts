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
import { graphRelations, duplicateCandidates, graphNodes, categories } from "@shared/schema";
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
  
  // Test endpoint to verify routing works
  app.get("/api/test", (req, res) => {
    console.log("Test endpoint hit!");
    res.json({ message: "Test endpoint works", timestamp: new Date().toISOString() });
  });
  
  // Model management endpoints - moved to top for testing
  app.get("/api/models/available", async (req, res) => {
    console.log("Models available endpoint hit - START OF HANDLER!");
    
    // Use real modelProvider
    try {
      const { modelProvider } = await import('./services/llm/modelProvider');
      const available = modelProvider.getAvailableProviders();
      const current = modelProvider.getCurrentConfig();
      
      const response = {
        current,
        available
      };
      
      console.log("Sending real response:", response);
      return res.json(response);
    } catch (error: any) {
      console.error("Error in models endpoint:", error);
      return res.status(500).json({ 
        error: "Failed to fetch models",
        details: error.message 
      });
    }
  });

  app.post("/api/models/select", async (req, res) => {
    try {
      const { provider, model, temperature, maxTokens } = req.body;
      
      if (!provider || !model) {
        return res.status(400).json({ error: "Provider and model are required" });
      }
      
      const { modelProvider } = await import('./services/llm/modelProvider');
      
      // Check if the provider is available
      const available = modelProvider.getAvailableProviders();
      const providerInfo = available.find(p => p.provider === provider);
      
      if (!providerInfo || !providerInfo.available) {
        return res.status(400).json({ 
          error: `Provider ${provider} is not available. Please configure the required API key.` 
        });
      }
      
      // Update the model configuration
      modelProvider.setModelConfig({
        provider: provider as any,
        model: model as any,
        temperature: temperature || undefined,
        maxTokens: maxTokens || undefined
      });
      
      // The model will be refreshed automatically when needed
      // No need to explicitly refresh it here
      
      res.json({
        success: true,
        config: modelProvider.getCurrentConfig()
      });
    } catch (error: any) {
      console.error("Error selecting model:", error);
      res.status(500).json({ 
        error: "Failed to select model",
        details: error.message 
      });
    }
  });
  
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

  // Get approved relations
  app.get("/api/relations/approved", async (req, res) => {
    try {
      const approvedRelations = await storage.getGraphRelationsByStatus("approved");
      res.json({ relations: approvedRelations });
    } catch (error) {
      console.error("Error fetching approved relations:", error);
      res.status(500).json({ error: "Failed to fetch approved relations" });
    }
  });

  // Approve/reject nodes
  app.patch("/api/nodes/:id/status", async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!["approved", "rejected", "pending"].includes(status)) {
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

      if (!["approved", "rejected", "pending"].includes(status)) {
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

  // Undo all approvals - also resets merged nodes
  app.post("/api/nodes/undo-all", async (req, res) => {
    try {
      const approvedNodes = await storage.getGraphNodesByStatus("approved");
      const mergedNodes = await storage.getGraphNodesByStatus("merged");
      const approvedRelations = await storage.getGraphRelationsByStatus("approved");
      
      // Reset all approved nodes to pending (only if they still have a source document)
      let resetNodeCount = 0;
      for (const node of approvedNodes) {
        // Check if the node still has a valid source document
        if (node.sourceDocumentId) {
          const doc = await storage.getDocument(node.sourceDocumentId);
          if (doc) {
            await storage.updateGraphNodeStatus(node.id, "pending");
            await storage.resetGraphNodeType(node.id);  // Reset category to "unknown"
            console.log(`Reset node to pending: ${node.name} (${node.id})`);
            resetNodeCount++;
          } else {
            // Document was deleted, remove orphaned node
            await storage.deleteGraphNode(node.id);
            console.log(`Deleted orphaned node: ${node.name} (${node.id})`);
          }
        }
      }
      
      // Reset merged nodes only if they have a source document
      for (const node of mergedNodes) {
        if (node.sourceDocumentId) {
          const doc = await storage.getDocument(node.sourceDocumentId);
          if (doc) {
            await storage.updateGraphNodeStatus(node.id, "approved");
            await storage.resetGraphNodeType(node.id);  // Reset category to "unknown"
            console.log(`Reset merged node to approved: ${node.name} (${node.id})`);
            resetNodeCount++;
          } else {
            // Document was deleted, remove orphaned node
            await storage.deleteGraphNode(node.id);
            console.log(`Deleted orphaned merged node: ${node.name} (${node.id})`);
          }
        }
      }
      
      // Reset all approved relations to pending (only if their nodes exist)
      let resetRelationCount = 0;
      for (const relation of approvedRelations) {
        await storage.updateGraphRelationStatus(relation.id, "pending");
        console.log(`Reset relation to pending: ${relation.id}`);
        resetRelationCount++;
      }
      
      // Also reset all duplicate candidates that were merged
      const mergedCandidates = await storage.getDuplicateCandidatesByStatus("merged");
      for (const candidate of mergedCandidates) {
        await storage.updateDuplicateCandidateStatus(candidate.id, "pending");
        console.log(`Reset duplicate candidate to pending: ${candidate.id}`);
      }
      
      res.json({ 
        success: true, 
        resetNodes: resetNodeCount,
        resetRelations: resetRelationCount,
        resetCandidates: mergedCandidates.length
      });
    } catch (error) {
      console.error("Error undoing all approvals:", error);
      res.status(500).json({ error: "Failed to undo all approvals" });
    }
  });

  // Cleanup orphaned nodes (nodes without valid source documents)
  app.post("/api/nodes/cleanup-orphaned", async (req, res) => {
    try {
      const allNodes = await db.select().from(graphNodes);
      let deletedCount = 0;
      let deletedNodeIds: string[] = [];
      
      for (const node of allNodes) {
        if (node.sourceDocumentId) {
          const doc = await storage.getDocument(node.sourceDocumentId);
          if (!doc) {
            // Document was deleted, remove orphaned node
            await storage.deleteGraphNode(node.id);
            console.log(`Deleted orphaned node: ${node.name} (${node.id})`);
            deletedNodeIds.push(node.id);
            deletedCount++;
          }
        }
      }
      
      // Also clean up relations that reference deleted nodes
      if (deletedNodeIds.length > 0) {
        await db.delete(graphRelations).where(
          or(
            inArray(graphRelations.fromNodeId, deletedNodeIds),
            inArray(graphRelations.toNodeId, deletedNodeIds)
          )
        );
      }
      
      res.json({ 
        success: true, 
        deletedNodes: deletedCount,
        message: `Cleaned up ${deletedCount} orphaned nodes`
      });
    } catch (error) {
      console.error("Error cleaning up orphaned nodes:", error);
      res.status(500).json({ error: "Failed to cleanup orphaned nodes" });
    }
  });

  // Delete a node - moves it back to pending status by default
  app.delete("/api/nodes/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { permanent } = req.query;
      
      if (permanent === 'true') {
        // Permanent deletion - original behavior
        const nodeRelations = await db
          .select()
          .from(graphRelations)
          .where(or(
            eq(graphRelations.fromNodeId, id),
            eq(graphRelations.toNodeId, id)
          ));
        
        await db.delete(graphRelations).where(or(
          eq(graphRelations.fromNodeId, id),
          eq(graphRelations.toNodeId, id)
        ));
        
        await storage.deleteGraphNode(id);
        
        res.json({ success: true, deletedRelations: nodeRelations.length });
      } else {
        // Default behavior: move back to pending
        await storage.updateGraphNodeStatus(id, "pending");
        res.json({ success: true, movedToPending: true });
      }
    } catch (error) {
      console.error("Error deleting/moving node:", error);
      res.status(500).json({ error: "Failed to delete/move node" });
    }
  });

  // Delete a relation - moves it back to pending status by default
  app.delete("/api/relations/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { permanent } = req.query;
      
      if (permanent === 'true') {
        // Permanent deletion - original behavior
        await storage.deleteGraphRelation(id);
        res.json({ success: true });
      } else {
        // Default behavior: move back to pending
        await storage.updateGraphRelationStatus(id, "pending");
        res.json({ success: true, movedToPending: true });
      }
    } catch (error) {
      console.error("Error deleting/moving relation:", error);
      res.status(500).json({ error: "Failed to delete/move relation" });
    }
  });

  // Run deduplication analysis
  app.post("/api/duplicates/analyze", async (req, res) => {
    try {
      const { threshold = 85, algorithmType = 'simple' } = req.body;
      
      // Use simple deduplication for now - much faster, no AI calls
      const { runSimpleDeduplication } = await import("./services/simpleDeduplication");
      const result = await runSimpleDeduplication(threshold);
      
      res.json({
        nodeCandidatesCreated: result.nodeCandidatesCreated,
        totalDuplicatesFound: result.totalDuplicatesFound,
        relationCandidatesCreated: 0,
        nodesAnalyzed: result.nodesAnalyzed,
        relationsAnalyzed: 0
      });
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

  // Get duplicate groups (all duplicates grouped together)
  app.get("/api/duplicates/groups", async (req, res) => {
    try {
      const candidates = await storage.getDuplicateCandidatesByStatus("pending");
      const approvedNodes = await storage.getGraphNodesByStatus("approved");
      
      // Build a graph of connected duplicates
      const duplicateGroups = new Map<string, Set<string>>();
      const nodeDetailsMap = new Map<string, any>();
      
      // Store node details
      for (const node of approvedNodes) {
        const document = node.sourceDocumentId ? await storage.getDocument(node.sourceDocumentId) : null;
        nodeDetailsMap.set(node.id, {
          id: node.id,
          name: node.name,
          description: node.description,
          type: node.type,
          documentName: document?.originalName || 'Unknown'
        });
      }
      
      // Build duplicate connections
      for (const candidate of candidates) {
        const node1Id = candidate.nodeId1;
        const node2Id = candidate.nodeId2;
        
        // Find existing groups for these nodes
        let group1: Set<string> | undefined;
        let group2: Set<string> | undefined;
        
        for (const [key, group] of duplicateGroups) {
          if (group.has(node1Id)) group1 = group;
          if (group.has(node2Id)) group2 = group;
        }
        
        if (group1 && group2 && group1 !== group2) {
          // Merge two groups
          for (const nodeId of group2) {
            group1.add(nodeId);
          }
          // Remove the second group
          for (const [key, group] of duplicateGroups) {
            if (group === group2) {
              duplicateGroups.delete(key);
              break;
            }
          }
        } else if (group1) {
          // Add node2 to group1
          group1.add(node2Id);
        } else if (group2) {
          // Add node1 to group2
          group2.add(node1Id);
        } else {
          // Create new group
          const newGroup = new Set<string>([node1Id, node2Id]);
          duplicateGroups.set(node1Id, newGroup);
        }
      }
      
      // Convert groups to array format with node details
      const groups = Array.from(duplicateGroups.values()).map((nodeIds, index) => {
        const nodes = Array.from(nodeIds)
          .map(id => nodeDetailsMap.get(id))
          .filter(node => node !== undefined);
        
        // Calculate group name (use most common name)
        const nameCount = new Map<string, number>();
        for (const node of nodes) {
          const count = nameCount.get(node.name) || 0;
          nameCount.set(node.name, count + 1);
        }
        let groupName = nodes[0]?.name || 'Unknown';
        let maxCount = 0;
        for (const [name, count] of nameCount) {
          if (count > maxCount) {
            maxCount = count;
            groupName = name;
          }
        }
        
        return {
          id: `group-${index}`,
          name: groupName,
          nodes: nodes,
          count: nodes.length
        };
      });
      
      res.json({ groups });
    } catch (error) {
      console.error("Error fetching duplicate groups:", error);
      res.status(500).json({ error: "Failed to fetch duplicate groups" });
    }
  });

  // Process duplicate group (merge all or keep all)
  app.post("/api/duplicates/groups/:groupId/process", async (req, res) => {
    try {
      const { action, nodeIds } = req.body; // action: 'merge_all' or 'keep_all'
      
      if (action === 'merge_all' && nodeIds && nodeIds.length > 0) {
        // Keep the first node, merge all others into it
        const primaryNodeId = nodeIds[0];
        
        for (let i = 1; i < nodeIds.length; i++) {
          const nodeToMerge = nodeIds[i];
          
          // Redirect all relations from nodeToMerge to primaryNodeId
          const relations = await storage.getGraphRelationsByStatus("approved");
          for (const relation of relations) {
            if (relation.fromNodeId === nodeToMerge || relation.toNodeId === nodeToMerge) {
              const updatedFromNodeId = relation.fromNodeId === nodeToMerge ? primaryNodeId : relation.fromNodeId;
              const updatedToNodeId = relation.toNodeId === nodeToMerge ? primaryNodeId : relation.toNodeId;
              
              // Delete old relation and create new one
              await storage.deleteGraphRelation(relation.id);
              await storage.createGraphRelation({
                fromNodeId: updatedFromNodeId,
                toNodeId: updatedToNodeId,
                relationshipType: relation.relationshipType,
                description: relation.description,
                confidence: relation.confidence,
                sourceDocumentId: relation.sourceDocumentId,
                status: relation.status
              });
            }
          }
          
          // Mark the node as merged
          await storage.updateGraphNodeStatus(nodeToMerge, "merged");
        }
        
        // Mark all related candidates as processed
        const candidates = await storage.getDuplicateCandidatesByStatus("pending");
        for (const candidate of candidates) {
          if (nodeIds.includes(candidate.nodeId1) && nodeIds.includes(candidate.nodeId2)) {
            await storage.updateDuplicateCandidateStatus(candidate.id, "merged");
          }
        }
        
        res.json({ success: true, message: `Merged ${nodeIds.length - 1} nodes into primary node` });
      } else if (action === 'keep_all') {
        // Mark all related candidates as kept separate
        const candidates = await storage.getDuplicateCandidatesByStatus("pending");
        for (const candidate of candidates) {
          if (nodeIds.includes(candidate.nodeId1) && nodeIds.includes(candidate.nodeId2)) {
            await storage.updateDuplicateCandidateStatus(candidate.id, "kept_separate");
          }
        }
        
        res.json({ success: true, message: `Kept all ${nodeIds.length} nodes as separate entities` });
      } else {
        res.status(400).json({ error: "Invalid action" });
      }
    } catch (error) {
      console.error("Error processing duplicate group:", error);
      res.status(500).json({ error: "Failed to process duplicate group" });
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
            fromNodeId: updatedFromNodeId,
            toNodeId: updatedToNodeId,
            relationshipType: relation.relationshipType,
            description: relation.description,
            confidence: relation.confidence,
            sourceDocumentId: relation.sourceDocumentId,
            status: relation.status
          });
          updatedRelations++;
          console.log(`Updated relation: ${relation.relationshipType} from ${relation.fromNodeId} to ${relation.toNodeId}`);
        }
      }

      // Mark the duplicate candidate as merged for tracking
      await storage.updateDuplicateCandidateStatus(req.params.id, "merged");
      
      // Mark the duplicate node as "merged" instead of deleting it
      // This avoids foreign key constraint issues while keeping the data for reference
      await storage.updateGraphNodeStatus(candidate.nodeId2, "merged");

      console.log(`Merge complete: Updated ${updatedRelations} relations, deleted node "${node2.name}"`);
      res.json({ success: true, updatedRelations });
    } catch (error) {
      console.error("Error merging duplicate:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Keep duplicate candidates separate
  app.post("/api/duplicates/:id/keep-separate", async (req, res) => {
    try {
      await storage.updateDuplicateCandidateStatus(req.params.id, "kept_separate");
      res.json({ success: true });
    } catch (error) {
      console.error("Error keeping duplicates separate:", error);
      res.status(500).json({ error: "Failed to keep duplicates separate" });
    }
  });

  // Delete duplicate candidate
  app.delete("/api/duplicates/:id", async (req, res) => {
    try {
      const candidate = await storage.getDuplicateCandidateById(req.params.id);
      if (!candidate) {
        return res.status(404).json({ error: "Candidate not found" });
      }
      
      // Delete the duplicate candidate
      await storage.deleteDuplicateCandidate(req.params.id);
      console.log(`Deleted duplicate candidate: ${req.params.id}`);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting duplicate candidate:", error);
      res.status(500).json({ error: "Failed to delete duplicate candidate" });
    }
  });

  // Clear graph preview by resetting only approved nodes to pending (keep merged nodes as merged)
  app.post("/api/graph/clear-preview", async (req, res) => {
    try {
      // Get only approved nodes - DO NOT reset merged nodes
      const approvedNodes = await storage.getGraphNodesByStatus("approved");
      const approvedRelations = await storage.getGraphRelationsByStatus("approved");
      
      // Reset all approved nodes to pending and reset their category assignments
      for (const node of approvedNodes) {
        await storage.updateGraphNodeStatus(node.id, "pending");
        await storage.resetGraphNodeType(node.id);  // Reset category assignment to "unknown"
        console.log(`Reset approved node to pending: ${node.name} (${node.id})`);
      }
      
      // IMPORTANT: Do NOT reset merged nodes - they should stay merged to prevent duplicates from reappearing
      // Merged nodes represent duplicates that have been eliminated and should not come back
      
      // Reset all approved relations to pending
      for (const relation of approvedRelations) {
        await storage.updateGraphRelationStatus(relation.id, "pending");
        console.log(`Reset approved relation to pending: ${relation.id}`);
      }
      
      // Also reset duplicate candidates but keep merged ones to remember what was merged
      const pendingCandidates = await storage.getDuplicateCandidatesByStatus("pending");
      const keptSeparateCandidates = await storage.getDuplicateCandidatesByStatus("kept_separate");
      
      // Delete pending and kept_separate candidates, but preserve merged candidates as history
      for (const candidate of [...pendingCandidates, ...keptSeparateCandidates]) {
        await storage.deleteDuplicateCandidate(candidate.id);
        console.log(`Deleted duplicate candidate: ${candidate.id}`);
      }
      
      res.json({ 
        success: true, 
        resetNodes: approvedNodes.length,
        resetRelations: approvedRelations.length,
        deletedCandidates: pendingCandidates.length + keptSeparateCandidates.length,
        message: "Preview cleared. Merged duplicates remain merged to prevent reappearance."
      });
    } catch (error) {
      console.error("Error clearing preview:", error);
      res.status(500).json({ error: "Failed to clear preview" });
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

      res.json({
        mergedCount: mergedCandidates.length,
        keptSeparateCount: keptSeparateCandidates.length,
        totalResolved
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

  // Preview nodes and relations before adding to graph database
  app.get("/api/graph/preview", async (req, res) => {
    try {
      // Get only approved nodes - merged nodes are duplicates that have been eliminated
      const approvedNodes = await storage.getGraphNodesByStatus("approved");
      const approvedRelations = await storage.getGraphRelationsByStatus("approved");
      
      // Filter out orphaned relations and enrich with node information
      const validRelations = approvedRelations.filter(relation => {
        const fromNode = approvedNodes.find(n => n.id === relation.fromNodeId);
        const toNode = approvedNodes.find(n => n.id === relation.toNodeId);
        // Only include relations where both nodes exist
        return fromNode && toNode;
      });
      
      const enrichedRelations = validRelations.map(relation => {
        const fromNode = approvedNodes.find(n => n.id === relation.fromNodeId);
        const toNode = approvedNodes.find(n => n.id === relation.toNodeId);
        return {
          ...relation,
          fromNodeName: fromNode!.name,
          toNodeName: toNode!.name
        };
      });
      
      res.json({
        preview: {
          nodes: approvedNodes,
          relations: enrichedRelations,
          summary: {
            totalNodes: approvedNodes.length,
            totalRelations: enrichedRelations.length,
            nodeTypes: Array.from(new Set(approvedNodes.map(n => n.type))),
            relationTypes: Array.from(new Set(enrichedRelations.map(r => r.relationshipType)))
          }
        }
      });
    } catch (error) {
      console.error("Error getting graph preview:", error);
      res.status(500).json({ error: "Failed to get graph preview" });
    }
  });
  
  // Add previewed nodes/relations to Neo4j  
  app.post("/api/graph/add-from-preview", async (req, res) => {
    try {
      // Get only approved nodes - merged nodes are duplicates that have been eliminated
      const approvedNodes = await storage.getGraphNodesByStatus("approved");
      const allNodesToAdd = approvedNodes;
      
      const approvedRelations = await storage.getGraphRelationsByStatus("approved");
      
      // Get categories from database - user has full control
      const categories = await storage.getCategories();
      const categoryMap = new Map(categories.map(c => [c.id, c]));
      
      // Process nodes with their actual category information
      const nodesWithCategories = allNodesToAdd.map(node => {
        // Keep original type but determine the category for visualization
        let category = node.type;
        
        // Check if the node type matches a category
        if (!categoryMap.has(node.type)) {
          // If not, use unknown category for visualization
          category = "unknown";
        }
        
        return {
          ...node,
          category  // Add category field for color mapping
        };
      });
      
      let nodesAdded = 0;
      let relationsAdded = 0;
      let errors: string[] = [];
      
      // Try to add to Neo4j, fall back to marking as added if Neo4j is not available
      let neo4jAvailable = true;
      
      // Add nodes to Neo4j (with category information for coloring)
      for (const node of nodesWithCategories) {
        try {
          if (neo4jAvailable) {
            await neo4jService.createNode({
              id: node.id,
              name: node.name,
              type: node.type,  // Keep original type as Neo4j label
              category: node.category,  // Pass category for color mapping
              description: node.description || undefined
            });
          }
          nodesAdded++;
          // Update status using the original node ID
          await storage.updateGraphNodeStatus(node.id, "in_graph");
        } catch (error: any) {
          // Check if this is a Neo4j connection error
          if (error?.message?.includes('NEO4J_PASSWORD') || error?.code === 'ServiceUnavailable') {
            neo4jAvailable = false;
            // Still mark as added for development purposes
            nodesAdded++;
            await storage.updateGraphNodeStatus(node.id, "in_graph");
            console.log(`Neo4j not available, marking node "${node.name}" as added`);
          } else {
            const errorMsg = `Failed to add node "${node.name}": ${error?.message || 'Unknown error'}`;
            console.error(errorMsg);
            errors.push(errorMsg);
          }
        }
      }
      
      // Add relations to Neo4j - only add relations between existing approved/merged nodes
      for (const relation of approvedRelations) {
        // Check if both nodes exist in either approved or merged nodes
        const fromNodeExists = allNodesToAdd.some(n => n.id === relation.fromNodeId);
        const toNodeExists = allNodesToAdd.some(n => n.id === relation.toNodeId);
        
        if (!fromNodeExists || !toNodeExists) {
          console.log(`Skipping orphaned relation ${relation.id} - one or both nodes don't exist`);
          continue;
        }
        
        try {
          if (neo4jAvailable) {
            await neo4jService.createRelationship(relation);
          }
          relationsAdded++;
          await storage.updateGraphRelationStatus(relation.id, "in_graph");
        } catch (error: any) {
          if (error?.code === 'ServiceUnavailable') {
            neo4jAvailable = false;
            // Still mark as added for development purposes
            relationsAdded++;
            await storage.updateGraphRelationStatus(relation.id, "in_graph");
            console.log(`Neo4j not available, marking relation as added`);
          } else {
            const errorMsg = `Failed to add relation ${relation.id}: ${error?.message || 'Unknown error'}`;
            console.error(errorMsg);
            errors.push(errorMsg);
          }
        }
      }
      
      res.json({
        success: errors.length === 0,
        nodesAdded,
        relationsAdded,
        errors: errors.length > 0 ? errors : undefined,
        message: neo4jAvailable 
          ? `Successfully added ${nodesAdded} nodes and ${relationsAdded} relations to Neo4j`
          : `Marked ${nodesAdded} nodes and ${relationsAdded} relations as added (Neo4j not available)`
      });
    } catch (error: any) {
      console.error("Error in add-from-preview:", error);
      res.status(500).json({ 
        error: "Failed to add items to graph", 
        details: error?.message || "Unknown error" 
      });
    }
  });

  // Clear graph database
  app.post("/api/graph/clear", async (req, res) => {
    try {
      // Check for Neo4j credentials
      const neo4jPassword = process.env.NEO4J_PASSWORD;
      
      if (!neo4jPassword) {
        console.log("No Neo4j password configured - cannot clear graph database");
        return res.status(400).json({ 
          error: "Neo4j credentials not configured. Please set NEO4J_PASSWORD environment variable." 
        });
      }
      
      // Clear all data from Neo4j
      const neo4jUri = process.env.NEO4J_URI || "bolt://localhost:7687";
      const neo4jUser = process.env.NEO4J_USER || "neo4j";
      
      console.log("Connecting to Neo4j at:", neo4jUri);
      const neo4j = await import("neo4j-driver");
      const driver = neo4j.default.driver(neo4jUri, neo4j.default.auth.basic(neo4jUser, neo4jPassword));
      
      try {
        const session = driver.session();
        
        try {
          // First, count existing nodes
          const countResult = await session.run("MATCH (n) RETURN count(n) as count");
          const beforeCount = countResult.records[0].get('count').toNumber();
          console.log(`Found ${beforeCount} nodes to delete`);
          
          // Delete all nodes and relationships
          const deleteResult = await session.run("MATCH (n) DETACH DELETE n");
          console.log("Delete query executed, summary:", deleteResult.summary);
          
          // Verify deletion
          const verifyResult = await session.run("MATCH (n) RETURN count(n) as count");
          const afterCount = verifyResult.records[0].get('count').toNumber();
          console.log(`After deletion: ${afterCount} nodes remaining`);
          
          if (afterCount > 0) {
            throw new Error(`Failed to delete all nodes. ${afterCount} nodes still remain.`);
          }
          
          // Reset all "in_graph" nodes back to "approved" so they can be re-added
          const nodesReset = await storage.resetInGraphNodesToApproved();
          const relationsReset = await storage.resetInGraphRelationsToApproved();
          
          // IMPORTANT: Also reset merged nodes back to pending so they're not lost
          const mergedNodes = await storage.getGraphNodesByStatus("merged");
          let mergedNodesReset = 0;
          for (const node of mergedNodes) {
            await storage.updateGraphNodeStatus(node.id, "pending");
            mergedNodesReset++;
            console.log(`Reset merged node to pending: ${node.name} (${node.id})`);
          }
          
          // Clear all duplicate candidates since we're resetting merged nodes
          try {
            const allCandidates = await storage.getDuplicateCandidatesByStatus("pending");
            const mergedCandidates = await storage.getDuplicateCandidatesByStatus("merged");
            const keptSeparateCandidates = await storage.getDuplicateCandidatesByStatus("kept_separate");
            
            for (const candidate of [...allCandidates, ...mergedCandidates, ...keptSeparateCandidates]) {
              await storage.deleteDuplicateCandidate(candidate.id);
            }
          } catch (dupError) {
            console.warn("Warning: Could not clear duplicate candidates (non-critical):", dupError);
            // Continue - this is not critical for clearing the graph
          }
          
          console.log(`Reset ${nodesReset} in_graph nodes to approved, ${mergedNodesReset} merged nodes to pending`);
          
          res.json({ 
            success: true, 
            message: `Successfully cleared graph. Reset ${nodesReset + mergedNodesReset} nodes total (${mergedNodesReset} were merged duplicates now available again)`,
            nodesDeleted: beforeCount,
            nodesReset: nodesReset,
            mergedNodesReset: mergedNodesReset,
            relationsReset: relationsReset
          });
        } finally {
          await session.close();
        }
      } finally {
        await driver.close();
      }
    } catch (error: any) {
      console.error("Error clearing graph database:", error);
      res.status(500).json({ error: "Failed to clear graph database: " + error.message });
    }
  });

  // Category management endpoints
  app.get("/api/categories", async (req, res) => {
    try {
      const categories = await storage.getCategories();
      res.json({ categories });
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ error: "Failed to fetch categories" });
    }
  });

  app.post("/api/categories", async (req, res) => {
    try {
      const { name, color, description } = req.body;
      const category = await storage.createCategory({ name, color, description });
      res.json({ category });
    } catch (error) {
      console.error("Error creating category:", error);
      res.status(500).json({ error: "Failed to create category" });
    }
  });

  app.patch("/api/categories/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const category = await storage.updateCategory(id, updates);
      res.json({ category });
    } catch (error) {
      console.error("Error updating category:", error);
      res.status(500).json({ error: "Failed to update category" });
    }
  });

  app.delete("/api/categories/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteCategory(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting category:", error);
      res.status(500).json({ error: "Failed to delete category" });
    }
  });

  // Generate categories based on current nodes
  app.post("/api/categories/generate", async (req, res) => {
    try {
      const { preserveCustom = false } = req.body;
      
      // Get all approved nodes
      const approvedNodes = await storage.getGraphNodesByStatus("approved");
      
      // Get existing categories
      const existingCategories = await storage.getCategories();
      
      // Extract unique node types from approved nodes
      const nodeTypes = new Set<string>();
      approvedNodes.forEach(node => {
        if (node.type && node.type !== "unknown") {
          nodeTypes.add(node.type);
        }
      });
      
      // Define category colors for different types
      const categoryColors: Record<string, string> = {
        ingredient: "#FF6B6B",
        dish: "#4ECDC4", 
        recipe: "#45B7D1",
        entity: "#0F62FE",
        concept: "#24A148",
        process: "#F1C21B",
        tool: "#8A3FFC",
        material: "#BA4E00",
        technology: "#198038",
        person: "#FA4D56",
        location: "#007D79",
        organization: "#A2191F",
        method: "#6929C4",
        property: "#005D5D",
        unknown: "#525252"
      };
      
      // Categories to keep (always keep unknown)
      const categoriesToKeep = new Set<string>(["unknown"]);
      
      // Add node types as categories to keep
      nodeTypes.forEach(type => {
        categoriesToKeep.add(type.toLowerCase());
      });
      
      // If preserving custom categories, add user-created ones
      if (preserveCustom) {
        existingCategories.forEach(cat => {
          // Check if this category was manually created (not in our default list)
          if (!categoryColors[cat.id]) {
            categoriesToKeep.add(cat.id);
          }
        });
      }
      
      // Delete categories that are not in use
      for (const cat of existingCategories) {
        if (!categoriesToKeep.has(cat.id)) {
          await storage.deleteCategory(cat.id);
        }
      }
      
      // Create new categories for node types that don't exist
      const existingCategoryIds = new Set(existingCategories.map(c => c.id));
      
      for (const type of categoriesToKeep) {
        if (!existingCategoryIds.has(type)) {
          // Generate a nice name from the type
          const name = type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ');
          const color = categoryColors[type] || "#0F62FE"; // Default blue if no specific color
          
          let description = "";
          switch(type) {
            case "ingredient":
              description = "Food ingredients and components";
              break;
            case "dish":
              description = "Prepared dishes and meals";
              break;
            case "recipe":
              description = "Cooking recipes and instructions";
              break;
            case "entity":
              description = "General entities and objects";
              break;
            case "concept":
              description = "Abstract concepts and ideas";
              break;
            case "process":
              description = "Processes, procedures and workflows";
              break;
            case "tool":
              description = "Tools, equipment and instruments";
              break;
            case "material":
              description = "Materials and substances";
              break;
            case "technology":
              description = "Technologies and techniques";
              break;
            case "person":
              description = "People and individuals";
              break;
            case "location":
              description = "Places and locations";
              break;
            case "organization":
              description = "Organizations and companies";
              break;
            case "method":
              description = "Methods and approaches";
              break;
            case "property":
              description = "Properties and characteristics";
              break;
            case "unknown":
              description = "Uncategorized nodes";
              break;
            default:
              description = `${name} category`;
          }
          
          // Create the category with fixed ID based on type
          await db.insert(categories).values({
            id: type,
            name,
            color,
            description
          }).onConflictDoNothing();
        }
      }
      
      // Fetch and return updated categories
      const updatedCategories = await storage.getCategories();
      
      res.json({ 
        success: true, 
        categoriesGenerated: categoriesToKeep.size,
        categoriesDeleted: existingCategories.length - Array.from(categoriesToKeep).filter(id => existingCategoryIds.has(id)).length,
        categories: updatedCategories 
      });
      
    } catch (error) {
      console.error("Error generating categories:", error);
      res.status(500).json({ error: "Failed to generate categories" });
    }
  });

  app.patch("/api/nodes/:id/category", async (req, res) => {
    try {
      const { id } = req.params;
      const { categoryId } = req.body;
      console.log(`Updating node ${id} category to ${categoryId}`);
      const node = await storage.updateNodeCategory(id, categoryId);
      console.log("Updated node:", node);
      res.json({ node });
    } catch (error) {
      console.error("Error updating node category:", error);
      res.status(500).json({ error: "Failed to update node category" });
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
      const { content, useGraphRAG = true, strategy } = req.body;

      // Create user message
      const userMessage = await storage.createChatMessage({
        sessionId,
        role: "user",
        content,
      });

      // Process query with GraphRAG orchestrator or fallback to original
      try {
        let queryResult;
        let responseContent: string;
        let queryTranslation;

        if (useGraphRAG) {
          // Use the new GraphRAG orchestrator
          const { graphRAGOrchestrator } = await import('./services/graphrag');
          
          queryResult = await graphRAGOrchestrator.processQuery(content, {
            forceStrategy: strategy,
            maxRetries: 2
          });

          // Store the translation based on result
          if (queryResult.success) {
            queryTranslation = await storage.createQueryTranslation({
              naturalLanguageQuery: content,
              graphQuery: queryResult.cypher || '',
              queryType: queryResult.method === 'template' ? 'template' : 'cypher',
              status: "success",
            });

            // Format response based on stage and method
            if (queryResult.answer) {
              // LangChain GraphRAG provides direct answers
              responseContent = queryResult.answer as string;
            } else if (queryResult.results) {
              // Template or NLP results need formatting
              responseContent = formatQueryResults(queryResult.results);
            } else {
              responseContent = "Query executed successfully but no results were returned.";
            }
          } else {
            // Query failed
            queryTranslation = await storage.createQueryTranslation({
              naturalLanguageQuery: content,
              graphQuery: queryResult.cypher || '',
              queryType: "cypher",
              status: "failed",
              errorMessage: queryResult.error || "Query processing failed",
            });

            responseContent = queryResult.error || "I couldn't process your query.";
            
            if (queryResult.suggestions && queryResult.suggestions.length > 0) {
              responseContent += "\n\nSuggestions:\n";
              queryResult.suggestions.forEach((suggestion: string) => {
                responseContent += `• ${suggestion}\n`;
              });
            }
          }
        } else {
          // Fallback to original Langfuse approach
          const translation = await langfuseService.translateNaturalLanguageQuery(content);
          
          queryTranslation = await storage.createQueryTranslation({
            naturalLanguageQuery: content,
            graphQuery: translation.graphQuery,
            queryType: translation.queryType,
            status: "success",
          });

          const startTime = Date.now();
          const results = await neo4jService.executeQuery(translation.graphQuery);
          const executionTime = Date.now() - startTime;

          responseContent = formatQueryResults(results);
        }
        
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

  // GraphRAG endpoints
  app.post("/api/graphrag/test", async (req, res) => {
    try {
      const { query, strategy, options = {} } = req.body;
      
      if (!query) {
        return res.status(400).json({ error: "Query is required" });
      }

      const { graphRAGOrchestrator } = await import('./services/graphrag');
      
      const result = await graphRAGOrchestrator.processQuery(query, {
        ...options,
        forceStrategy: strategy
      });

      res.json(result);
    } catch (error) {
      console.error("Error testing GraphRAG:", error);
      res.status(500).json({ error: "Failed to test GraphRAG query" });
    }
  });

  app.get("/api/graphrag/metrics", async (req, res) => {
    try {
      const { graphRAGOrchestrator } = await import('./services/graphrag');
      const metrics = graphRAGOrchestrator.getMetrics();
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching GraphRAG metrics:", error);
      res.status(500).json({ error: "Failed to fetch metrics" });
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

    // Get existing categories
    const categories = await storage.getCategories();
    const categoryIds = new Set(categories.map(c => c.id));

    // Store extracted nodes
    for (const nodeData of extraction.nodes) {
      // Keep the original AI-extracted type
      // The AI already returns valid types like: person, equipment, process, concept, material, etc.
      const nodeType = nodeData.type.toLowerCase();
      
      // Ensure the category exists (create if needed)
      if (!categoryIds.has(nodeType) && nodeType !== "unknown") {
        // Create the category if it doesn't exist
        const categoryColors: Record<string, string> = {
          person: "#FA4D56",
          equipment: "#8A3FFC",
          process: "#F1C21B",
          concept: "#24A148",
          material: "#BA4E00",
          organization: "#A2191F",
          location: "#007D79",
          technology: "#198038",
          method: "#6929C4",
          tool: "#8A3FFC"
        };
        
        // Create category with ID matching the type
        const newCategory = {
          id: nodeType,
          name: nodeType.charAt(0).toUpperCase() + nodeType.slice(1),
          color: categoryColors[nodeType] || "#0F62FE",
          description: `AI-detected ${nodeType} entities`
        };
        await storage.createCategoryWithId(newCategory);
        categoryIds.add(nodeType);
      }
      
      await storage.createGraphNode({
        name: nodeData.name,
        description: nodeData.description,
        type: nodeType,
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

// Helper functions for formatting query results
function formatQueryResults(results: any[]): string {
  if (results.length === 0) {
    return "I couldn't find any results for your query.";
  }

  // Check if this is an ingredient query result (check this BEFORE template entities)
  if (results[0] && results[0].entity && results[0].ingredients) {
    return formatIngredientResults(results);
  }

  // Check if this is a recipe search result
  if (results[0] && results[0].searchedIngredient && results[0].recipes) {
    return formatRecipeSearchResults(results);
  }

  // Check if this is a template query result with entities array or recipes/ingredients
  if (results[0] && (results[0].entities || (results[0].recipes && !results[0].searchedIngredient) || (results[0].ingredients && !results[0].entity)) && 
      (Array.isArray(results[0].entities) || Array.isArray(results[0].recipes) || Array.isArray(results[0].ingredients))) {
    return formatTemplateEntityResults(results);
  }

  // Check if this is a relationship path result
  if (results[0] && (results[0].relationshipPath || results[0].pathLength)) {
    return formatRelationshipPathResults(results);
  }

  // Check if this is the node overview query with typeCount and examples
  if (results[0] && results[0].typeCount !== undefined && results[0].examples !== undefined) {
    return formatNodeOverviewResults(results);
  }
  
  // Check if this is a count/aggregate query
  if (results[0] && Object.keys(results[0]).some(key => 
    key.includes('count') || key.includes('Count') || key.includes('COUNT'))) {
    return formatAggregateResults(results);
  }

  // Check if this is asking about node types/labels
  if (results[0] && (results[0].nodeLabels || results[0].nodeLabel || results[0].labels)) {
    return formatNodeTypeResults(results);
  }

  // Check if this is asking about specific nodes
  if (results[0] && (results[0].name || results[0].n)) {
    return formatNodeResults(results);
  }

  // Check if this is asking about relationships
  if (results[0] && (results[0].relationshipType || results[0].type || results[0].r)) {
    return formatRelationshipResults(results);
  }

  // Default formatting for other queries
  return formatDefaultResults(results);
}

function formatTemplateEntityResults(results: any[]): string {
  // Handle template query results with entities array
  let allEntities: any[] = [];
  let entityType = '';
  
  // Collect all entities from all result types
  results.forEach(result => {
    const type = result.type;
    const entities = result.entities || result.recipes || result.ingredients;
    
    if (entities && entities.length > 0) {
      allEntities = allEntities.concat(entities);
      // Set entity type based on the query type or what field the data is in
      if (!entityType) {
        if (result.recipes) {
          entityType = 'recipe';
        } else if (result.ingredients) {
          entityType = 'ingredient';
        } else if (type === 'dish' || type === 'recipe' || type === 'meal') {
          entityType = 'recipe';
        } else if (type === 'ingredient') {
          entityType = 'ingredient';
        }
      }
    }
  });
  
  if (allEntities.length === 0) {
    return "I don't have any entities matching your query in my knowledge graph.";
  }
  
  // Format the combined results - be accurate about what we're returning
  let typeLabel = '';
  if (entityType === 'recipe') {
    // These are actually recipes AND dishes, so be accurate
    typeLabel = allEntities.length === 1 ? 'recipe/dish' : 'recipes and dishes';
  } else if (entityType === 'ingredient') {
    typeLabel = allEntities.length === 1 ? 'ingredient' : 'ingredients';
  } else {
    typeLabel = allEntities.length === 1 ? 'result' : 'results';
  }
  
  let response = `Here ${allEntities.length === 1 ? 'is' : 'are'} the ${allEntities.length} ${typeLabel} I have in my knowledge graph:\n\n`;
  
  allEntities.forEach((entity: any, index: number) => {
    if (index >= 15) return; // Limit to first 15 items
    response += `• ${entity.name}`;
    if (entity.description) {
      response += ` - ${entity.description}`;
    }
    response += '\n';
  });
  
  if (allEntities.length > 15) {
    response += `\n... and ${allEntities.length - 15} more`;
  }
  
  return response.trim();
}

function formatRelationshipPathResults(results: any[]): string {
  if (results.length === 0) {
    return "No relationship found between these entities.";
  }
  
  const firstResult = results[0];
  const source = firstResult.source;
  const target = firstResult.target;
  const relationshipPath = firstResult.relationshipPath;
  const pathLength = firstResult.pathLength;
  
  let response = `Found ${results.length} relationship${results.length > 1 ? 's' : ''} between "${source}" and "${target}":\n\n`;
  
  results.slice(0, 3).forEach((result, index) => {
    const path = result.relationshipPath;
    response += `${index + 1}. `;
    if (path && path.length > 0) {
      response += path.join(' → ');
    } else {
      response += 'Direct connection';
    }
    response += ` (${result.pathLength || 1} step${result.pathLength !== 1 ? 's' : ''})\n`;
  });
  
  if (results.length > 3) {
    response += `\n... and ${results.length - 3} more relationships`;
  }
  
  return response.trim();
}

function formatNodeTypeResults(results: any[]): string {
  const nodeTypes = new Map<string, number>();
  
  results.forEach(result => {
    const label = result.nodeLabels || result.nodeLabel || result.labels || result.type;
    const count = result.nodeCount || result.count || 1;
    nodeTypes.set(label, count);
  });

  if (nodeTypes.size === 0) {
    return "I don't have any nodes in the knowledge graph yet.";
  }

  let response = `I have ${nodeTypes.size} type${nodeTypes.size > 1 ? 's' : ''} of nodes in the knowledge graph:\n\n`;
  
  Array.from(nodeTypes.entries()).forEach(([type, count]) => {
    const typeName = type.charAt(0).toUpperCase() + type.slice(1);
    response += `• ${count} ${typeName}${count > 1 ? ' nodes' : ' node'}\n`;
  });

  return response.trim();
}

function formatNodeResults(results: any[]): string {
  const nodes = results.slice(0, 10);
  
  if (nodes.length === 1) {
    const result = nodes[0];
    // Check if 'n' exists as a Neo4j node object
    const node = result.n ? (result.n.properties || result.n) : result;
    const name = node.name || 'Unknown';
    const description = node.description || 'No description available';
    const type = node.type || 'Unknown';
    return `I found this node:\n\n**${name}**\n${description}\nType: ${type}`;
  }

  let response = `I found ${results.length} node${results.length > 1 ? 's' : ''}:\n\n`;
  
  nodes.forEach((result, index) => {
    // Check if 'n' exists as a Neo4j node object
    const node = result.n ? (result.n.properties || result.n) : result;
    const name = node.name || 'Unknown';
    const type = node.type;
    const description = node.description;
    
    response += `${index + 1}. **${name}**`;
    if (type) response += ` (${type})`;
    if (description) response += `\n   ${description}`;
    response += '\n\n';
  });

  if (results.length > 10) {
    response += `... and ${results.length - 10} more nodes.`;
  }

  return response.trim();
}

function formatRelationshipResults(results: any[]): string {
  const relationships = results.slice(0, 10);
  
  if (results.length === 0) {
    return "I couldn't find any relationships matching your query.";
  }
  
  let response = `I found ${results.length} relationship${results.length > 1 ? 's' : ''} in the knowledge graph:\n\n`;
  
  relationships.forEach((result, index) => {
    const rel = result.r || result;
    const fromNode = result.fromNode || result.source || 'Unknown';
    const toNode = result.toNode || result.target || 'Unknown';
    const relType = rel.relationshipType || rel.type || 'RELATED_TO';
    
    response += `${index + 1}. ${fromNode} → ${relType} → ${toNode}`;
    if (rel.description) response += `\n   ${rel.description}`;
    response += '\n\n';
  });

  if (results.length > 10) {
    response += `... and ${results.length - 10} more relationships.`;
  }

  return response.trim();
}

function formatAggregateResults(results: any[]): string {
    const result = results[0];
    const entries = Object.entries(result);
    
    if (entries.length === 1) {
      const [key, value] = entries[0];
      const cleanKey = key.replace(/count|Count|COUNT/gi, '').trim();
      // Handle Neo4j integer format
      const displayValue = typeof value === 'object' && value.low !== undefined ? value.low : value;
      return `The total ${cleanKey || 'count'} is ${displayValue}.`;
    }

    let response = "Here are the results:\n\n";
    entries.forEach(([key, value]) => {
      const cleanKey = key.replace(/_/g, ' ').toLowerCase();
      // Handle Neo4j integer format
      const displayValue = typeof value === 'object' && value.low !== undefined ? value.low : value;
      response += `• ${cleanKey}: ${displayValue}\n`;
    });

    return response.trim();
}

function formatNodeOverviewResults(results: any[]): string {
    if (results.length === 0) {
      return "I don't have any nodes in the knowledge graph yet.";
    }
    
    // Calculate total nodes
    let totalNodes = 0;
    results.forEach(result => {
      const count = typeof result.typeCount === 'object' && result.typeCount.low !== undefined 
        ? result.typeCount.low 
        : result.typeCount;
      totalNodes += count;
    });
    
    let response = `I have **${totalNodes} nodes** in the knowledge graph across ${results.length} different types:\n\n`;
    
    results.forEach(result => {
      const type = result.type || 'unknown';
      const count = typeof result.typeCount === 'object' && result.typeCount.low !== undefined 
        ? result.typeCount.low 
        : result.typeCount;
      const examples = result.examples || [];
      
      // Format type name
      const typeName = type.charAt(0).toUpperCase() + type.slice(1);
      response += `**${typeName}s** (${count} nodes)\n`;
      
      // Add examples if available
      if (examples.length > 0) {
        examples.slice(0, 3).forEach((example: any) => {
          response += `  • ${example.name}`;
          if (example.description) {
            response += `: ${example.description}`;
          }
          response += '\n';
        });
        if (count > examples.length) {
          response += `  ... and ${count - examples.length} more\n`;
        }
      }
      response += '\n';
    });
    
    return response.trim();
}

function formatRecipeSearchResults(results: any[]): string {
  if (results.length === 0) {
    return "I couldn't find any recipes with that ingredient.";
  }
  
  let response = '';
  
  results.forEach((result) => {
    const ingredient = result.searchedIngredient;
    const recipes = result.recipes || [];
    
    if (recipes.length === 0) {
      response += `I don't have any recipes that use ${ingredient} in my knowledge graph.\n`;
    } else {
      const recipeCount = recipes.length;
      response += `I found ${recipeCount} ${recipeCount === 1 ? 'recipe' : 'recipes'} that ${recipeCount === 1 ? 'uses' : 'use'} ${ingredient}:\n\n`;
      
      recipes.forEach((recipe: any, index: number) => {
        if (typeof recipe === 'string') {
          response += `• ${recipe}\n`;
        } else if (recipe && recipe.name) {
          response += `• ${recipe.name}`;
          if (recipe.description) {
            response += ` - ${recipe.description}`;
          }
          response += '\n';
        }
      });
    }
  });
  
  return response.trim();
}

function formatIngredientResults(results: any[]): string {
  if (results.length === 0) {
    return "I couldn't find that dish in my knowledge graph.";
  }
  
  let response = '';
  
  results.forEach((result) => {
    const dishName = result.entity;
    const ingredients = result.ingredients || [];
    
    if (ingredients.length === 0) {
      response += `${dishName} doesn't have any ingredients listed.\n`;
    } else {
      response += `${dishName} contains the following ingredients:\n\n`;
      
      const ingredientList = ingredients.map((ing: any) => {
        if (typeof ing === 'string') {
          return `• ${ing}`;
        } else if (ing && ing.name) {
          let item = `• ${ing.name}`;
          if (ing.description) {
            item += ` - ${ing.description}`;
          }
          return item;
        }
        return '• Unknown ingredient';
      });
      
      response += ingredientList.join('\n') + '\n';
    }
  });
  
  return response.trim();
}

function formatDefaultResults(results: any[]): string {
    if (results.length === 0) {
      return "No results found.";
    }
    
    // Try to format as a simple list
    let response = `Found ${results.length} result${results.length > 1 ? 's' : ''}:\n\n`;
    
    results.slice(0, 10).forEach((result, index) => {
      // Try to extract meaningful information from the result
      const keys = Object.keys(result);
      if (keys.length === 1) {
        response += `${index + 1}. ${result[keys[0]]}\n`;
      } else {
        // Format as key-value pairs
        response += `${index + 1}. `;
        const displayPairs: string[] = [];
        keys.forEach(key => {
          const value = result[key];
          if (value !== null && value !== undefined) {
            // Handle Neo4j integer format
            const displayValue = typeof value === 'object' && value.low !== undefined ? value.low : value;
            displayPairs.push(`${key}: ${displayValue}`);
          }
        });
        response += displayPairs.join(', ') + '\n';
      }
    });
    
    if (results.length > 10) {
      response += `\n... and ${results.length - 10} more results.`;
    }
    
    return response.trim();
}

