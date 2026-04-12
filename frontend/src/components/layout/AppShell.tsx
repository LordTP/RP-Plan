'use client';

import { Navbar } from './Navbar';

interface AppShellProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

export function AppShell({ children, title, subtitle }: AppShellProps) {
  return (
    <div className="min-h-screen bg-[#fafbfc] flex flex-col">
      <Navbar />
      <main className="flex-1 p-6 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
