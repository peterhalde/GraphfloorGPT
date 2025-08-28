import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Trash2, Plus, Palette, ChevronDown, ChevronRight, Edit2, RefreshCw } from "lucide-react";

interface Category {
  id: string;
  name: string;
  color: string;
  description?: string;
  nodeCount?: number;
}

interface Node {
  id: string;
  name: string;
  type: string;
  category?: string;
  description?: string;
}

export default function CategoryManager() {
  const { toast } = useToast();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [newCategory, setNewCategory] = useState({ name: "", color: "#0F62FE", description: "" });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editForm, setEditForm] = useState({ name: "", color: "", description: "" });

  // Fetch categories
  const { data: categoriesData } = useQuery({
    queryKey: ["/api/categories"],
  });

  // Fetch all approved nodes
  const { data: nodesData } = useQuery({
    queryKey: ["/api/nodes/approved"],
  });

  const categories: Category[] = categoriesData?.categories || [];
  const nodes: Node[] = nodesData?.nodes || [];
  
  // Always use categories from database - user has full control
  const allCategories = categories;

  // Group nodes by category
  const nodesByCategory = nodes.reduce((acc: Record<string, Node[]>, node) => {
    // Use the node's type field as its category
    let categoryId = node.type || "unknown";
    
    // Try to find the category by name OR by ID
    const category = allCategories.find(cat => 
      cat.id === categoryId || cat.name === categoryId
    );
    
    if (category) {
      // Use the category's ID for grouping
      categoryId = category.id;
    } else {
      // If category doesn't exist, default to unknown
      categoryId = "unknown";
    }
    
    if (!acc[categoryId]) acc[categoryId] = [];
    acc[categoryId].push(node);
    return acc;
  }, {});

  // Create category mutation
  const createCategoryMutation = useMutation({
    mutationFn: async (categoryData: typeof newCategory) => {
      return apiRequest("POST", "/api/categories", categoryData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/graph/preview"] });
      toast({
        title: "Category created",
        description: "New category has been added successfully",
      });
      setNewCategory({ name: "", color: "#0F62FE", description: "" });
      setIsDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error creating category",
        description: error.message || "Failed to create category",
        variant: "destructive",
      });
    },
  });

  // Update category mutation
  const updateCategoryMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; name?: string; color?: string; description?: string }) => {
      return apiRequest("PATCH", `/api/categories/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/graph/preview"] });
      toast({
        title: "Category updated",
        description: "Category has been updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error updating category",
        description: error.message || "Failed to update category",
        variant: "destructive",
      });
    },
  });

  // Regenerate categories mutation
  const regenerateCategoriesMutation = useMutation({
    mutationFn: async ({ preserveCustom }: { preserveCustom: boolean }) => {
      return apiRequest("POST", "/api/categories/generate", { preserveCustom });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/graph/preview"] });
      toast({
        title: "Categories regenerated",
        description: `Generated ${data.categoriesGenerated} categories based on current nodes. ${data.categoriesDeleted} old categories removed.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error regenerating categories",
        description: error.message || "Failed to regenerate categories",
        variant: "destructive",
      });
    },
  });

  // Delete category mutation
  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/categories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/graph/preview"] });
      toast({
        title: "Category deleted",
        description: "Category has been removed successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error deleting category",
        description: error.message || "Failed to delete category",
        variant: "destructive",
      });
    },
  });

  // Assign node to category mutation
  const assignNodeCategoryMutation = useMutation({
    mutationFn: async ({ nodeId, categoryId }: { nodeId: string; categoryId: string }) => {
      return apiRequest("PATCH", `/api/nodes/${nodeId}/category`, { categoryId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/nodes/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({
        title: "Node reassigned",
        description: "Node has been moved to the new category",
      });
      setSelectedNode(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error assigning category",
        description: error.message || "Failed to assign node to category",
        variant: "destructive",
      });
    },
  });

  const toggleCategory = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  };

  const predefinedColors = [
    "#FF6B6B", "#4ECDC4", "#45B7D1", "#F7B731", "#5F27CD",
    "#0F62FE", "#24A148", "#F1C21B", "#8A3FFC", "#FA4D56",
    "#008573", "#6929C4", "#E67E22", "#16A085", "#27AE60",
  ];

  return (
    <div className="space-y-6">
      {/* Header with Add Category Button */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Category Management</h3>
          <p className="text-sm text-carbon-gray-60">
            Organize nodes into categories for better visualization and color coding
          </p>
        </div>
        <div className="flex space-x-2">
          <Button
            variant="outline"
            onClick={() => {
              if (confirm("This will regenerate categories based on current node types. Old unused categories will be removed. Continue?")) {
                regenerateCategoriesMutation.mutate({ preserveCustom: false });
              }
            }}
            disabled={regenerateCategoriesMutation.isPending}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${regenerateCategoriesMutation.isPending ? "animate-spin" : ""}`} />
            {regenerateCategoriesMutation.isPending ? "Regenerating..." : "Regenerate Categories"}
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-carbon-blue hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" />
                Add Category
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Category</DialogTitle>
                <DialogDescription>
                  Add a custom category to organize your knowledge graph nodes
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Category Name</Label>
                  <Input
                    id="name"
                    value={newCategory.name}
                    onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                    placeholder="e.g., Equipment, Location, Method"
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    value={newCategory.description}
                    onChange={(e) => setNewCategory({ ...newCategory, description: e.target.value })}
                    placeholder="Brief description of this category"
                  />
                </div>
                <div>
                  <Label htmlFor="color">Color</Label>
                  <div className="flex items-center space-x-2">
                  <Input
                    id="color"
                    type="color"
                    value={newCategory.color}
                    onChange={(e) => setNewCategory({ ...newCategory, color: e.target.value })}
                    className="w-20 h-10"
                  />
                  <div className="flex flex-wrap gap-2">
                    {predefinedColors.map((color) => (
                      <button
                        key={color}
                        className="w-8 h-8 rounded border-2 border-gray-300 hover:border-gray-500"
                        style={{ backgroundColor: color }}
                        onClick={() => setNewCategory({ ...newCategory, color })}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <Button
                onClick={() => createCategoryMutation.mutate(newCategory)}
                disabled={!newCategory.name || createCategoryMutation.isPending}
                className="w-full"
              >
                {createCategoryMutation.isPending ? "Creating..." : "Create Category"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Categories List */}
      <div className="space-y-4">
        {allCategories.map((category) => {
          const categoryNodes = nodesByCategory[category.id] || [];
          const isExpanded = expandedCategories.has(category.id);

          return (
            <Card key={category.id} className="overflow-hidden">
              <div
                className="p-4 border-b border-carbon-gray-20 cursor-pointer hover:bg-carbon-gray-10"
                onClick={() => toggleCategory(category.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <button className="p-0">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-gray-500" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-500" />
                      )}
                    </button>
                    <div
                      className="w-6 h-6 rounded-full border-2"
                      style={{ backgroundColor: category.color, borderColor: category.color }}
                    />
                    <div>
                      <h4 className="font-medium text-gray-900">{category.name}</h4>
                      {category.description && (
                        <p className="text-xs text-carbon-gray-60">{category.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant="secondary">{categoryNodes.length} nodes</Badge>
                    {category.id !== "unknown" && (
                      <div className="flex space-x-1">
                        <Dialog
                          open={editingCategory?.id === category.id}
                          onOpenChange={(open) => {
                            if (open) {
                              setEditingCategory(category);
                              setEditForm({
                                name: category.name,
                                color: category.color,
                                description: category.description || "",
                              });
                            } else {
                              setEditingCategory(null);
                            }
                          }}
                        >
                          <DialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => e.stopPropagation()}
                              title="Edit category"
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Edit Category</DialogTitle>
                              <DialogDescription>
                                Update the name, description, and color for {category.name}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div>
                                <Label htmlFor="edit-name">Category Name</Label>
                                <Input
                                  id="edit-name"
                                  value={editForm.name}
                                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                  placeholder="e.g., Equipment, Location, Method"
                                />
                              </div>
                              <div>
                                <Label htmlFor="edit-description">Description</Label>
                                <Input
                                  id="edit-description"
                                  value={editForm.description}
                                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                                  placeholder="Brief description of this category"
                                />
                              </div>
                              <div>
                                <Label htmlFor="edit-color">Color</Label>
                                <div className="flex items-center space-x-2">
                                  <Input
                                    id="edit-color"
                                    type="color"
                                    value={editForm.color}
                                    onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                                    className="w-20 h-10"
                                  />
                                  <div className="flex flex-wrap gap-2">
                                    {predefinedColors.map((color) => (
                                      <button
                                        key={color}
                                        className="w-8 h-8 rounded border-2 border-gray-300 hover:border-gray-500"
                                        style={{ backgroundColor: color }}
                                        onClick={() => setEditForm({ ...editForm, color })}
                                      />
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <Button
                                onClick={() => {
                                  updateCategoryMutation.mutate({
                                    id: category.id,
                                    name: editForm.name,
                                    color: editForm.color,
                                    description: editForm.description,
                                  });
                                  setEditingCategory(null);
                                }}
                                disabled={!editForm.name || updateCategoryMutation.isPending}
                                className="w-full"
                              >
                                {updateCategoryMutation.isPending ? "Updating..." : "Update Category"}
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete category "${category.name}"? Nodes will be moved to Unknown.`)) {
                              deleteCategoryMutation.mutate(category.id);
                            }
                          }}
                          title="Delete category"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {isExpanded && (
                <CardContent className="p-4">
                  {categoryNodes.length === 0 ? (
                    <p className="text-sm text-carbon-gray-60 text-center py-4">
                      No nodes in this category
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {categoryNodes.map((node) => {
                        // Find the category that matches this node's type
                        const nodeCategory = allCategories.find(cat => 
                          cat.id === node.type || cat.name === node.type
                        );
                        const currentCategoryId = nodeCategory ? nodeCategory.id : "unknown";
                        
                        return (<div
                          key={node.id}
                          className="flex items-center justify-between p-3 border border-carbon-gray-20 rounded-lg hover:bg-carbon-gray-10"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {node.name}
                            </p>
                            {node.description && (
                              <p className="text-xs text-carbon-gray-60 truncate">
                                {node.description}
                              </p>
                            )}
                          </div>
                          <Select
                            value={currentCategoryId}
                            onValueChange={(value) => {
                              if (value !== currentCategoryId) {
                                assignNodeCategoryMutation.mutate({
                                  nodeId: node.id,
                                  categoryId: value,
                                });
                              }
                            }}
                          >
                            <SelectTrigger className="w-32 ml-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {allCategories.map((cat) => (
                                <SelectItem key={cat.id} value={cat.id}>
                                  <div className="flex items-center space-x-2">
                                    <div
                                      className="w-3 h-3 rounded-full"
                                      style={{ backgroundColor: cat.color }}
                                    />
                                    <span>{cat.name}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );})}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}