'use client';

import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RecentActivityEvent } from '@/lib/api';

/**
 * Activity — a flat log, grouped by day.
 *
 * Replaces a Stripe-style view where every PO became a card containing event
 * cards, with thirteen icon variants and a hover tooltip rendered through a
 * portal. Card heights varied per PO so the column jumped as it loaded, and
 * the nesting meant you read structure before you read content. This is one
 * row per event — a plain sentence that may wrap, then the style and PO
 * underneath it — with three dot colours and day headers that pin on scroll.
 *
 * Bulk collapsing is kept: the same field set to the same value across several
 * styles within a minute is one line saying "on 4 styles", not four lines.
 */

export type ActivityGroup = RecentActivityEvent & {
  styles: string[];
  count: number;
};

interface Props {
  groups: ActivityGroup[];
  onPOClick: (po: string, style?: string) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

/** green = signed off · blue = the factory did something · amber = we edited something */
type Tone = 'green' | 'blue' | 'amber';

const DOT: Record<Tone, string> = {
  green: 'bg-teal-600',
  blue: 'bg-primary-500',
  amber: 'bg-amber-600',
};

const prettyField = (f?: string) =>
  (f || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();

/** Dates arrive as raw ISO ("2026-09-25 00:00:00"); nobody wants to read that. */
function prettyValue(v?: string): string {
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
    const d = new Date(v.slice(0, 10));
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
    }
  }
  return v;
}

/** Sample prefixes read better spelled out than title-cased from the column. */
const SAMPLE_WORDS: Record<string, string> = {
  strike_off: 'strike off',
  lab_dip: 'lab dip',
  fit_sample: 'fit sample',
  pps: 'PPS',
  label: 'label',
};
const sampleWord = (prefix: string) => SAMPLE_WORDS[prefix] || prettyField(prefix).toLowerCase();

/**
 * One plain sentence per event, plus the dot colour that matches it.
 *
 * The field names are not written for humans: adding a component arrives as
 * field "component:RIB FABRIC" with value "added blank", which the previous
 * pass rendered as "changed RIB FABRIC Component:Rib Fabric to added blank".
 * Each shape gets handled explicitly rather than title-cased and hoped for.
 */
function describe(g: ActivityGroup): { tone: Tone; action: React.ReactNode } {
  const who = <b className="font-semibold text-gray-900">{g.username}</b>;
  // Note: the style count is deliberately absent here — it lives on the
  // context line underneath, and having it in both read as a stutter.
  const comp = g.component_name ? <b className="font-semibold text-gray-700">{g.component_name}</b> : null;

  if (g.type === 'comment') {
    return {
      tone: 'blue',
      action: <>{who} commented{g.comment_text ? <>: “{g.comment_text}”</> : null}</>,
    };
  }

  const field = (g.field_name || '').toLowerCase();
  const value = prettyValue(g.new_value);
  const cleared = !g.new_value;

  // A component being added to a style.
  if (field.startsWith('component:')) {
    return { tone: 'amber', action: <>{who} added component {comp}</> };
  }

  const sample = (suffix: string) => {
    const prefix = field.slice(0, -suffix.length);
    return <>{comp ? <>{comp} </> : null}{sampleWord(prefix)}</>;
  };

  if (field.endsWith('_approved') && !cleared) {
    return { tone: 'green', action: <>{who} approved {sample('_approved')} <span className="text-gray-400">— {value}</span></> };
  }
  if (field.endsWith('_received') && !cleared) {
    return { tone: 'blue', action: <>{who} marked {sample('_received')} received <span className="text-gray-400">— {value}</span></> };
  }
  if (field.includes('_sent_to_') && !cleared) {
    const what = prettyField(field.replace(/_sent_to_\w+$/, '')).toLowerCase();
    const to = field.endsWith('_to_customer') ? 'the customer' : 'the factory';
    return { tone: 'green', action: <>{who} sent {what} to {to} <span className="text-gray-400">— {value}</span></> };
  }
  if (field.endsWith('_status')) {
    return {
      tone: 'amber',
      action: <>{who} set {sample('_status')} status to <b className="font-semibold text-gray-700">{g.new_value || 'blank'}</b></>,
    };
  }

  const label = prettyField(field).toLowerCase();
  if (cleared) {
    return { tone: 'amber', action: <>{who} cleared {label}</> };
  }
  return {
    tone: 'amber',
    action: (
      <>
        {who} set {label} to <b className="font-semibold text-gray-700">{value}</b>
        {g.old_value ? <span className="text-gray-400"> (was {prettyValue(g.old_value)})</span> : null}
        
      </>
    ),
  };
}

