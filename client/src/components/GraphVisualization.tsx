import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  ReactFlowProvider,
  useReactFlow,
  BackgroundVariant,
} from "reactflow";
import "reactflow/dist/style.css";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Trash2 } from "lucide-react";

interface GraphNode {
  id: string;
  name: string;
  type: string;
  group: number;
}

interface GraphLink {
  source: string;
  target: string;
  type: string;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

interface GraphStats {
  totalNodes: number;
  totalRelations: number;
  nodeTypes: Array<{ type: string; count: number }>;
}

function GraphVisualizationContent() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const { toast } = useToast();
  const [layout, setLayout] = useState("force-directed");
  const [filter, setFilter] = useState("all");

  const { data: graphData, isLoading: graphLoading } = useQuery<GraphData>({
    queryKey: ["/api/graph/visualization"],
  });

  const { data: stats } = useQuery<GraphStats>({
    queryKey: ["/api/graph/stats"],
  });
  
  // Fetch categories for dynamic color mapping
  const { data: categoriesData } = useQuery({
    queryKey: ["/api/categories"],
  });

  // Function to calculate node positions based on layout
  const calculateNodePositions = useCallback((nodes: any[], layout: string) => {
    const nodeCount = nodes.length;
    if (nodeCount === 0) return [];

    switch (layout) {
      case "hierarchical":
        // Simple hierarchical layout
        const levels = new Map<string, number>();
        const nodesByLevel = new Map<number, any[]>();
        
        nodes.forEach(node => {
          const level = node.type === 'Entity' ? 0 : node.type === 'Concept' ? 1 : 2;
          levels.set(node.id, level);
          if (!nodesByLevel.has(level)) {
            nodesByLevel.set(level, []);
          }
          nodesByLevel.get(level)!.push(node);
        });

        return nodes.map(node => {
          const level = levels.get(node.id) || 0;
          const nodesInLevel = nodesByLevel.get(level) || [];
          const index = nodesInLevel.indexOf(node);
          const spacing = 200;
          
          return {
            ...node,
            position: {
              x: index * spacing,
              y: level * 150
            }
          };
        });

      case "circular":
        // Circular layout
        const radius = 250;
        const angleStep = (2 * Math.PI) / nodeCount;
        
        return nodes.map((node, index) => ({
          ...node,
          position: {
            x: 400 + radius * Math.cos(index * angleStep),
            y: 300 + radius * Math.sin(index * angleStep)
          }
        }));

      case "force-directed":
      default:
        // Simple force-directed simulation
        return nodes.map((node, index) => ({
          ...node,
          position: {
            x: 100 + (index % 5) * 150 + Math.random() * 50,
            y: 100 + Math.floor(index / 5) * 150 + Math.random() * 50
          }
        }));
    }
  }, []);

  // Function to get node color based on type using dynamic categories
  const getNodeColor = useCallback((type: string): string => {
    // Build dynamic color map from categories if available
    if (categoriesData?.categories) {
      const categoryMap: Record<string, string> = {};
      categoriesData.categories.forEach((cat: any) => {
        // Map both by ID and by name for compatibility
        categoryMap[cat.id] = cat.color;
        categoryMap[cat.name] = cat.color;
        // Also handle lowercase variants
        categoryMap[cat.id.toLowerCase()] = cat.color;
        categoryMap[cat.name.toLowerCase()] = cat.color;
      });
      
      // Check various forms of the type
      return categoryMap[type] || 
             categoryMap[type.toLowerCase()] || 
             categoryMap['unknown'] || 
             '#525252';
    }
    
    // Fallback to default gray if categories not loaded
    return '#525252';
  }, [categoriesData]);

