import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Plus, Trash2, BookOpen, Link } from "lucide-react";

export default function EquivalenceManager() {
  const [newNodeKey, setNewNodeKey] = useState("");
  const [newNodeValue, setNewNodeValue] = useState("");
  const [newRelationKey, setNewRelationKey] = useState("");
  const [newRelationValue, setNewRelationValue] = useState("");
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: equivalences } = useQuery({
    queryKey: ["/api/equivalences"],
  });

  const addNodeEquivalenceMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const response = await apiRequest("POST", "/api/equivalences/nodes", { key, value });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equivalences"] });
      setNewNodeKey("");
      setNewNodeValue("");
      toast({
        title: "Node equivalence added",
        description: "The system will now recognize these terms as equivalent",
      });
    },
  });

  const addRelationEquivalenceMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const response = await apiRequest("POST", "/api/equivalences/relations", { key, value });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equivalences"] });
      setNewRelationKey("");
      setNewRelationValue("");
      toast({
        title: "Relation equivalence added",
        description: "The system will now recognize these relation types as equivalent",
      });
    },
  });

  const removeEquivalenceMutation = useMutation({
    mutationFn: async ({ type, key, value }: { type: "nodes" | "relations"; key: string; value: string }) => {
      const response = await apiRequest("DELETE", `/api/equivalences/${type}`, { key, value });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equivalences"] });
      toast({
        title: "Equivalence removed",
        description: "The equivalence has been removed from the system",
      });
    },
  });

  const nodeEquivalences = (equivalences as any)?.nodes || {};
  const relationEquivalences = (equivalences as any)?.relations || {};

  return (
    <div className="space-y-6">
      {/* Node Equivalences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <BookOpen className="w-5 h-5 mr-2" />
            Node Equivalences
          </CardTitle>
          <p className="text-sm text-gray-600">
            Teach the system which node names mean the same thing (e.g., "Teig" = "Dough")
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add new node equivalence */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="node-key">Primary Term</Label>
              <Input
                id="node-key"
                value={newNodeKey}
                onChange={(e) => setNewNodeKey(e.target.value)}
                placeholder="e.g., Teig"
              />
            </div>
            <div>
              <Label htmlFor="node-value">Equivalent Term</Label>
              <div className="flex space-x-2">
                <Input
                  id="node-value"
                  value={newNodeValue}
                  onChange={(e) => setNewNodeValue(e.target.value)}
                  placeholder="e.g., Dough"
                />
                <Button
                  onClick={() => addNodeEquivalenceMutation.mutate({ key: newNodeKey, value: newNodeValue })}
                  disabled={!newNodeKey || !newNodeValue || addNodeEquivalenceMutation.isPending}
                  size="sm"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Existing node equivalences */}
          <div className="space-y-3">
            {Object.entries(nodeEquivalences).map(([key, values]) => (
              <div key={key} className="border rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline" className="font-medium">
                      {key}
                    </Badge>
                    <span className="text-gray-500">=</span>
                    <div className="flex flex-wrap gap-1">
                      {(values as string[]).map((value, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {value}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="ml-1 h-auto p-0 text-red-500 hover:text-red-700"
                            onClick={() => removeEquivalenceMutation.mutate({ type: "nodes", key, value })}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Relation Equivalences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Link className="w-5 h-5 mr-2" />
            Relation Equivalences
          </CardTitle>
          <p className="text-sm text-gray-600">
            Teach the system which relation types mean the same thing (e.g., "PART_OF" = "CONTAINS")
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add new relation equivalence */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="relation-key">Primary Relation</Label>
              <Input
                id="relation-key"
                value={newRelationKey}
                onChange={(e) => setNewRelationKey(e.target.value)}
                placeholder="e.g., PART_OF"
              />
            </div>
            <div>
              <Label htmlFor="relation-value">Equivalent Relation</Label>
              <div className="flex space-x-2">
                <Input
                  id="relation-value"
                  value={newRelationValue}
                  onChange={(e) => setNewRelationValue(e.target.value)}
                  placeholder="e.g., CONTAINS"
                />
                <Button
                  onClick={() => addRelationEquivalenceMutation.mutate({ key: newRelationKey, value: newRelationValue })}
                  disabled={!newRelationKey || !newRelationValue || addRelationEquivalenceMutation.isPending}
                  size="sm"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Existing relation equivalences */}
          <div className="space-y-3">
            {Object.entries(relationEquivalences).map(([key, values]) => (
              <div key={key} className="border rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline" className="font-medium">
                      {key}
                    </Badge>
                    <span className="text-gray-500">=</span>
                    <div className="flex flex-wrap gap-1">
                      {(values as string[]).map((value, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {value}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="ml-1 h-auto p-0 text-red-500 hover:text-red-700"
                            onClick={() => removeEquivalenceMutation.mutate({ type: "relations", key, value })}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}