function dayLabel(iso: string | null): string {
  if (!iso) return 'Earlier';
  const d = new Date(iso);
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
}

export function RecentActivityFeed({ groups, onPOClick, hasMore, loadingMore, onLoadMore }: Props) {
  // Group by day, preserving the newest-first order the API already returns.
  const days = useMemo(() => {
    const out: { label: string; items: ActivityGroup[] }[] = [];
    for (const g of groups) {
      const label = dayLabel(g.created_at);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(g);
      else out.push({ label, items: [g] });
    }
    return out;
  }, [groups]);

  if (groups.length === 0) {
    return (
      <div className="py-12 text-center text-[13px] text-gray-400">
        Nothing has happened yet.
      </div>
    );
  }

  return (
    <div>
      {days.map(day => (
        <div key={day.label}>
          <div className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-sm px-3.5 py-1.5
                          border-y border-gray-100 font-mono text-[9.5px] font-semibold
                          uppercase tracking-[0.1em] text-gray-400">
            {day.label}
          </div>
          {day.items.map((g, i) => {
            const { tone, action } = describe(g);
            // Context on its own line: the style this happened to, the PO, and
            // who it sits with. The PO used to be gray-300 at 10px on the far
            // right, which is effectively invisible.
            const context = g.count > 1 ? `${g.count} styles` : g.style_code;
            return (
              <button
                key={`${day.label}-${i}`}
                onClick={() => onPOClick(g.po_number, g.count === 1 ? g.style_code : undefined)}
                title={g.count > 1 ? g.styles.join(', ') : g.style_code || ''}
                className="w-full flex items-start gap-2.5 px-3.5 py-2 text-left
                           border-b border-gray-50 hover:bg-gray-50 transition-colors"
              >
                <span className="flex-none w-[38px] pt-[3px] font-mono text-[10px] text-gray-400">
                  {g.created_at
                    ? new Date(g.created_at).toLocaleTimeString('en-GB',
                        { hour: '2-digit', minute: '2-digit' })
                    : '—'}
                </span>
                <span className={cn('flex-none w-[6px] h-[6px] rounded-full mt-[6px]', DOT[tone])} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] leading-[1.45] text-gray-600">{action}</span>
                  <span className="block mt-0.5 text-[10.5px] leading-tight truncate">
                    <span className="font-mono font-semibold text-primary-600">{g.po_number}</span>
                    {context && <span className="text-gray-400"> · {context}</span>}
                    {g.factory && <span className="text-gray-400"> · {g.factory}</span>}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ))}

      {hasMore && (
        <div className="px-3.5 py-2.5">
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg
                       border border-gray-200 text-[11.5px] font-semibold text-gray-500
                       hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50"
          >
            {loadingMore && <Loader2 className="w-3 h-3 animate-spin" />}
            Load more
          </button>
        </div>
      )}
    </div>
  );
}

/* =============================================================
 * Bulk collapsing — the same field set to the same value across
 * several styles within a minute becomes one row. Unchanged from
 * the previous feed; it is the part that was working.
 * ============================================================= */

export function groupBulkActivity(events: RecentActivityEvent[]): ActivityGroup[] {
  const groups: ActivityGroup[] = [];
  const WINDOW_MS = 60_000;
  const keyOf = (e: RecentActivityEvent) =>
    e.type === 'comment'
      ? `comment|${e.username}|${e.po_number}|${e.comment_text || ''}`
      : `change|${e.username}|${e.po_number}|${e.field_name || ''}|${e.old_value || ''}|${e.new_value || ''}|${e.component_name || ''}`;

  for (const e of events) {
    const eTime = e.created_at ? new Date(e.created_at).getTime() : 0;
    const key = keyOf(e);
    const match = groups.find(g => {
      if (keyOf(g) !== key) return false;
      const gTime = g.created_at ? new Date(g.created_at).getTime() : 0;
      return Math.abs(gTime - eTime) <= WINDOW_MS;
    });
    if (match) {
      if (e.style_code && !match.styles.includes(e.style_code)) match.styles.push(e.style_code);
      match.count += 1;
    } else {
      groups.push({ ...e, styles: e.style_code ? [e.style_code] : [], count: 1 });
    }
  }
  return groups;
}
