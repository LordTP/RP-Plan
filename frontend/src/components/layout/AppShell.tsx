'use client';

import { Navbar } from './Navbar';

interface AppShellProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  /** Pin the page to the viewport so the CONTENT scrolls, not the window.
   *
   *  Off by default: most pages are documents that should grow and let the
   *  window scroll, and pinning them would clip anything past the fold
   *  (settings and the guides run well past it).
   *
   *  On, the shell becomes exactly one viewport tall and <main> is allowed to
   *  shrink, so a child with h-full gets a real height to fill and can put
   *  overflow-y-auto on its own panes. Without min-h-0 a flex child refuses to
   *  shrink below its content, which is what made h-full meaningless here. */
  fullHeight?: boolean;
  /**
   * Drop the overflow clip on <main> so `position: sticky` children work.
   *
   * Sticky resolves against its nearest scrolling ancestor, and an
   * `overflow: hidden` ancestor becomes that ancestor without ever
   * scrolling — so a sticky element just scrolls away. The clip is only
   * load-bearing for fullHeight pages, which do their own internal
   * scrolling; everywhere else it is belt-and-braces against horizontal
   * overflow. Opt in per page rather than removing it for all of them.
   */
  allowSticky?: boolean;
}

export function AppShell({ children, title, subtitle, fullHeight = false, allowSticky = false }: AppShellProps) {
  return (
    <div className={`${fullHeight ? 'h-screen overflow-hidden' : 'min-h-screen'} bg-[#fafbfc] flex flex-col`}>
      <Navbar />
      <main className={`flex-1 p-6${allowSticky && !fullHeight ? '' : ' overflow-hidden'}${fullHeight ? ' min-h-0' : ''}`}>
        {children}
      </main>
    </div>
  );
}
