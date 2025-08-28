import { useState } from "react";
import Layout from "@/components/Layout";
import PDFUpload from "@/components/PDFUpload";
import NodeManager from "@/components/NodeManager";
import DeduplicationSequential from "@/components/DeduplicationSequential";
import GraphVisualization from "@/components/GraphVisualization";
import Neo4jVisualization from "@/components/Neo4jVisualization";
import ChatInterface from "@/components/ChatInterface";
import DeveloperConsole from "@/components/DeveloperConsole";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("upload");
  const [graphViewType, setGraphViewType] = useState<"standard" | "neo4j">("standard");

  const renderActiveTab = () => {
    switch (activeTab) {
      case "upload":
        return <PDFUpload />;
      case "nodes":
        return <NodeManager />;
      case "dedup":
        return <DeduplicationSequential />;
      case "graph":
        return (
          <div>
            {/* View Type Selector */}
            <Card className="mb-4 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  Select visualization style:
                </div>
                <div className="flex space-x-2">
                  <Button
                    size="sm"
                    variant={graphViewType === "standard" ? "default" : "outline"}
                    onClick={() => setGraphViewType("standard")}
                  >
                    <i className="fas fa-project-diagram mr-2"></i>
                    Standard View
                  </Button>
                  <Button
                    size="sm"
                    variant={graphViewType === "neo4j" ? "default" : "outline"}
                    onClick={() => setGraphViewType("neo4j")}
                    className={graphViewType === "neo4j" ? "bg-green-600 hover:bg-green-700" : ""}
                  >
                    <i className="fas fa-database mr-2"></i>
                    Neo4j Style
                  </Button>
                </div>
              </div>
            </Card>
            {/* Render selected visualization */}
            {graphViewType === "standard" ? <GraphVisualization /> : <Neo4jVisualization />}
          </div>
        );
      case "chat":
        return <ChatInterface />;
      case "dev":
        return <DeveloperConsole />;
      default:
        return <PDFUpload />;
    }
  };

  const getTabInfo = (tab: string) => {
    const tabData: Record<string, { title: string; subtitle: string }> = {
      upload: {
        title: "PDF Upload & Processing",
        subtitle: "Upload PDFs to extract and convert into knowledge graph nodes"
      },
      nodes: {
        title: "Node & Relation Management",
        subtitle: "Review and approve suggested nodes and relations from your documents"
      },
      dedup: {
        title: "Deduplication & Graph Preview",
        subtitle: "Identify duplicates and preview nodes before adding to the graph"
      },
      graph: {
        title: "Knowledge Graph Visualization",
        subtitle: "Interactive visualization of your knowledge graph structure"
      },
      chat: {
        title: "Natural Language Query Interface",
        subtitle: "Ask questions about your knowledge graph using natural language"
      },
      dev: {
        title: "Developer Console",
        subtitle: "Monitor query translations and improve the natural language processing"
      }
    };
    return tabData[tab] || tabData.upload;
  };

  return (
    <Layout 
      activeTab={activeTab} 
      onTabChange={setActiveTab}
      title={getTabInfo(activeTab).title}
      subtitle={getTabInfo(activeTab).subtitle}
    >
      {renderActiveTab()}
    </Layout>
  );
}
