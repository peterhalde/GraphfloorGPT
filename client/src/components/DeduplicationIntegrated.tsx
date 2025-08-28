import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import CategoryManager from "@/components/CategoryManager";

export default function DeduplicationIntegrated() {
  const [similarityThreshold, setSimilarityThreshold] = useState([85]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch duplicate candidates
  const { data: candidatesResponse, refetch: refetchCandidates } = useQuery({
    queryKey: ["/api/duplicates/candidates"],
  });
  
  const candidates = (candidatesResponse as any)?.candidates || [];

  // Fetch preview data
  const { data: previewData, refetch: refetchPreview } = useQuery({
    queryKey: ["/api/graph/preview"],
  });

  const preview = previewData?.preview || { nodes: [], relations: [] };
  
  // Fetch categories to get colors
  const { data: categoriesData } = useQuery({
    queryKey: ["/api/categories"],
  });
  
  const categories = categoriesData?.categories || [];
  
  // Create a map of category IDs to their colors and names
  const categoryMap = categories.reduce((acc: any, cat: any) => {
    acc[cat.id] = { name: cat.name, color: cat.color };
    return acc;
  }, {});
  
  // Map AI-extracted types to actual categories (same as CategoryManager)
  const typeMapping: Record<string, string> = {
    "person": "entity",
    "equipment": "entity",
    "organization": "entity", 
    "location": "entity",
    "material": "ingredient",
    "process": "process",
    "concept": "concept",
  };
  
  // Helper function to get the correct category for a node
  const getCategoryForNode = (nodeType: string) => {
    // First check if it's already a valid category
    if (categoryMap[nodeType]) {
      return categoryMap[nodeType];
    }
    
    // Try to map it to an existing category
    const mappedType = typeMapping[nodeType] || "unknown";
    return categoryMap[mappedType] || { name: "Unknown", color: "#525252" };
  };

  // Run analysis mutation
  const runAnalysisMutation = useMutation({
    mutationFn: async ({ threshold }: { threshold: number }) => {
      const response = await fetch("/api/duplicates/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threshold, algorithmType: 'simple' }),
      });
      
      if (!response.ok) {
        throw new Error("Analysis failed");
      }
      return response.json();
    },
    onSuccess: (data) => {
      refetchCandidates();
      queryClient.invalidateQueries({ queryKey: ["/api/duplicates/stats"] });
      toast({
        title: "Analysis Complete", 
        description: `Found ${data.nodeCandidatesCreated} duplicate candidates`,
      });
    },
    onError: (error) => {
      toast({
        title: "Analysis Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Merge candidate mutation
  const mergeCandidateMutation = useMutation({
    mutationFn: async (candidateId: string) => {
      const response = await apiRequest("POST", `/api/duplicates/${candidateId}/merge`, {});
      return response.json();
    },
    onSuccess: () => {
      refetchCandidates();
      refetchPreview();
      queryClient.invalidateQueries({ queryKey: ["/api/nodes/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/nodes/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/relations/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/duplicates/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/graph/preview"] });
      toast({
        title: "Merge successful",
        description: "The duplicate nodes have been merged",
      });
    },
    onError: (error) => {
      toast({
        title: "Merge failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Keep separate mutation
  const keepSeparateMutation = useMutation({
    mutationFn: async (candidateId: string) => {
      const response = await apiRequest("POST", `/api/duplicates/${candidateId}/keep-separate`, {});
      return response.json();
    },
    onSuccess: () => {
      refetchCandidates();
      queryClient.invalidateQueries({ queryKey: ["/api/duplicates/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/nodes/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/nodes/pending"] });
      toast({
        title: "Marked as separate",
        description: "The nodes have been marked as separate entities",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to mark as separate",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete candidate mutation
  const deleteCandidateMutation = useMutation({
    mutationFn: async (candidateId: string) => {
      const response = await apiRequest("DELETE", `/api/duplicates/${candidateId}`, {});
      return response.json();
    },
    onSuccess: () => {
      refetchCandidates();
      queryClient.invalidateQueries({ queryKey: ["/api/duplicates/stats"] });
      toast({
        title: "Deleted candidate",
        description: "The duplicate candidate has been removed",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to delete candidate",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Add to graph mutation
  const addToGraphMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/graph/add-from-preview", {});
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/graph/preview"] });
      queryClient.invalidateQueries({ queryKey: ["/api/graph/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/nodes/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/relations/approved"] });
      toast({
        title: "Added to Graph",
        description: `Successfully added ${data.nodesAdded} nodes and ${data.relationsAdded} relations to the graph`,
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to add to graph",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Clear preview mutation
  const clearPreviewMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/graph/clear-preview", {});
      return response.json();
    },
    onSuccess: (data) => {
      refetchPreview();
      refetchCandidates();
      queryClient.invalidateQueries({ queryKey: ["/api/graph/preview"] });
      queryClient.invalidateQueries({ queryKey: ["/api/duplicates/candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/nodes/approved"] });
      toast({
        title: "Preview Cleared",
        description: `Reset ${data.resetNodes} merged nodes`,
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to clear preview",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const { data: statsResponse } = useQuery({
    queryKey: ["/api/duplicates/stats"],
  });

  const stats = {
    potentialDuplicates: candidates.length,
    mergedCount: (statsResponse as any)?.mergedCount || 0,
    keptSeparate: (statsResponse as any)?.keptSeparateCount || 0
  };

  return (
    <div className="max-w-7xl mx-auto">
      <Tabs defaultValue="deduplication" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="deduplication">Deduplication & Preview</TabsTrigger>
          <TabsTrigger value="categories">Category Management</TabsTrigger>
        </TabsList>
        
        <TabsContent value="deduplication" className="space-y-6">
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-900">Deduplication & Graph Preview</h3>
            <p className="text-carbon-gray-60">Review duplicates and see how your graph will look after merging</p>
          </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <i className="fas fa-exclamation-triangle text-carbon-yellow text-xl mr-3"></i>
              <div>
                <p className="text-xl font-semibold">{stats.potentialDuplicates}</p>
                <p className="text-xs text-carbon-gray-60">Pending Review</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <i className="fas fa-compress-arrows-alt text-carbon-green text-xl mr-3"></i>
              <div>
                <p className="text-xl font-semibold">{stats.mergedCount}</p>
                <p className="text-xs text-carbon-gray-60">Merged</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <i className="fas fa-times-circle text-carbon-red text-xl mr-3"></i>
              <div>
                <p className="text-xl font-semibold">{stats.keptSeparate}</p>
                <p className="text-xs text-carbon-gray-60">Kept Separate</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <i className="fas fa-circle-nodes text-carbon-blue text-xl mr-3"></i>
              <div>
                <p className="text-xl font-semibold">{preview.nodes.length}</p>
                <p className="text-xs text-carbon-gray-60">Final Nodes</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <i className="fas fa-project-diagram text-carbon-purple text-xl mr-3"></i>
              <div>
                <p className="text-xl font-semibold">{preview.relations.length}</p>
                <p className="text-xs text-carbon-gray-60">Final Relations</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detection Settings */}
      <Card>
        <div className="border-b border-carbon-gray-20 p-4">
          <h4 className="font-medium text-gray-900">Detection Settings</h4>
        </div>
        <CardContent className="p-4">
          <div className="flex items-center space-x-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Similarity Threshold
              </label>
              <div className="flex items-center space-x-3">
                <Slider
                  value={similarityThreshold}
                  onValueChange={setSimilarityThreshold}
                  max={100}
                  min={70}
                  step={5}
                  className="flex-1"
                />
                <span className="text-sm text-carbon-gray-60 w-12">{similarityThreshold[0]}%</span>
              </div>
              <p className="text-xs text-carbon-gray-60 mt-1">
                Uses fast string matching to detect duplicates
              </p>
            </div>
            <Button 
              onClick={() => runAnalysisMutation.mutate({ threshold: similarityThreshold[0] })}
              disabled={runAnalysisMutation.isPending}
              className="mt-6"
            >
              <i className={`fas ${runAnalysisMutation.isPending ? 'fa-spinner fa-spin' : 'fa-search'} mr-2`}></i>
              {runAnalysisMutation.isPending ? "Analyzing..." : "Detect Duplicates"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Duplicate Candidates */}
        <div className="space-y-4">
          <Card>
            <div className="border-b border-carbon-gray-20 p-4">
              <h4 className="font-medium text-gray-900">Duplicate Candidates</h4>
              <p className="text-xs text-carbon-gray-60 mt-1">Review and resolve potential duplicates</p>
            </div>
            <CardContent className="p-4 max-h-[600px] overflow-y-auto">
              {candidates.length === 0 ? (
                <div className="text-center py-8 text-carbon-gray-60">
                  <i className="fas fa-check-circle text-4xl mb-4 text-carbon-green"></i>
                  <p className="font-medium">No duplicates to review</p>
                  <p className="text-sm mt-2">Click "Detect Duplicates" to search for duplicates</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {candidates.map((candidate: any) => (
                    <div key={candidate.id} className="border border-carbon-gray-20 rounded-lg p-3 hover:shadow-md transition-shadow">
                      <div className="space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <Badge variant="secondary" className="text-xs">
                                {candidate.similarityScore}% match
                              </Badge>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div className="bg-blue-50 p-2 rounded">
                                <p className="font-medium text-blue-900">{candidate.node1.name}</p>
                                <p className="text-xs text-blue-700">{candidate.node1.type}</p>
                              </div>
                              <div className="bg-green-50 p-2 rounded">
                                <p className="font-medium text-green-900">{candidate.node2.name}</p>
                                <p className="text-xs text-green-700">{candidate.node2.type}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-end space-x-2">
                          <Button
                            size="sm"
                            onClick={() => mergeCandidateMutation.mutate(candidate.id)}
                            disabled={mergeCandidateMutation.isPending}
                            className="bg-carbon-green hover:bg-green-700"
                          >
                            <i className="fas fa-compress-arrows-alt mr-1"></i>
                            Merge
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => keepSeparateMutation.mutate(candidate.id)}
                            disabled={keepSeparateMutation.isPending}
                          >
                            Keep Separate
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => deleteCandidateMutation.mutate(candidate.id)}
                            disabled={deleteCandidateMutation.isPending}
                            className="text-red-600 border-red-600 hover:bg-red-50"
                          >
                            <i className="fas fa-trash mr-1"></i>
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Live Preview */}
        <div className="space-y-4">
          <Card>
            <div className="border-b border-carbon-gray-20 p-4 bg-gradient-to-r from-blue-50 to-green-50">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-gray-900">Graph Preview (After Merges)</h4>
                  <p className="text-xs text-carbon-gray-60 mt-1">
                    Shows how your graph will look with current merge decisions
                  </p>
                </div>
                <div className="flex space-x-2">
                  {(preview.nodes.length > 0 || preview.relations.length > 0) && (
                    <>
                      <Button 
                        size="sm"
                        onClick={() => addToGraphMutation.mutate()}
                        disabled={addToGraphMutation.isPending}
                        className="bg-carbon-blue hover:bg-blue-700"
                      >
                        <i className={`fas ${addToGraphMutation.isPending ? 'fa-spinner fa-spin' : 'fa-database'} mr-1`}></i>
                        {addToGraphMutation.isPending ? "Adding..." : "Add to Graph"}
                      </Button>
                      <Button 
                        size="sm"
                        variant="outline"
                        onClick={() => clearPreviewMutation.mutate()}
                        disabled={clearPreviewMutation.isPending}
                        className="text-orange-600 border-orange-600 hover:bg-orange-50"
                      >
                        <i className={`fas ${clearPreviewMutation.isPending ? 'fa-spinner fa-spin' : 'fa-eraser'} mr-1`}></i>
                        {clearPreviewMutation.isPending ? "Clearing..." : "Clear Preview"}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
            <CardContent className="p-4 max-h-[530px] overflow-y-auto">
              <div className="space-y-4">
                {/* Nodes Section */}
                <div>
                  <h5 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                    <i className="fas fa-circle-nodes text-carbon-blue mr-2"></i>
                    Nodes ({preview.nodes.length})
                  </h5>
                  {preview.nodes.length === 0 ? (
                    <p className="text-xs text-carbon-gray-60 italic">No approved nodes yet</p>
                  ) : (
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      {preview.nodes.map((node: any) => {
                        const category = getCategoryForNode(node.type);
                        return (
                          <div key={node.id} className="bg-gray-50 rounded px-3 py-2">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <p className="text-sm font-medium">{node.name}</p>
                                <p className="text-xs text-carbon-gray-60">{node.description}</p>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Badge 
                                  variant="outline" 
                                  className="text-xs"
                                  style={{ 
                                    backgroundColor: category.color + '20',
                                    borderColor: category.color,
                                    color: category.color
                                  }}
                                >
                                  {category.name}
                                </Badge>
                                {node.status === 'merged' && (
                                  <Badge variant="outline" className="text-xs bg-purple-100 text-purple-800 border-purple-300">
                                    Merged
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Relations Section */}
                <div>
                  <h5 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                    <i className="fas fa-project-diagram text-carbon-green mr-2"></i>
                    Relations ({preview.relations.length})
                  </h5>
                  {preview.relations.length === 0 ? (
                    <p className="text-xs text-carbon-gray-60 italic">No approved relations yet</p>
                  ) : (
                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      {preview.relations.map((relation: any) => (
                        <div key={relation.id} className="bg-gray-50 rounded px-3 py-2">
                          <div className="flex items-center space-x-2 text-xs">
                            <span className="font-medium">{relation.fromNodeName}</span>
                            <span className="text-carbon-blue">→</span>
                            <span className="font-medium">{relation.toNodeName}</span>
                            <Badge className="ml-auto text-xs" variant="secondary">
                              {relation.relationshipType}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
        </TabsContent>
        
        <TabsContent value="categories">
          <CategoryManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}