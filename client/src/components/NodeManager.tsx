import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CheckCircle, Trash2 } from "lucide-react";

export default function NodeManager() {
  const [approvedNodesLimit, setApprovedNodesLimit] = useState(10);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: pendingData } = useQuery({
    queryKey: ["/api/nodes/pending"],
  });

  const { data: approvedNodesResponse } = useQuery({
    queryKey: ["/api/nodes/approved"],
  });
  
  const { data: approvedRelationsResponse } = useQuery({
    queryKey: ["/api/relations/approved"],
  });
  
  const approvedNodes = approvedNodesResponse?.nodes || [];
  const approvedRelations = approvedRelationsResponse?.relations || [];
  const approvedItems = [...approvedNodes, ...approvedRelations];

  const updateNodeStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await apiRequest("PATCH", `/api/nodes/${id}/status`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/nodes/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/nodes/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/graph/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/graph/preview"] });
      toast({
        title: "Node updated",
        description: "Node status has been updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateRelationStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await apiRequest("PATCH", `/api/relations/${id}/status`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/nodes/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/relations/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/graph/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/graph/preview"] });
      toast({
        title: "Relation updated",
        description: "Relation status has been updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const approveAllMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/nodes/approve-all", {});
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/nodes/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/nodes/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/relations/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/graph/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/graph/preview"] });
      toast({
        title: "Success",
        description: `Approved ${data.approvedNodes} nodes and ${data.approvedRelations} relations.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to approve all items.",
        variant: "destructive",
      });
    }
  });

  const deleteNodeMutation = useMutation({
    mutationFn: async (nodeId: string) => {
      return await apiRequest("DELETE", `/api/nodes/${nodeId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/nodes/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/nodes/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/graph/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/graph/preview"] });
      toast({
        title: "Success",
        description: "Node and all its relations deleted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete node.",
        variant: "destructive",
      });
    }
  });

  const deleteRelationMutation = useMutation({
    mutationFn: async (relationId: string) => {
      return await apiRequest("DELETE", `/api/relations/${relationId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/nodes/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/nodes/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/graph/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/graph/preview"] });
      queryClient.invalidateQueries({ queryKey: ["/api/relations/approved"] });
      toast({
        title: "Success",
        description: "Relation deleted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete relation.",
        variant: "destructive",
      });
    }
  });

  const pendingNodes = pendingData?.nodes || [];
  const pendingRelations = pendingData?.relations || [];
  const pendingItems = [...pendingNodes, ...pendingRelations];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Node & Relation Management</h3>
              <p className="text-carbon-gray-60">Review and approve suggested nodes and relations from your documents</p>
            </div>
            <div className="flex space-x-3">
              <Button
                onClick={() => approveAllMutation.mutate()}
                disabled={approveAllMutation.isPending || pendingItems.length === 0}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Approve All ({pendingItems.length})
              </Button>
              <Button variant="outline">
                <i className="fas fa-filter mr-2"></i>
                Filter
              </Button>
              <Button>
                <i className="fas fa-plus mr-2"></i>
                Add Manual Node
              </Button>
            </div>
          </div>

          {/* Pending Approval Section */}
          <Card className="mb-6">
        <div className="border-b border-carbon-gray-20 p-4">
          <h4 className="font-medium text-gray-900 flex items-center">
            <i className="fas fa-clock text-carbon-yellow mr-2"></i>
            Pending Approval ({pendingItems.length})
          </h4>
        </div>
        <CardContent className="p-4">
          {pendingItems.length === 0 ? (
            <div className="text-center py-8 text-carbon-gray-60">
              <i className="fas fa-check-circle text-4xl mb-4"></i>
              <p>No pending items for review</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingItems.map((item: any) => (
                <div key={item.id} className="border border-carbon-gray-20 rounded-lg p-4 hover:bg-carbon-gray-10 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <Badge className={item.relationshipType ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}>
                          {item.relationshipType ? "Relation" : "Node"}
                        </Badge>
                        <h5 className="font-medium text-gray-900">
                          {item.relationshipType 
                            ? `${item.fromNodeName} → ${item.toNodeName}` 
                            : item.name}
                        </h5>
                        {item.relationshipType && (
                          <span className="text-sm text-blue-600 font-medium">{item.relationshipType}</span>
                        )}
                      </div>
                      <p className="text-carbon-gray-60 text-sm mb-3">
                        {item.description}
                      </p>
                      <div className="flex items-center space-x-4 text-sm text-carbon-gray-60">
                        <span>Source: Document</span>
                        <span>Confidence: {Math.round((item.confidence || 0) * 100)}%</span>
                        {item.type && <span>Type: {item.type}</span>}
                      </div>
                    </div>
                    <div className="flex space-x-2 ml-4">
                      <Button
                        size="sm"
                        className="bg-carbon-green text-white hover:bg-green-600"
                        onClick={() => {
                          const mutation = item.relationshipType 
                            ? updateRelationStatusMutation 
                            : updateNodeStatusMutation;
                          mutation.mutate({ id: item.id, status: "approved" });
                        }}
                        disabled={updateNodeStatusMutation.isPending || updateRelationStatusMutation.isPending}
                      >
                        <i className="fas fa-check mr-1"></i>
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          const mutation = item.relationshipType 
                            ? updateRelationStatusMutation 
                            : updateNodeStatusMutation;
                          mutation.mutate({ id: item.id, status: "rejected" });
                        }}
                        disabled={updateNodeStatusMutation.isPending || updateRelationStatusMutation.isPending}
                      >
                        <i className="fas fa-times mr-1"></i>
                        Reject
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => {
                          const mutation = item.relationshipType 
                            ? deleteRelationMutation 
                            : deleteNodeMutation;
                          mutation.mutate(item.id);
                        }}
                        disabled={deleteNodeMutation.isPending || deleteRelationMutation.isPending}
                        className="text-red-600 border-red-600 hover:bg-red-50"
                        title="Permanently delete this item"
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
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

      {/* Approved Nodes & Relations Section */}
      <Card>
        <div className="border-b border-carbon-gray-20 p-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-gray-900 flex items-center">
              <i className="fas fa-check-circle text-carbon-green mr-2"></i>
              Approved Nodes & Relations ({approvedItems.length})
            </h4>
            {approvedItems.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const response = await apiRequest("POST", "/api/nodes/undo-all", {});
                    const result = await response.json();
                    if (result.success) {
                      queryClient.invalidateQueries({ queryKey: ["/api/nodes/approved"] });
                      queryClient.invalidateQueries({ queryKey: ["/api/nodes/pending"] });
                      queryClient.invalidateQueries({ queryKey: ["/api/relations/approved"] });
                      queryClient.invalidateQueries({ queryKey: ["/api/graph/preview"] });
                      queryClient.invalidateQueries({ queryKey: ["/api/duplicates/candidates"] });
                      toast({
                        title: "Success",
                        description: `Reset ${result.resetNodes} nodes and ${result.resetRelations} relations`,
                      });
                    }
                  } catch (error) {
                    toast({
                      title: "Error",
                      description: "Failed to undo all approvals",
                      variant: "destructive",
                    });
                  }
                }}
                disabled={updateNodeStatusMutation.isPending || updateRelationStatusMutation.isPending}
                className="text-orange-600 border-orange-600 hover:bg-orange-50"
              >
                <i className="fas fa-undo mr-2"></i>
                Undo All Approvals
              </Button>
            )}
          </div>
        </div>
        <CardContent className="p-4">
          {approvedItems.length === 0 ? (
            <div className="text-center py-8 text-carbon-gray-60">
              <p>No approved nodes or relations yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {approvedItems.slice(0, approvedNodesLimit).map((item: any) => (
                <div key={item.id} className="border border-carbon-gray-20 rounded-lg p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <Badge className={item.relationshipType ? "bg-green-100 text-green-800 mb-1" : "bg-blue-100 text-blue-800 mb-1"}>
                        {item.relationshipType ? "Relation" : "Node"}
                      </Badge>
                      <h6 className="font-medium text-gray-900">
                        {item.relationshipType 
                          ? `${item.fromNodeName || 'Unknown'} → ${item.toNodeName || 'Unknown'}`
                          : item.name}
                      </h6>
                      {item.relationshipType && (
                        <span className="text-xs text-blue-600 font-medium">{item.relationshipType}</span>
                      )}
                      <p className="text-xs text-carbon-gray-60 mt-1">{item.description}</p>
                    </div>
                    <div className="flex space-x-2 ml-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => {
                          const mutation = item.relationshipType 
                            ? updateRelationStatusMutation 
                            : updateNodeStatusMutation;
                          mutation.mutate({ id: item.id, status: "pending" });
                        }}
                        disabled={updateNodeStatusMutation.isPending || updateRelationStatusMutation.isPending}
                        className="text-orange-600 border-orange-600 hover:bg-orange-50"
                        title="Move back to pending approval"
                      >
                        <i className="fas fa-undo mr-1"></i>
                        Undo
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {approvedItems.length > approvedNodesLimit && (
            <div className="mt-4 text-center">
              <Button 
                variant="link" 
                className="text-carbon-blue hover:text-blue-700"
                onClick={() => setApprovedNodesLimit(prev => prev + 10)}
              >
                Load more items ({approvedItems.length - approvedNodesLimit} remaining)
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
