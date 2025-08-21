import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function Deduplication() {
  const [similarityThreshold, setSimilarityThreshold] = useState([85]);
  const [algorithmType, setAlgorithmType] = useState("semantic");
  // Removed unused selectedCandidate state - using direct merge
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: candidatesResponse, refetch: refetchCandidates } = useQuery({
    queryKey: ["/api/duplicates/candidates"],
  });
  
  const candidates = (candidatesResponse as any)?.candidates || [];

  const runAnalysisMutation = useMutation({
    mutationFn: async ({ threshold, algorithmType }: { threshold: number; algorithmType: string }) => {
      const response = await apiRequest("POST", "/api/duplicates/analyze", { threshold, algorithmType });
      return response.json();
    },
    onSuccess: (data) => {
      refetchCandidates();
      queryClient.invalidateQueries({ queryKey: ["/api/duplicates/stats"] });
      toast({
        title: "Analysis Complete", 
        description: `Found ${data.nodeCandidatesCreated} node duplicates and ${data.relationCandidatesCreated} relation duplicates from ${data.nodesAnalyzed} nodes and ${data.relationsAnalyzed} relations`,
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

  const mergeCandidateMutation = useMutation({
    mutationFn: async (candidateId: string) => {
      const response = await apiRequest("POST", `/api/duplicates/${candidateId}/merge`, {});
      return response.json();
    },
    onSuccess: () => {
      refetchCandidates();
      queryClient.invalidateQueries({ queryKey: ["/api/nodes/approved"] });
      toast({
        title: "Merge successful",
        description: "The duplicate nodes have been merged successfully",
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

  const keepSeparateMutation = useMutation({
    mutationFn: async (candidateId: string) => {
      const response = await apiRequest("POST", `/api/duplicates/${candidateId}/keep-separate`, {});
      return response.json();
    },
    onSuccess: () => {
      refetchCandidates();
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

  const { data: statsResponse } = useQuery({
    queryKey: ["/api/duplicates/stats"],
  });

  const stats = {
    potentialDuplicates: candidates.length,
    autoMerged: (statsResponse as any)?.autoMerged || 0,
    accuracyRate: (statsResponse as any)?.accuracyRate || 0
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-900">Deduplication Engine</h3>
        <p className="text-carbon-gray-60">Identify and merge similar nodes and relations to maintain graph integrity</p>
      </div>

      {/* Deduplication Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-carbon-yellow bg-opacity-10 rounded-lg flex items-center justify-center">
                <i className="fas fa-exclamation-triangle text-carbon-yellow text-xl"></i>
              </div>
              <div className="ml-4">
                <p className="text-2xl font-semibold text-gray-900">{stats.potentialDuplicates}</p>
                <p className="text-carbon-gray-60">Potential Duplicates</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-carbon-green bg-opacity-10 rounded-lg flex items-center justify-center">
                <i className="fas fa-compress-arrows-alt text-carbon-green text-xl"></i>
              </div>
              <div className="ml-4">
                <p className="text-2xl font-semibold text-gray-900">{stats.autoMerged}</p>
                <p className="text-carbon-gray-60">Merged</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-carbon-blue bg-opacity-10 rounded-lg flex items-center justify-center">
                <i className="fas fa-percentage text-carbon-blue text-xl"></i>
              </div>
              <div className="ml-4">
                <p className="text-2xl font-semibold text-gray-900">{stats.accuracyRate}%</p>
                <p className="text-carbon-gray-60">Merge Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Deduplication Algorithm Settings */}
      <Card className="mb-6">
        <div className="border-b border-carbon-gray-20 p-4">
          <h4 className="font-medium text-gray-900">Algorithm Configuration</h4>
        </div>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Similarity Threshold
              </label>
              <div className="flex items-center space-x-4">
                <Slider
                  value={similarityThreshold}
                  onValueChange={setSimilarityThreshold}
                  max={100}
                  min={0}
                  step={1}
                  className="flex-1"
                />
                <span className="text-sm text-carbon-gray-60 w-12">{similarityThreshold[0]}%</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Algorithm Type
              </label>
              <Select value={algorithmType} onValueChange={setAlgorithmType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="semantic">Semantic Similarity (BERT)</SelectItem>
                  <SelectItem value="edit">Edit Distance</SelectItem>
                  <SelectItem value="hybrid">Hybrid Approach</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-6 flex space-x-3">
            <Button 
              onClick={() => runAnalysisMutation.mutate({ 
                threshold: similarityThreshold[0], 
                algorithmType 
              })}
              disabled={runAnalysisMutation.isPending}
            >
              <i className="fas fa-play mr-2"></i>
              {runAnalysisMutation.isPending ? "Analyzing..." : "Run Deduplication"}
            </Button>
            <Button variant="outline">
              <i className="fas fa-save mr-2"></i>
              Save Settings
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Duplicate Candidates */}
      <Card>
        <div className="border-b border-carbon-gray-20 p-4">
          <h4 className="font-medium text-gray-900">Review Duplicate Candidates</h4>
        </div>
        <CardContent className="p-4">
          {candidates.length === 0 ? (
            <div className="text-center py-8 text-carbon-gray-60">
              <i className="fas fa-check-circle text-4xl mb-4"></i>
              <p>No duplicate candidates found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {candidates.map((candidate: any) => (
                <div key={candidate.id} className="border border-carbon-gray-20 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-carbon-yellow bg-opacity-10 text-carbon-yellow">
                      {candidate.similarityScore}% similarity
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        className="bg-carbon-green text-white hover:bg-green-600"
                        onClick={() => mergeCandidateMutation.mutate(candidate.id)}
                        disabled={mergeCandidateMutation.isPending}
                      >
                        <i className="fas fa-compress-arrows-alt mr-1"></i>
                        Choose & Merge
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => keepSeparateMutation.mutate(candidate.id)}
                        disabled={keepSeparateMutation.isPending}
                      >
                        <i className="fas fa-times mr-1"></i>
                        Keep Separate
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="border border-carbon-gray-20 rounded p-3">
                      <h5 className="font-medium text-gray-900 mb-2">{candidate.node1?.name || "Node A"}</h5>
                      <div className="mb-2">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {candidate.node1?.type || "unknown"}
                        </span>
                      </div>
                      <p className="text-sm text-carbon-gray-60 mb-2">
                        {candidate.node1?.description || "No description available"}
                      </p>
                      <p className="text-xs text-carbon-gray-50">
                        Source: {candidate.node1?.documentName || "Unknown document"}
                      </p>
                    </div>
                    <div className="border border-carbon-gray-20 rounded p-3">
                      <h5 className="font-medium text-gray-900 mb-2">{candidate.node2?.name || "Node B"}</h5>
                      <div className="mb-2">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {candidate.node2?.type || "unknown"}
                        </span>
                      </div>
                      <p className="text-sm text-carbon-gray-60 mb-2">
                        {candidate.node2?.description || "No description available"}
                      </p>
                      <p className="text-xs text-carbon-gray-50">
                        Source: {candidate.node2?.documentName || "Unknown document"}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