  // Convert graph data to ReactFlow format with filtering
  const { filteredNodes, filteredEdges } = useMemo(() => {
    if (!graphData) return { filteredNodes: [], filteredEdges: [] };

    let nodesToDisplay = graphData.nodes || [];
    
    // Apply filter
    if (filter !== 'all') {
      // Custom filter logic based on node properties
      nodesToDisplay = nodesToDisplay.filter((node: any) => {
        if (filter === 'entities') return ['Entity', 'Person', 'Location'].includes(node.type);
        if (filter === 'concepts') return ['Concept', 'Process'].includes(node.type);
        if (filter === 'food') return ['Ingredient', 'Dish', 'Recipe'].includes(node.type);
        return true;
      });
    }

    // Create node map for edge filtering
    const nodeIds = new Set(nodesToDisplay.map((n: any) => n.id));

    // Calculate positions based on layout
    const nodesWithPositions = calculateNodePositions(nodesToDisplay, layout);

    // Convert to ReactFlow nodes
    const nodes: Node[] = nodesWithPositions.map((node: any) => ({
      id: node.id,
      type: 'default',
      position: node.position,
      data: { 
        label: node.name,
        type: node.type 
      },
      style: {
        backgroundColor: getNodeColor(node.type),
        color: 'white',
        border: '2px solid transparent',
        borderRadius: '8px',
        padding: '10px',
        fontSize: '12px',
        fontWeight: '500',
        minWidth: '120px',
        cursor: 'pointer'
      }
    }));

    // Filter edges to only include those between displayed nodes
    const edges: Edge[] = (graphData.links || [])
      .filter((link: any) => nodeIds.has(link.source) && nodeIds.has(link.target))
      .map((link: any, index: number) => ({
        id: `e${index}`,
        source: link.source,
        target: link.target,
        type: 'smoothstep',
        label: link.type,
        labelStyle: { fontSize: '10px', fill: '#666', fontWeight: '500' },
        style: { stroke: '#999', strokeWidth: 2 },
        animated: false
      }));

    return { filteredNodes: nodes, filteredEdges: edges };
  }, [graphData, filter, layout, calculateNodePositions, getNodeColor]);

