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
  icon, title, subtitle, tone = 'neutral', badge, actions, defaultOpen = false, panelClassName, children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: React.ReactNode;
  /** Big number to the left of the title — the one figure worth seeing
   *  without reading anything. */
  badge?: React.ReactNode;
  /** Tints the icon tile — 'alert' when there is something to act on,
   *  'urgent' when that work is sitting with us rather than the factories.
   *  'urgent' also lights the strip, so it is visible without reading it. */
  tone?: 'alert' | 'neutral' | 'urgent';
  /** Search box or similar, shown in the header only while open. */
  actions?: React.ReactNode;
  defaultOpen?: boolean;
  panelClassName?: string;
  children: React.ReactNode;
}) {
  // null = untouched, so the default can depend on data that loads later.
  const [openState, setOpenState] = useState<boolean | null>(null);
  const isOpen = openState ?? defaultOpen;

  // A closed strip is one line among several on a busy page, so when the
  // work is ours it breathes a faint red rather than relying on someone
  // reading the subtitle. It settles once opened — by then it has been seen.
  const urgent = tone === 'urgent';

  return (
    <div className={cn('relative mb-4', isOpen && 'z-30')}>
      <div className={cn(
        'rounded-xl transition-colors',
        urgent
          // A tinted bar reads at a glance; a ring on a white strip does not.
          // It only ever appears when there is work in our own court, so it
          // cannot become wallpaper.
          ? 'bg-red-50 ring-1 ring-red-200 shadow-[0_1px_3px_rgba(190,24,60,0.08)]'
          : 'bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] ring-1 ring-gray-100',
        !isOpen && 'overflow-hidden',
      )}>
        {/* A red hairline along the top edge — visible even when the strip is
            scrolled to the very top of a dense page. */}
        {urgent && <div className="h-[3px] rounded-t-xl bg-red-500" />}
        <div className="px-5 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
              urgent ? 'bg-red-600' : tone === 'alert' ? 'bg-amber-100' : 'bg-gray-100')}>
              {icon}
            </div>
            {badge}
            <div className="min-w-0">
              <h3 className={cn('text-[15px] font-bold leading-tight',
                urgent ? 'text-red-900' : 'text-gray-900')}>{title}</h3>
              <div className={cn('text-xs truncate mt-0.5',
                urgent ? 'text-red-700' : 'text-gray-500')}>{subtitle}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isOpen && actions}
            <button
              // The derived value, not the raw state: openState starts null and
              // !null is true, so flipping the raw one left a closed panel
              // closed and the button appeared dead.
              onClick={() => setOpenState(!isOpen)}
              className={cn(
                'text-xs font-bold px-3 py-1.5 rounded-lg inline-flex items-center gap-1 transition-colors',
                urgent
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'text-gray-500 hover:text-gray-900',
              )}
            >
              {isOpen
                ? <>Hide <ChevronUp className="w-3.5 h-3.5" /></>
                : <>{urgent ? 'Clear them' : 'Show'} <ChevronDown className="w-3.5 h-3.5" /></>}
            </button>
          </div>
        </div>

        {isOpen && (
          <div className={cn(
            // Not gated on a breakpoint. Under lg these were falling back to
            // static, which put the panel back in the flow and pushed the whole
            // page down -- the very thing floating it was meant to stop. Every
            // page this sits on is desktop full-width, so there is no narrow
            // layout being protected by the gate.
            'absolute left-0 right-0 top-full mt-1 bg-white rounded-xl',
            'ring-1 ring-gray-200 shadow-2xl overflow-hidden',
            panelClassName,
          )}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
