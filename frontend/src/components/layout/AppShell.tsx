'use client';

import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

interface AppShellProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

export function AppShell({ children, title, subtitle }: AppShellProps) {
  return (
    <div className="min-h-screen bg-[#fafbfc] flex">
      <Sidebar />
      <div className="flex-1 ml-[68px] min-w-0 overflow-hidden transition-all duration-300">
        <TopBar title={title} subtitle={subtitle} />
        <main className="p-8 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
