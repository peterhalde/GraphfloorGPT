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
import { CheckCircle, ChevronRight } from "lucide-react";

export default function DeduplicationSequential() {
  const [similarityThreshold, setSimilarityThreshold] = useState([85]);
  const [currentStep, setCurrentStep] = useState<'deduplication' | 'categories' | 'preview'>('deduplication');
  const [deduplicationComplete, setDeduplicationComplete] = useState(false);
  const [categoriesComplete, setCategoriesComplete] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch duplicate groups
  const { data: groupsResponse, refetch: refetchGroups } = useQuery({
    queryKey: ["/api/duplicates/groups"],
  });
  
  const duplicateGroups = (groupsResponse as any)?.groups || [];

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
  
  // Map AI-extracted types to actual categories
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
    if (categoryMap[nodeType]) {
      return categoryMap[nodeType];
    }
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
      refetchGroups();
      queryClient.invalidateQueries({ queryKey: ["/api/duplicates/groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/duplicates/stats"] });
      // Refresh approved nodes after analysis to ensure consistency
      queryClient.invalidateQueries({ queryKey: ["/api/nodes/approved"] });
      toast({
        title: "Analysis Complete", 
        description: `Found ${data.totalDuplicatesFound || data.nodeCandidatesCreated} duplicate candidates`,
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

  // Process duplicate group mutation
  const processGroupMutation = useMutation({
    mutationFn: async ({ groupId, action, nodeIds }: { groupId: string; action: 'merge_all' | 'keep_all'; nodeIds: string[] }) => {
      const response = await apiRequest("POST", `/api/duplicates/groups/${groupId}/process`, { action, nodeIds });
      return response.json();
    },
    onSuccess: (data, variables) => {
      refetchGroups();
      refetchPreview();
      queryClient.invalidateQueries({ queryKey: ["/api/duplicates/groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/duplicates/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/graph/preview"] });
      // Important: Invalidate approved nodes to remove merged duplicates from category management
      queryClient.invalidateQueries({ queryKey: ["/api/nodes/approved"] });
      toast({
        title: variables.action === 'merge_all' ? "Merge successful" : "Kept as separate",
        description: data.message,
      });
    },
    onError: (error) => {
      toast({
        title: "Processing failed",
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
      refetchGroups();
      queryClient.invalidateQueries({ queryKey: ["/api/graph/preview"] });
      queryClient.invalidateQueries({ queryKey: ["/api/duplicates/groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/nodes/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/nodes/pending"] });
      setDeduplicationComplete(false);
      setCategoriesComplete(false);
      setCurrentStep('deduplication');
      toast({
        title: "Preview Cleared",
        description: data.message || `Reset ${data.resetNodes} nodes and ${data.resetRelations} relations`,
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
    potentialDuplicates: duplicateGroups.length,
    mergedCount: (statsResponse as any)?.mergedCount || 0,
    keptSeparate: (statsResponse as any)?.keptSeparateCount || 0
  };

  const handleProceedToCategories = async () => {
    if (duplicateGroups.length === 0) {
      // Force refresh of approved nodes to ensure merged nodes are excluded
      await queryClient.invalidateQueries({ queryKey: ["/api/nodes/approved"] });
      await queryClient.refetchQueries({ queryKey: ["/api/nodes/approved"] });
      
      setDeduplicationComplete(true);
      setCurrentStep('categories');
    } else {
      toast({
        title: "Duplicates Remain",
        description: "Please resolve all duplicate groups before proceeding",
        variant: "destructive",
      });
    }
  };

  const handleProceedToPreview = () => {
    setCategoriesComplete(true);
    setCurrentStep('preview');
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Progress Steps */}
      <div className="flex items-center justify-center space-x-4 mb-6">
        <div className={`flex items-center space-x-2 ${currentStep === 'deduplication' ? 'text-blue-600' : deduplicationComplete ? 'text-green-600' : 'text-gray-400'}`}>
          {deduplicationComplete ? <CheckCircle className="w-5 h-5" /> : <span className="w-5 h-5 rounded-full border-2 border-current" />}
          <span className="font-medium">1. Deduplication</span>
        </div>
        <ChevronRight className="text-gray-400" />
        <div className={`flex items-center space-x-2 ${currentStep === 'categories' ? 'text-blue-600' : categoriesComplete ? 'text-green-600' : 'text-gray-400'}`}>
          {categoriesComplete ? <CheckCircle className="w-5 h-5" /> : <span className="w-5 h-5 rounded-full border-2 border-current" />}
          <span className="font-medium">2. Categories</span>
        </div>
        <ChevronRight className="text-gray-400" />
        <div className={`flex items-center space-x-2 ${currentStep === 'preview' ? 'text-blue-600' : 'text-gray-400'}`}>
          <span className="w-5 h-5 rounded-full border-2 border-current" />
          <span className="font-medium">3. Graph Preview</span>
        </div>
      </div>

      {/* Step Content */}
      {currentStep === 'deduplication' && (
        <div className="space-y-6">
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-900">Step 1: Deduplication</h3>
            <p className="text-carbon-gray-60">Identify and resolve duplicate nodes before proceeding</p>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center">
                  <i className="fas fa-exclamation-triangle text-carbon-yellow text-xl mr-3"></i>
                  <div>
                    <p className="text-xl font-semibold">{stats.potentialDuplicates}</p>
                    <p className="text-xs text-carbon-gray-60">Duplicate Groups</p>
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
                  data-testid="button-detect-duplicates"
                >
                  <i className={`fas ${runAnalysisMutation.isPending ? 'fa-spinner fa-spin' : 'fa-search'} mr-2`}></i>
                  {runAnalysisMutation.isPending ? "Analyzing..." : "Detect Duplicates"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Duplicate Groups */}
          <Card>
            <div className="border-b border-carbon-gray-20 p-4 flex justify-between items-center">
              <div>
                <h4 className="font-medium text-gray-900">Duplicate Groups</h4>
                <p className="text-xs text-carbon-gray-60 mt-1">Review groups of duplicate nodes</p>
              </div>
              <Button 
                onClick={handleProceedToCategories}
                disabled={duplicateGroups.length > 0}
                className="bg-carbon-blue hover:bg-blue-700"
                data-testid="button-proceed-categories"
              >
                Proceed to Categories
                <ChevronRight className="ml-2 w-4 h-4" />
              </Button>
            </div>
            <CardContent className="p-4 max-h-[600px] overflow-y-auto">
              {duplicateGroups.length === 0 ? (
                <div className="text-center py-8 text-carbon-gray-60">
                  <i className="fas fa-check-circle text-4xl mb-4 text-carbon-green"></i>
                  <p className="font-medium">No duplicates found</p>
                  <p className="text-sm mt-2">Click "Proceed to Categories" to continue</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {duplicateGroups.map((group: any) => (
                    <div key={group.id} className="border border-carbon-gray-20 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h5 className="font-medium text-gray-900 mb-1">
                            Group: {group.name}
                          </h5>
                          <Badge variant="secondary" className="text-xs">
                            {group.count} duplicates found
                          </Badge>
                        </div>
                        <div className="flex space-x-2">
                          <Button
                            size="sm"
                            onClick={() => processGroupMutation.mutate({
                              groupId: group.id,
                              action: 'merge_all',
                              nodeIds: group.nodes.map((n: any) => n.id)
                            })}
                            disabled={processGroupMutation.isPending}
                            className="bg-carbon-green hover:bg-green-700"
                            data-testid={`button-merge-${group.id}`}
                          >
                            <i className="fas fa-compress-arrows-alt mr-1"></i>
                            Merge All
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => processGroupMutation.mutate({
                              groupId: group.id,
                              action: 'keep_all',
                              nodeIds: group.nodes.map((n: any) => n.id)
                            })}
                            disabled={processGroupMutation.isPending}
                            data-testid={`button-keep-${group.id}`}
                          >
                            Keep All Separate
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {group.nodes.map((node: any) => (
                          <div key={node.id} className="bg-gray-50 p-2 rounded text-sm">
                            <p className="font-medium">{node.name}</p>
                            <p className="text-xs text-gray-600">{node.type} • {node.documentName}</p>
                            <p className="text-xs text-gray-500 mt-1">{node.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {currentStep === 'categories' && (
        <div className="space-y-6">
          <div className="mb-6 flex justify-between items-center">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Step 2: Category Management</h3>
              <p className="text-carbon-gray-60">Organize your nodes into categories</p>
            </div>
            <Button 
              onClick={handleProceedToPreview}
              className="bg-carbon-blue hover:bg-blue-700"
              data-testid="button-proceed-preview"
            >
              Proceed to Preview
              <ChevronRight className="ml-2 w-4 h-4" />
            </Button>
          </div>
          <CategoryManager />
        </div>
      )}

      {currentStep === 'preview' && (
        <div className="space-y-6">
          <div className="mb-6 flex justify-between items-center">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Step 3: Final Graph Preview</h3>
              <p className="text-carbon-gray-60">Review your deduplicated graph before adding to database</p>
            </div>
            <Button 
              variant="outline"
              onClick={() => clearPreviewMutation.mutate()}
              disabled={clearPreviewMutation.isPending}
              className="text-orange-600 border-orange-600 hover:bg-orange-50"
              data-testid="button-start-over"
            >
              <i className={`fas ${clearPreviewMutation.isPending ? 'fa-spinner fa-spin' : 'fa-undo'} mr-1`}></i>
              Start Over
            </Button>
          </div>

          <Card>
            <div className="border-b border-carbon-gray-20 p-4 bg-gradient-to-r from-blue-50 to-green-50">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-gray-900">Final Graph</h4>
                  <p className="text-xs text-carbon-gray-60 mt-1">
                    {preview.nodes.length} nodes • {preview.relations.length} relations
                  </p>
                </div>
                {(preview.nodes.length > 0 || preview.relations.length > 0) && (
                  <Button 
                    size="sm"
                    onClick={() => addToGraphMutation.mutate()}
                    disabled={addToGraphMutation.isPending}
                    className="bg-carbon-blue hover:bg-blue-700"
                    data-testid="button-add-to-graph"
                  >
                    <i className={`fas ${addToGraphMutation.isPending ? 'fa-spinner fa-spin' : 'fa-database'} mr-1`}></i>
                    {addToGraphMutation.isPending ? "Adding..." : "Add to Graph Database"}
                  </Button>
                )}
              </div>
            </div>
            <CardContent className="p-4 max-h-[600px] overflow-y-auto">
              <div className="space-y-4">
                {/* Nodes Section */}
                <div>
                  <h5 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                    <i className="fas fa-circle-nodes text-carbon-blue mr-2"></i>
                    Nodes ({preview.nodes.length})
                  </h5>
                  {preview.nodes.length === 0 ? (
                    <p className="text-xs text-carbon-gray-60 italic">No nodes in preview</p>
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
                    <p className="text-xs text-carbon-gray-60 italic">No relations in preview</p>
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
      )}
    </div>
  );
}