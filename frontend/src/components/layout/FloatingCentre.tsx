'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A summary strip that drops its detail over the page rather than above it.
 *
 * Both the list pages this is used on are a hard `height: calc(100vh - 116px)`
 * with overflow-hidden, and the table takes whatever is left of that column. So
 * a 300px panel placed in the flow above the table does not push the table
 * down -- it shrinks it, and the page cannot scroll to compensate. On the
 * factory product page that left five order rows visible underneath a summary
 * of them.
 *
 * Keeping the header in flow and floating the body means the table never
 * changes size, and the panel can be as tall as it likes.
 *
 * Shared by the Requests Centre and the Warnings Centre so the two behave
 * identically, and so the two non-obvious details only exist once: the
 * overflow-hidden that has to be dropped when the panel is out, and a toggle
 * that flips the DERIVED open state rather than the raw null-initialised one.
 */
export function FloatingCentre({
  icon, title, subtitle, tone = 'neutral', actions, defaultOpen = false, panelClassName, children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  /** Tints the icon tile — 'alert' when there is something to act on. */
  tone?: 'alert' | 'neutral';
  /** Search box or similar, shown in the header only while open. */
  actions?: React.ReactNode;
  defaultOpen?: boolean;
  panelClassName?: string;
  children: React.ReactNode;
}) {
  // null = untouched, so the default can depend on data that loads later.
  const [openState, setOpenState] = useState<boolean | null>(null);
  const isOpen = openState ?? defaultOpen;

  return (
    <div className={cn('relative mb-4', isOpen && 'z-30')}>
      <div className={cn(
        'bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] ring-1 ring-gray-100',
        !isOpen && 'overflow-hidden',
      )}>
        <div className="px-5 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
              tone === 'alert' ? 'bg-amber-100' : 'bg-gray-100')}>
              {icon}
            </div>
            <div className="min-w-0">
              <h3 className="text-[15px] font-bold text-gray-900 leading-tight">{title}</h3>
              <p className="text-xs text-gray-500 truncate mt-0.5">{subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isOpen && actions}
            <button
              // The derived value, not the raw state: openState starts null and
              // !null is true, so flipping the raw one left a closed panel
              // closed and the button appeared dead.
              onClick={() => setOpenState(!isOpen)}
              className="text-xs font-semibold text-gray-500 hover:text-gray-900 px-2 py-1 inline-flex items-center gap-1"
            >
              {isOpen ? <>Hide <ChevronUp className="w-3.5 h-3.5" /></> : <>Show <ChevronDown className="w-3.5 h-3.5" /></>}
            </button>
          </div>
        </div>

        {isOpen && (
          <div className={cn(
            'lg:absolute lg:left-0 lg:right-0 lg:top-full lg:mt-1 bg-white lg:rounded-xl',
            'lg:ring-1 lg:ring-gray-200 lg:shadow-2xl overflow-hidden',
            panelClassName,
          )}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
