import { useQuery } from "@tanstack/react-query";

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const { data: stats } = useQuery({
    queryKey: ["/api/graph/stats"],
  });

  const navItems = [
    { id: "upload", icon: "fas fa-upload", label: "PDF Upload" },
    { id: "nodes", icon: "fas fa-sitemap", label: "Node Management" },
    { id: "dedup", icon: "fas fa-compress-arrows-alt", label: "Deduplication" },
    { id: "graph", icon: "fas fa-project-diagram", label: "Graph View" },
    { id: "chat", icon: "fas fa-comments", label: "Query Chat" },
    { id: "dev", icon: "fas fa-code", label: "Developer Console" },
  ];

  return (
    <nav className="w-64 bg-carbon-gray-80 text-white flex-shrink-0 flex flex-col">
      <div className="p-6">
        <div className="flex items-center space-x-3 mb-8">
          <div className="w-10 h-10 bg-carbon-blue rounded-lg flex items-center justify-center">
            <i className="fas fa-project-diagram text-white text-xl"></i>
          </div>
          <div>
            <h1 className="text-xl font-semibold">GraphfloorGPT</h1>
            <p className="text-carbon-gray-30 text-sm">Knowledge Graph AI</p>
          </div>
        </div>
        
        <ul className="space-y-2">
          {navItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                  activeTab === item.id
                    ? "bg-carbon-blue text-white"
                    : "text-carbon-gray-30 hover:bg-carbon-gray-70 hover:text-white"
                }`}
              >
                <i className={`${item.icon} w-5`}></i>
                <span>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      
      <div className="mt-auto p-6 border-t border-carbon-gray-70">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-carbon-green rounded-full flex items-center justify-center">
            <i className="fas fa-check text-white text-sm"></i>
          </div>
          <div className="text-sm">
            <p className="text-white">Langfuse v2 Connected</p>
            <p className="text-carbon-gray-30">
              {stats ? `${stats.totalNodes} nodes, ${stats.totalRelations} relations` : "Neo4j Ready"}
            </p>
          </div>
        </div>
      </div>
    </nav>
  );
}
