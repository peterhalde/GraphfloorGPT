import { useState } from "react";
import Layout from "@/components/Layout";
import PDFUpload from "@/components/PDFUpload";
import NodeManager from "@/components/NodeManager";
import Deduplication from "@/components/Deduplication";
import GraphVisualization from "@/components/GraphVisualization";
import ChatInterface from "@/components/ChatInterface";
import DeveloperConsole from "@/components/DeveloperConsole";

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("upload");

  const renderActiveTab = () => {
    switch (activeTab) {
      case "upload":
        return <PDFUpload />;
      case "nodes":
        return <NodeManager />;
      case "dedup":
        return <Deduplication />;
      case "graph":
        return <GraphVisualization />;
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
        title: "Deduplication Engine",
        subtitle: "Identify and merge similar nodes and relations to maintain graph integrity"
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