  const [nodes, setNodes, onNodesChange] = useNodesState(filteredNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(filteredEdges);

  // Update nodes and edges when filtered data changes
  useEffect(() => {
    setNodes(filteredNodes);
    setEdges(filteredEdges);
    // Fit view after a short delay to ensure layout is applied
    setTimeout(() => fitView({ padding: 0.1 }), 100);
  }, [filteredNodes, filteredEdges, setNodes, setEdges, fitView]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  // Calculate average degree
  const avgDegree = useMemo(() => {
    if (!stats?.totalNodes || !stats?.totalRelations) return 0;
    return (stats.totalRelations * 2 / stats.totalNodes).toFixed(1);
  }, [stats]);

  // Export graph as JSON
  const handleExport = () => {
    const exportData = {
      nodes: nodes.map(n => ({
        id: n.id,
        name: n.data.label,
        type: n.data.type,
        position: n.position
      })),
      edges: edges.map(e => ({
        source: e.source,
        target: e.target,
        type: e.label
      })),
      metadata: {
        totalNodes: stats?.totalNodes || 0,
        totalRelations: stats?.totalRelations || 0,
        exportDate: new Date().toISOString()
      }
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `knowledge-graph-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-900">Knowledge Graph Visualization</h3>
        <p className="text-carbon-gray-60">Interactive visualization of your knowledge graph structure</p>
      </div>

      {/* Graph Controls */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700">Layout:</label>
                <Select value={layout} onValueChange={setLayout}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="force-directed">Force-directed</SelectItem>
                    <SelectItem value="hierarchical">Hierarchical</SelectItem>
                    <SelectItem value="circular">Circular</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700">Filter:</label>
                <Select value={filter} onValueChange={setFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All nodes</SelectItem>
                    <SelectItem value="entities">Entities only</SelectItem>
                    <SelectItem value="concepts">Concepts only</SelectItem>
                    <SelectItem value="food">Food & Recipes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {nodes.length > 0 && (
                <Badge variant="secondary">
                  {nodes.length} nodes, {edges.length} edges
                </Badge>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => zoomOut()}
                disabled={nodes.length === 0}
              >
                <i className="fas fa-search-minus mr-1"></i>
                Zoom Out
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => zoomIn()}
                disabled={nodes.length === 0}
              >
                <i className="fas fa-search-plus mr-1"></i>
                Zoom In
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => fitView({ padding: 0.1 })}
                disabled={nodes.length === 0}
              >
                <i className="fas fa-expand mr-1"></i>
                Fit View
              </Button>
              <Button 
                size="sm"
                onClick={handleExport}
                disabled={nodes.length === 0}
                className="bg-carbon-blue hover:bg-blue-700 text-white"
              >
                <i className="fas fa-download mr-1"></i>
                Export JSON
              </Button>
              <Button
                size="sm"
                onClick={async () => {
                  if (confirm("Are you sure you want to clear ALL data from the graph database? This cannot be undone.")) {
                    try {
                      const response = await fetch("/api/graph/clear", { method: "POST" });
                      const data = await response.json();
                      
                      if (response.ok) {
                        queryClient.invalidateQueries({ queryKey: ["/api/graph/stats"] });
                        queryClient.invalidateQueries({ queryKey: ["/api/graph/visualization"] });
                        toast({
                          title: "Graph Cleared",
                          description: data.message || "All data has been removed from the graph database",
                        });
                      } else {
                        toast({
                          title: "Error",
                          description: data.error || "Failed to clear graph database",
                          variant: "destructive",
                        });
                      }
                    } catch (error) {
                      toast({
                        title: "Error",
                        description: "Failed to connect to the server",
                        variant: "destructive",
                      });
                    }
                  }
                }}
                variant="destructive"
                className="bg-red-600 hover:bg-red-700"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear Graph
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Graph Visualization Area */}
      <Card className="mb-6">
        <CardContent className="p-0">
          <div className="h-[600px] w-full" ref={reactFlowWrapper}>
            {graphLoading ? (
              <div className="h-full flex items-center justify-center bg-gradient-to-br from-carbon-gray-10 to-white rounded-lg">
                <div className="text-center">
                  <i className="fas fa-spinner fa-spin text-4xl text-carbon-blue mb-4"></i>
                  <p className="text-carbon-gray-60">Loading graph data...</p>
                </div>
              </div>
            ) : nodes.length > 0 ? (
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                fitView
                fitViewOptions={{ padding: 0.1 }}
                className="bg-gradient-to-br from-carbon-gray-10 to-white"
                nodesDraggable={true}
                nodesConnectable={false}
                elementsSelectable={true}
                selectNodesOnDrag={false}
                panOnDrag={true}
                zoomOnScroll={true}
                zoomOnPinch={true}
              >
                <Controls showInteractive={false} />
                <MiniMap 
                  nodeColor={(node) => getNodeColor(node.data?.type || '')}
                  pannable
                  zoomable
                />
                <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
              </ReactFlow>
            ) : (
              <div className="h-full flex items-center justify-center bg-gradient-to-br from-carbon-gray-10 to-white rounded-lg">
                <div className="text-center">
                  <i className="fas fa-project-diagram text-4xl text-carbon-gray-50 mb-4"></i>
                  <h4 className="text-lg font-medium text-gray-900 mb-2">No Graph Data Available</h4>
                  <p className="text-carbon-gray-60 mb-6">
                    {stats?.totalNodes === 0 
                      ? "No nodes have been added to the graph yet. Process documents and add approved nodes to see the visualization."
                      : "Configure Neo4j connection to visualize your knowledge graph."}
                  </p>
                  <div className="flex items-center justify-center space-x-6 text-sm text-carbon-gray-60">
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 bg-carbon-blue rounded-full"></div>
                      <span>Entity Nodes</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 bg-carbon-green rounded-full"></div>
                      <span>Concept Nodes</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-0 h-0 border-l-2 border-r-2 border-b-4 border-l-transparent border-r-transparent border-b-carbon-gray-50"></div>
                      <span>Relations</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Graph Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-semibold text-gray-900">{stats?.totalNodes || 0}</p>
            <p className="text-carbon-gray-60 text-sm">Total Nodes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-semibold text-gray-900">{stats?.totalRelations || 0}</p>
            <p className="text-carbon-gray-60 text-sm">Total Relations</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-semibold text-gray-900">
              {stats?.nodeTypes?.length || 0}
            </p>
            <p className="text-carbon-gray-60 text-sm">Node Types</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-semibold text-gray-900">{avgDegree}</p>
            <p className="text-carbon-gray-60 text-sm">Avg Degree</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function GraphVisualization() {
  return (
    <ReactFlowProvider>
      <GraphVisualizationContent />
    </ReactFlowProvider>
  );
}