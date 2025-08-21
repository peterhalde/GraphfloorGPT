import { ReactNode } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";

interface LayoutProps {
  children: ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  title: string;
  subtitle: string;
}

export default function Layout({ children, activeTab, onTabChange, title, subtitle }: LayoutProps) {
  return (
    <div className="min-h-screen flex bg-carbon-gray-10">
      <Sidebar activeTab={activeTab} onTabChange={onTabChange} />
      <main className="flex-1 flex flex-col">
        <Header title={title} subtitle={subtitle} />
        <div className="flex-1 p-8 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
