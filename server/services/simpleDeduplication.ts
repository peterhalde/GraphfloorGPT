import { storage } from "../storage";
import { GraphNode } from "@shared/schema";

// Simple string similarity using Levenshtein distance
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]) + 1;
      }
    }
  }

  return dp[m][n];
}

function stringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 100;
  
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 100;
  
  const distance = levenshteinDistance(s1, s2);
  return Math.round((1 - distance / maxLen) * 100);
}

export async function runSimpleDeduplication(threshold: number = 85): Promise<{
  nodeCandidatesCreated: number;
  nodesAnalyzed: number;
  totalDuplicatesFound: number;
}> {
  console.log(`Running simple deduplication with threshold ${threshold}%`);
  
  // Get all approved nodes
  const approvedNodes = await storage.getGraphNodesByStatus("approved");
  console.log(`Analyzing ${approvedNodes.length} approved nodes`);
  
  // Group nodes by document to find cross-document duplicates
  const nodesByDocument = new Map<string, GraphNode[]>();
  for (const node of approvedNodes) {
    const docId = node.documentId || 'unknown';
    if (!nodesByDocument.has(docId)) {
      nodesByDocument.set(docId, []);
    }
    nodesByDocument.get(docId)!.push(node);
  }
  
  let candidatesCreated = 0;
  let existingCandidates = 0;
  const checkedPairs = new Set<string>();
  
  // Find duplicates across different documents
  const docIds = Array.from(nodesByDocument.keys());
  for (let i = 0; i < docIds.length; i++) {
    for (let j = i + 1; j < docIds.length; j++) {
      const doc1Nodes = nodesByDocument.get(docIds[i])!;
      const doc2Nodes = nodesByDocument.get(docIds[j])!;
      
      // Compare nodes between documents
      for (const node1 of doc1Nodes) {
        for (const node2 of doc2Nodes) {
          const pairKey = [node1.id, node2.id].sort().join('_');
          if (checkedPairs.has(pairKey)) continue;
          checkedPairs.add(pairKey);
          
          // Calculate similarity
          const similarity = stringSimilarity(node1.name, node2.name);
          
          if (similarity >= threshold) {
            // Check if candidate already exists with pending status
            const existing = await storage.getDuplicateCandidateByNodePair(node1.id, node2.id);
            // Only skip if there's already a pending candidate
            // Allow creating new candidates if the existing one is kept_separate or merged
            if (!existing || (existing.status !== "pending" && existing.status !== "merged")) {
              console.log(`Found duplicate: "${node1.name}" = "${node2.name}" (${similarity}%)`);
              
              // Delete the old candidate if it exists and is not pending/merged
              if (existing && existing.status === "kept_separate") {
                await storage.deleteDuplicateCandidate(existing.id);
              }
              
              await storage.createDuplicateCandidate({
                nodeId1: node1.id,
                nodeId2: node2.id,
                similarityScore: similarity.toString(),
                status: "pending"
              });
              
              candidatesCreated++;
            } else if (existing && existing.status === "pending") {
              // Count existing pending candidates
              existingCandidates++;
            }
          }
        }
      }
    }
  }
  
  // Also check for exact duplicates within the same document (less likely but possible)
  for (const [docId, nodes] of nodesByDocument) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const node1 = nodes[i];
        const node2 = nodes[j];
        
        const pairKey = [node1.id, node2.id].sort().join('_');
        if (checkedPairs.has(pairKey)) continue;
        checkedPairs.add(pairKey);
        
        const similarity = stringSimilarity(node1.name, node2.name);
        
        if (similarity >= threshold) {
          const existing = await storage.getDuplicateCandidateByNodePair(node1.id, node2.id);
          // Only skip if there's already a pending candidate
          // Allow creating new candidates if the existing one is kept_separate or merged
          if (!existing || (existing.status !== "pending" && existing.status !== "merged")) {
            console.log(`Found duplicate in same doc: "${node1.name}" = "${node2.name}" (${similarity}%)`);
            
            // Delete the old candidate if it exists and is not pending/merged
            if (existing && existing.status === "kept_separate") {
              await storage.deleteDuplicateCandidate(existing.id);
            }
            
            await storage.createDuplicateCandidate({
              nodeId1: node1.id,
              nodeId2: node2.id,
              similarityScore: similarity.toString(),
              status: "pending"
            });
            
            candidatesCreated++;
          } else if (existing && existing.status === "pending") {
            // Count existing pending candidates
            existingCandidates++;
          }
        }
      }
    }
  }
  
  const totalDuplicates = candidatesCreated + existingCandidates;
  console.log(`Deduplication complete: ${candidatesCreated} new duplicates created, ${existingCandidates} existing, ${totalDuplicates} total`);
  
  return {
    nodeCandidatesCreated: candidatesCreated,
    nodesAnalyzed: approvedNodes.length,
    totalDuplicatesFound: totalDuplicates
  };
}