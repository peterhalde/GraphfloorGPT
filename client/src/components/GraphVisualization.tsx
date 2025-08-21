import { useState, useCallback } from "react";
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
} from "reactflow";
import "reactflow/dist/style.css";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function GraphVisualization() {
  const [layout, setLayout] = useState("force-directed");
  const [filter, setFilter] = useState("all");

  const { data: graphData } = useQuery({
    queryKey: ["/api/graph/visualization"],
  });

  const { data: stats } = useQuery({
    queryKey: ["/api/graph/stats"],
  });

  // Convert graph data to ReactFlow format
  const initialNodes: Node[] = (graphData?.nodes || []).map((node: any) => ({
    id: node.id,
    type: 'default',
    position: { x: Math.random() * 500, y: Math.random() * 500 },
    data: { 
      label: node.name,
      type: node.type 
    },
    style: {
      backgroundColor: getNodeColor(node.type),
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      padding: '10px',
      fontSize: '12px',
      fontWeight: '500'
    }
  }));

  const initialEdges: Edge[] = (graphData?.links || []).map((link: any, index: number) => ({
    id: `e${index}`,
    source: link.source,
    target: link.target,
    type: 'smoothstep',
    label: link.type,
    labelStyle: { fontSize: '10px', fill: '#666' },
    style: { stroke: '#999', strokeWidth: 2 }
  }));

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  function getNodeColor(type: string): string {
    const colors: Record<string, string> = {
      'Entity': '#0f62fe',
      'Concept': '#24a148',
      'Process': '#f1c21b',
      'Equipment': '#da1e28',
      'Material': '#8a3ffc'
    };
    return colors[type] || '#525252';
  }

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
                  <SelectTrigger className="w-32">
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
                    <SelectItem value="manufacturing">Manufacturing only</SelectItem>
                    <SelectItem value="quality">Quality Control only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm">
                <i className="fas fa-search-minus mr-1"></i>
                Zoom Out
              </Button>
              <Button variant="outline" size="sm">
                <i className="fas fa-search-plus mr-1"></i>
                Zoom In
              </Button>
              <Button size="sm">
                <i className="fas fa-download mr-1"></i>
                Export
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Graph Visualization Area */}
      <Card className="mb-6">
        <CardContent className="p-0">
          <div className="h-96 w-full">
            {nodes.length > 0 ? (
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                fitView
                className="bg-gradient-to-br from-carbon-gray-10 to-white"
              >
                <Controls />
                <MiniMap />
                <Background />
              </ReactFlow>
            ) : (
              <div className="h-full flex items-center justify-center bg-gradient-to-br from-carbon-gray-10 to-white rounded-lg">
                <div className="text-center">
                  <i className="fas fa-project-diagram text-4xl text-carbon-gray-50 mb-4"></i>
                  <h4 className="text-lg font-medium text-gray-900 mb-2">Interactive Graph Visualization</h4>
                  <p className="text-carbon-gray-60 mb-6">Your knowledge graph will be rendered here with interactive nodes and edges</p>
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
            <p className="text-2xl font-semibold text-gray-900">8.3</p>
            <p className="text-carbon-gray-60 text-sm">Avg Degree</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
