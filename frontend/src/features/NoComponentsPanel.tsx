'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, Layers, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Order } from '@/types';

type POGroup = { po: string; customer: string; factory: string; styles: Order[] };

/**
 * Orders that have no components at all, grouped by PO.
 *
 * The worklist above this shows samples in flight, which means it can only
 * show work that has already been set up. An order nobody has added components
 * to yet has no samples, so it appears nowhere — and with a freshly imported
 * book that is most of them. The page read "Nothing in flight. Every sample is
 * approved, not required or shipped" while 106 of 110 orders had not been
 * started, which is the opposite of the truth.
 *
 * Grouped by PO because that is the unit people work in: components are
 * normally decided once for a PO and applied across its styles, and the add
 * modal's own picker groups the same way. Each row opens that modal with the
 * PO's styles already ticked, so the list is a queue to burn down rather than
 * a report to read.
 */
export function NoComponentsPanel({
  orders,
  onAddForOrders,
  onOpenStyle,
}: {
  orders: Order[];
  onAddForOrders: (orderIds: number[], poNumber: string) => void;
  onOpenStyle: (orderId: number) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const groups = useMemo<POGroup[]>(() => {
    const bare = orders.filter(o => !(o.components || []).length);
    const byPO = new Map<string, POGroup>();
    for (const o of bare) {
      const key = o.po_number || '—';
      const g = byPO.get(key) || { po: key, customer: o.customer || '', factory: o.factory || '', styles: [] };
      g.styles.push(o);
      byPO.set(key, g);
    }
    // Biggest first: the PO with 34 styles is where an hour goes.
    return Array.from(byPO.values()).sort((a, b) => b.styles.length - a.styles.length);
  }, [orders]);

  if (!groups.length) return null;

  const totalStyles = groups.reduce((n, g) => n + g.styles.length, 0);
  const visible = showAll ? groups : groups.slice(0, 8);

  const toggle = (po: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(po) ? next.delete(po) : next.add(po);
      return next;
    });

  return (
    // The page is a fixed-height frame — it does not grow and does not
    // scroll — so this box gets a ceiling and scrolls its own list instead.
    //
    // The ceiling is a percentage of the column, not of the viewport: the
    // in-flight list above shares the same space, and a vh-based cap took so
    // much of a laptop window that the cards above were clipped to a sliver.
    // shrink-0 stops the flex column squashing it: as a flex child it
    // defaults to flex-shrink:1, and with overflow-hidden for the rounded
    // corners it would silently clip rows rather than show a scrollbar.
    <section className="mt-6 shrink-0 flex flex-col max-h-[45%] rounded-xl bg-white ring-1 ring-gray-200 overflow-hidden">
      <header className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
          <Layers className="w-3.5 h-3.5 text-amber-600" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-bold text-gray-900 leading-tight">Not started</h3>
          <p className="text-[11.5px] text-gray-500 mt-0.5">
            <b className="text-gray-700">{totalStyles}</b>{' '}
            {totalStyles === 1 ? 'style has' : 'styles have'} no components yet, across{' '}
            <b className="text-gray-700">{groups.length}</b> {groups.length === 1 ? 'PO' : 'POs'}.
            Nothing can be sampled until they are added.
          </p>
        </div>
      </header>

      <ul className="divide-y divide-gray-50 overflow-y-auto min-h-0">
        {visible.map(g => {
          const open = expanded.has(g.po);
          return (
            <li key={g.po}>
              <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50/60 transition-colors">
                <button
                  onClick={() => toggle(g.po)}
                  className="flex items-center gap-2 min-w-0 flex-1 text-left"
                  aria-expanded={open}
                >
                  <ChevronRight className={cn('w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform',
                    open && 'rotate-90')} />
                  <span className="font-mono font-bold text-[12.5px] text-gray-900 tabular-nums">{g.po}</span>
                  {g.customer && <span className="text-[11.5px] text-gray-500 truncate">{g.customer}</span>}
                  <span className="ml-auto text-[11px] text-gray-400 tabular-nums whitespace-nowrap pr-1">
                    {g.styles.length} {g.styles.length === 1 ? 'style' : 'styles'}
                  </span>
                </button>
                <button
                  onClick={() => onAddForOrders(g.styles.map((s: Order) => s.id), g.po)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11.5px] font-semibold
                             text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors flex-shrink-0"
                >
                  <Plus className="w-3 h-3" />
                  Add components
                </button>
              </div>

              {open && (
                <ul className="bg-gray-50/40 border-t border-gray-100">
                  {g.styles.map((s: Order) => (
                    <li key={s.id}>
                      <button
                        onClick={() => onOpenStyle(s.id)}
                        className="w-full flex items-center gap-3 pl-11 pr-4 py-1.5 text-left hover:bg-white transition-colors"
                      >
                        <span className="font-mono text-[11.5px] text-gray-700 tabular-nums flex-shrink-0">
                          {s.style_code || '—'}
                        </span>
                        <span className="text-[11.5px] text-gray-500 truncate">{s.description || '—'}</span>
                        {s.colour && (
                          <span className="ml-auto text-[10.5px] text-gray-400 truncate flex-shrink-0">{s.colour}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {groups.length > visible.length && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full px-4 py-2 text-[11.5px] font-medium text-gray-500 hover:text-gray-900
                     hover:bg-gray-50 border-t border-gray-100 transition-colors flex-shrink-0"
        >
          Show {groups.length - visible.length} more {groups.length - visible.length === 1 ? 'PO' : 'POs'}
        </button>
      )}
    </section>
  );
}
