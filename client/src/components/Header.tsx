import { useQuery } from "@tanstack/react-query";

interface HeaderProps {
  title: string;
  subtitle: string;
}

export default function Header({ title, subtitle }: HeaderProps) {
  const { data: stats } = useQuery({
    queryKey: ["/api/graph/stats"],
  });

  return (
    <header className="bg-white border-b border-carbon-gray-20 px-8 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">{title}</h2>
          <p className="text-carbon-gray-60 mt-1">{subtitle}</p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 text-sm text-carbon-gray-60">
            <i className="fas fa-database"></i>
            <span>{stats?.totalNodes || 0} nodes</span>
          </div>
          <div className="flex items-center space-x-2 text-sm text-carbon-gray-60">
            <i className="fas fa-link"></i>
            <span>{stats?.totalRelations || 0} relations</span>
          </div>
        </div>
      </div>
    </header>
  );
}
