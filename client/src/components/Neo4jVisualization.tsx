import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import NeoVis from "neovis.js";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface GraphStats {
  totalNodes: number;
  totalRelations: number;
  nodeTypes: Array<{ type: string; count: number }>;
}

export default function Neo4jVisualization() {
  const visRef = useRef<HTMLDivElement>(null);
  const neovisRef = useRef<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [physics, setPhysics] = useState(true);
  const [hierarchical, setHierarchical] = useState(false);

  const { data: stats } = useQuery<GraphStats>({
    queryKey: ["/api/graph/stats"],
  });

  // Fetch categories for dynamic color mapping
  const { data: categoriesData } = useQuery({
    queryKey: ["/api/categories"],
  });

  const categories = categoriesData?.categories || [];
  
  // Build dynamic color map from categories
  const categoryColors: Record<string, string> = categories.reduce(
    (acc: Record<string, string>, cat: any) => {
      acc[cat.id] = cat.color;
      // Also map by name for compatibility
      acc[cat.name] = cat.color;
      return acc;
    },
    { 
      // Default categories if API not loaded yet
      "unknown": "#525252",
      "default": "#525252",
      "Ingredient": "#FF6B6B",
      "ingredient": "#FF6B6B",
      "Dish": "#4ECDC4",
      "dish": "#4ECDC4",
      "Recipe": "#45B7D1",
      "recipe": "#45B7D1",
      "Entity": "#0F62FE",
      "entity": "#0F62FE",
      "Concept": "#24A148",
      "concept": "#24A148",
      "Process": "#F1C21B",
      "process": "#F1C21B",
      "CookingMethod": "#F7B731",
      "Equipment": "#5F27CD",
      "Person": "#6929C4",
      "Location": "#FA4D56",
      "Organization": "#008573",
      "Material": "#8A3FFC",
    }
  );

  useEffect(() => {
    if (!visRef.current) return;

    // Check if Neo4j credentials are available
    const neo4jUri = import.meta.env.VITE_NEO4J_URI || "bolt://localhost:7687";
    const neo4jUser = import.meta.env.VITE_NEO4J_USER || "neo4j";
    const neo4jPassword = import.meta.env.VITE_NEO4J_PASSWORD;

    if (!neo4jPassword) {
      // Fall back to using our API data
      initializeWithAPIData();
      return;
    }

    try {
      // Initialize NeoVis with Neo4j connection
      const config = {
        containerId: "neo4j-vis",
        neo4j: {
          serverUrl: neo4jUri,
          serverUser: neo4jUser,
          serverPassword: neo4jPassword,
        },
        visConfig: {
          nodes: {
            shape: "dot",
            size: 25,
            font: {
              size: 14,
              color: "#000000",
            },
            borderWidth: 2,
            shadow: true,
          },
          edges: {
            arrows: {
              to: { enabled: true, scaleFactor: 0.5 },
            },
            color: "#848484",
            font: {
              size: 11,
              align: "middle",
            },
            smooth: {
              type: "continuous",
            },
          },
          physics: {
            enabled: physics,
            barnesHut: {
              gravitationalConstant: -8000,
              springConstant: 0.001,
              springLength: 200,
            },
          },
          layout: hierarchical ? {
            hierarchical: {
              enabled: true,
              direction: "UD",
              sortMethod: "directed",
            },
          } : {},
          interaction: {
            hover: true,
            tooltipDelay: 200,
            hideEdgesOnDrag: true,
          },
        },
        labels: {
          // Use a wildcard to match all node labels
          "*": {
            label: "name",
            group: "category",
            [NeoVis.NEOVIS_ADVANCED_CONFIG]: {
              function: {
                color: (node: any) => {
                  // Use category field for color, fall back to type
                  const categoryOrType = node.category || node.type || "default";
                  return categoryColors[categoryOrType] || categoryColors.default;
                },
                title: (props: any) => {
                  // Custom tooltip
                  return `${props.name}\nType: ${props.type || "Unknown"}\nCategory: ${props.category || "None"}`;
                },
              },
            },
          },
        },
        relationships: {
          // Use a wildcard to match all relationship types
          "*": {
            thickness: 2,
            caption: true,
            font: {
              size: 10,
              align: "middle",
            },
          },
        },
        initialCypher: "MATCH (n)-[r]->(m) RETURN n,r,m LIMIT 100",
      };

      neovisRef.current = new NeoVis(config);
      neovisRef.current.render();
      setIsConnected(true);
      setError(null);
    } catch (err: any) {
      console.error("Failed to connect to Neo4j:", err);
      setError("Using local data visualization");
      initializeWithAPIData();
    }

    return () => {
      if (neovisRef.current) {
        neovisRef.current.clearNetwork();
      }
    };
  }, [physics, hierarchical]);

  const initializeWithAPIData = async () => {
    // Fetch data from our API instead
    try {
      const response = await fetch("/api/graph/visualization");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      
      if (!visRef.current) {
        setError("Visualization container not ready");
        return;
      }
      
      if (!data.nodes || data.nodes.length === 0) {
        setError("No graph data available");
        return;
      }

      // Use vis-network directly with our API data
      const visNetwork = await import("vis-network/standalone");
      
      const nodes = new visNetwork.DataSet(
        data.nodes.map((node: any) => ({
          id: node.id,
          label: node.name,
          group: node.category || node.type,
          color: categoryColors[node.category || node.type] || categoryColors.default,
          shape: "dot",
          size: 25,
          font: { color: "#000000", size: 12 },
          borderWidth: 2,
          shadow: true,
          title: `${node.name}\nType: ${node.type || "Unknown"}\nCategory: ${node.category || "None"}`,
        }))
      );

      const edges = new visNetwork.DataSet(
        data.links.map((link: any, index: number) => ({
          id: `edge-${index}`,
          from: link.source,
          to: link.target,
          label: link.type,
          arrows: { to: { enabled: true, scaleFactor: 0.5 } },
          color: { color: "#848484" },
          font: { size: 10, color: "#666666" },
          smooth: { type: "continuous" },
        }))
      );

      const container = visRef.current;
      const graphData = { nodes, edges };
      const options = {
        physics: {
          enabled: physics,
          barnesHut: {
            gravitationalConstant: -8000,
            springConstant: 0.001,
            springLength: 200,
          },
        },
        layout: hierarchical ? {
          hierarchical: {
            enabled: true,
            direction: "UD",
            sortMethod: "directed",
          },
        } : {},
        interaction: {
          hover: true,
          tooltipDelay: 200,
          hideEdgesOnDrag: true,
          navigationButtons: true,
          keyboard: true,
        },
        nodes: {
          shape: "dot",
        },
        edges: {
          smooth: {
            type: "continuous",
          },
        },
      };

      const network = new visNetwork.Network(container, graphData, options);
      
      // Store network reference for export
      (visRef.current as any).network = network;
      
      setIsConnected(true);
      setError(null);
    } catch (err: any) {
      console.error("Failed to load graph data:", err.message || err);
      setError(`Failed to load visualization: ${err.message || "Unknown error"}`);
    }
  };

  const handleExport = () => {
    const container = visRef.current as any;
    if (container && container.network) {
      try {
        const network = container.network;
        const positions = network.getPositions();
        const nodeIds = Object.keys(positions);
        
        const exportData = {
          nodes: nodeIds.map(id => ({
            id,
            position: positions[id],
          })),
          metadata: {
            totalNodes: stats?.totalNodes || 0,
            totalRelations: stats?.totalRelations || 0,
            exportDate: new Date().toISOString(),
          },
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `neo4j-graph-${new Date().toISOString().split("T")[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error("Export failed:", err);
      }
    }
  };

  const handleStabilize = () => {
    const container = visRef.current as any;
    if (container && container.network) {
      container.network.stabilize();
    }
  };

  const handleReload = () => {
    initializeWithAPIData();
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-900">Neo4j-Style Graph Visualization</h3>
        <p className="text-carbon-gray-60">
          Interactive knowledge graph with category-based clustering and color coding
        </p>
      </div>

      {/* Controls */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700">Physics:</label>
                <Select value={physics.toString()} onValueChange={(v) => setPhysics(v === "true")}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Enabled</SelectItem>
                    <SelectItem value="false">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700">Layout:</label>
                <Select value={hierarchical.toString()} onValueChange={(v) => setHierarchical(v === "true")}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="false">Force-directed</SelectItem>
                    <SelectItem value="true">Hierarchical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isConnected && (
                <Badge variant="secondary" className="bg-green-100 text-green-800">
                  <i className="fas fa-check-circle mr-1"></i>
                  Connected
                </Badge>
              )}
              {error && (
                <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                  <i className="fas fa-exclamation-triangle mr-1"></i>
                  {error}
                </Badge>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={handleStabilize}>
                <i className="fas fa-compress mr-1"></i>
                Stabilize
              </Button>
              <Button variant="outline" size="sm" onClick={handleReload}>
                <i className="fas fa-sync-alt mr-1"></i>
                Reload
              </Button>
              <Button size="sm" onClick={handleExport} className="bg-carbon-blue hover:bg-blue-700 text-white">
                <i className="fas fa-download mr-1"></i>
                Export
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Visualization */}
      <Card className="mb-6">
        <CardContent className="p-0">
          <div 
            id="neo4j-vis" 
            ref={visRef} 
            className="h-[600px] w-full bg-gradient-to-br from-gray-50 to-white rounded-lg"
          />
        </CardContent>
      </Card>

      {/* Category Legend */}
      <Card>
        <CardContent className="p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Category Color Coding</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {categories.length > 0 ? (
              categories.map((category: any) => (
                <div key={category.id} className="flex items-center space-x-2">
                  <div 
                    className="w-4 h-4 rounded-full border-2" 
                    style={{ backgroundColor: category.color, borderColor: category.color }}
                  />
                  <span className="text-xs text-gray-600">{category.name}</span>
                </div>
              ))
            ) : (
              Object.entries(categoryColors)
                .filter(([key]) => !key.includes("default") && !key.includes("unknown") && key[0] === key[0].toUpperCase())
                .slice(0, 7)
                .map(([category, color]) => (
                  <div key={category} className="flex items-center space-x-2">
                    <div 
                      className="w-4 h-4 rounded-full border-2" 
                      style={{ backgroundColor: color, borderColor: color }}
                    />
                    <span className="text-xs text-gray-600">{category}</span>
                  </div>
                ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}