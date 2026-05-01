'use client';

import { useState } from 'react';
import {
  Activity,
  Calendar,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Package,
  DollarSign,
  Edit2,
  Layers,
  Truck,
  Ruler,
  AlertCircle,
} from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import type { RecentActivityEvent } from '@/lib/api';

/**
 * Crew-style activity feed: coloured icon tile + ALL-CAPS kicker
 * + strong body text + sub-line with PO/customer context. Bulk
 * groups (same field+value across multiple styles within a 60s
 * window) collapse into one row with a chip strip of affected
 * styles.
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

export function RecentActivityFeed({ groups, onPOClick, hasMore, loadingMore, onLoadMore }: Props) {
  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-400 italic">
        Nothing's happened yet.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="divide-y divide-gray-100 max-h-[490px] overflow-y-auto">
        {groups.map((g, idx) => (
          <ActivityRow
            key={`${g.type}-${g.po_number}-${idx}`}
            group={g}
            onPOClick={onPOClick}
          />
        ))}
      </div>

      {hasMore && (
        <div className="border-t border-gray-100 px-4 py-2.5 flex justify-center bg-gray-50/50">
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}

function ActivityRow({ group, onPOClick }: { group: ActivityGroup; onPOClick: (po: string, style?: string) => void }) {
  const f = formatGroup(group);
  const isBulk = group.count > 1;
  const isSupplier = (group.source || '').toLowerCase() === 'supplier';

  return (
    <div className="flex gap-2.5 px-3 py-2 hover:bg-gray-50/70 transition-colors">
      {/* Left edge category bar */}
      <div className="w-0.5 rounded-full flex-shrink-0 self-stretch" style={{ backgroundColor: f.colour }} />

      {/* Icon tile */}
      <div className={cn(
        'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md mt-0.5',
        f.iconBg
      )}>
        <f.Icon className={cn('h-3.5 w-3.5', f.iconText)} />
      </div>

      {/* Body */}
      <div className="min-w-0 flex-1">
        {/* Top row — actor · time · (badges) · PO on right */}
        <div className="flex items-center gap-1.5 text-[10px] leading-tight">
          <span className="font-semibold text-gray-700">{group.username}</span>
          <span className="text-gray-300">·</span>
          <span className="text-gray-400">{group.created_at ? relativeTime(group.created_at) : ''}</span>
          {isSupplier && (
            <span className="px-1 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-orange-50 text-orange-700 ring-1 ring-orange-100">
              Supplier
            </span>
          )}
          {isBulk && (
            <BulkStylesPill
              count={group.count}
              styles={group.styles}
              poNumber={group.po_number}
              onStyleClick={(s) => onPOClick(group.po_number, s)}
            />
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onPOClick(group.po_number, isBulk ? undefined : group.style_code); }}
            className="ml-auto flex items-center gap-1 font-mono text-gray-400 hover:text-gray-700 truncate max-w-[55%]"
            title={group.customer ? `${group.po_number} · ${group.customer}` : group.po_number}
          >
            <span className="font-semibold">{group.po_number}</span>
            {group.customer && (
              <span className="text-gray-300 font-sans truncate hidden sm:inline">· {group.customer}</span>
            )}
          </button>
        </div>

        {/* Body — action verb + values + (single-row style code) */}
        <div className="text-xs text-gray-800 leading-snug break-words mt-0.5">
          {f.body}
          {!isBulk && group.style_code && (
            <span className="text-gray-400 font-mono"> · {group.style_code}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function BulkStylesPill({ count, styles, poNumber, onStyleClick }: {
  count: number;
  styles: string[];
  poNumber: string;
  onStyleClick: (style: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <button
        type="button"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 ring-1 ring-blue-100 hover:bg-blue-100 transition-colors"
      >
        {count} styles
        <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="currentColor"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      {show && styles.length > 0 && (
        <div className="absolute top-full left-0 mt-1.5 bg-white text-gray-800 rounded-lg shadow-lg ring-1 ring-gray-200 py-2 px-2.5 z-50 min-w-[180px] max-w-[260px]">
          <div className="absolute bottom-full left-3 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[5px] border-b-white" />
          <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 px-1">Styles · {poNumber}</p>
          <div className="space-y-0 max-h-56 overflow-y-auto">
            {styles.map((s) => (
              <button
                key={s}
                onClick={(e) => { e.stopPropagation(); onStyleClick(s); }}
                className="w-full text-left text-[11px] font-mono px-1.5 py-1 rounded hover:bg-blue-50 hover:text-blue-700 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}

/* =============================================================
 * Formatter — decides icon, colour, kicker, and body for a group
 * ============================================================= */

interface Formatted {
  Icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconText: string;
  kicker: string;
  colour: string; // raw hex for the edge bar + kicker text
  body: React.ReactNode;
}

function formatGroup(g: ActivityGroup): Formatted {
  if (g.type === 'comment') {
    return {
      Icon: MessageSquare,
      iconBg: 'bg-purple-50',
      iconText: 'text-purple-600',
      kicker: 'Comment',
      colour: '#a855f7',
      body: (
        <span className="italic text-gray-700">"{g.comment_text || 'Added a comment'}"</span>
      ),
    };
  }

  const field = (g.field_name || '').toLowerCase();
  const newVal = g.new_value || '';
  const oldVal = g.old_value || '';

  // Sample status field → tone depends on outcome
  if (isStatusField(field)) {
    return formatStatus(g, field, newVal, oldVal);
  }
  if (isDateField(field)) {
    return {
      Icon: Calendar,
      iconBg: 'bg-indigo-50',
      iconText: 'text-indigo-600',
      kicker: g.component_name ? `${g.component_name} date` : 'Date changed',
      colour: '#6366f1',
      body: <ChangeBody label={prettyField(field)} oldValue={stripTime(oldVal)} newValue={stripTime(newVal)} />,
    };
  }
  if (isQuantityField(field)) {
    return {
      Icon: Package,
      iconBg: 'bg-teal-50',
      iconText: 'text-teal-600',
      kicker: 'Quantity',
      colour: '#14b8a6',
      body: <ChangeBody label={prettyField(field)} oldValue={oldVal} newValue={newVal} />,
    };
  }
  if (isMoneyField(field)) {
    return {
      Icon: DollarSign,
      iconBg: 'bg-emerald-50',
      iconText: 'text-emerald-600',
      kicker: 'Value',
      colour: '#10b981',
      body: <ChangeBody label={prettyField(field)} oldValue={oldVal} newValue={newVal} />,
    };
  }
  if (field === 'status') {
    return {
      Icon: Layers,
      iconBg: 'bg-amber-50',
      iconText: 'text-amber-600',
      kicker: 'Order status',
      colour: '#f59e0b',
      body: <ChangeBody label="Status" oldValue={oldVal} newValue={newVal} />,
    };
  }
  if (field.includes('vessel') || field.includes('tracking') || field.includes('fcl')) {
    return {
      Icon: Truck,
      iconBg: 'bg-sky-50',
      iconText: 'text-sky-600',
      kicker: 'Shipping',
      colour: '#0ea5e9',
      body: <ChangeBody label={prettyField(field)} oldValue={oldVal} newValue={newVal} />,
    };
  }
  if (field === 'size_breakdown' || field.startsWith('xs_') || field.startsWith('s_') || field === 'total_quantity') {
    return {
      Icon: Ruler,
      iconBg: 'bg-violet-50',
      iconText: 'text-violet-600',
      kicker: 'Sizing',
      colour: '#8b5cf6',
      body: <ChangeBody label={prettyField(field)} oldValue={oldVal} newValue={newVal} />,
    };
  }

  return {
    Icon: Edit2,
    iconBg: 'bg-slate-50',
    iconText: 'text-slate-600',
    kicker: g.component_name ? `${g.component_name} updated` : 'Field updated',
    colour: '#64748b',
    body: <ChangeBody label={prettyField(field)} oldValue={oldVal} newValue={newVal} />,
  };
}

function formatStatus(g: ActivityGroup, field: string, newVal: string, oldVal: string): Formatted {
  const v = newVal.toUpperCase();
  const sampleLabel = field.includes('fit') ? 'Fit Sample'
    : field.includes('strike') ? 'Strike Off'
    : field.includes('lab') ? 'Lab Dip'
    : field.includes('pps') ? 'PPS'
    : prettyField(field);
  const prefix = g.component_name ? `${g.component_name} · ${sampleLabel}` : sampleLabel;

  if (v === 'APPROVED') {
    return {
      Icon: CheckCircle2,
      iconBg: 'bg-emerald-50',
      iconText: 'text-emerald-600',
      kicker: 'Approved',
      colour: '#10b981',
      body: <span><strong>{prefix}</strong> approved</span>,
    };
  }
  if (v === 'REJECTED') {
    return {
      Icon: XCircle,
      iconBg: 'bg-red-50',
      iconText: 'text-red-600',
      kicker: 'Rejected',
      colour: '#ef4444',
      body: <span><strong>{prefix}</strong> rejected</span>,
    };
  }
  if (v === 'OUTSTANDING') {
    return {
      Icon: AlertCircle,
      iconBg: 'bg-amber-50',
      iconText: 'text-amber-600',
      kicker: 'Outstanding',
      colour: '#f59e0b',
      body: <span><strong>{prefix}</strong> marked outstanding</span>,
    };
  }
  if (v === 'NOT REQUIRED') {
    return {
      Icon: Layers,
      iconBg: 'bg-gray-100',
      iconText: 'text-gray-500',
      kicker: 'Not required',
      colour: '#94a3b8',
      body: <span><strong>{prefix}</strong> marked not required</span>,
    };
  }
  return {
    Icon: Activity,
    iconBg: 'bg-slate-50',
    iconText: 'text-slate-600',
    kicker: sampleLabel,
    colour: '#64748b',
    body: <ChangeBody label={prefix} oldValue={oldVal} newValue={newVal} />,
  };
}

function ChangeBody({ label, oldValue, newValue }: { label: string; oldValue: string; newValue: string }) {
  return (
    <span>
      <strong>{label}</strong>
      {oldValue && <> · <span className="text-gray-400 line-through">{oldValue}</span></>}
      {oldValue && newValue && <span className="text-gray-300"> → </span>}
      {!oldValue && newValue && <> · </>}
      {newValue && <strong className="text-gray-900">{newValue}</strong>}
    </span>
  );
}

/* =============================================================
 * Field-name categorization
 * ============================================================= */

function isStatusField(field: string): boolean {
  return /_status$/.test(field) || field === 'pps_status' || field === 'fit_sample_status' || field === 'strike_off_status' || field === 'lab_dip_status';
}

function isDateField(field: string): boolean {
  if (!field) return false;
  return /(_date|_received|_approved|_etd|_eta|_factory|_dispatch|_arrive|_to_customer|_to_uk|_to_port|_sent|_required|received|approved)$/.test(field);
}

function isQuantityField(field: string): boolean {
  return field === 'total_quantity' || field === 'expected_quantity' || field === 'units_ordered';
}

function isMoneyField(field: string): boolean {
  return field === 'trade_price' || field === 'total_order_value' || field.includes('price') || field.includes('cost') || field.includes('value');
}

function prettyField(field: string): string {
  if (!field) return '';
  return field
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function stripTime(v: string): string {
  if (!v) return v;
  const m = v.match(/^(\d{4}-\d{2}-\d{2})[T\s]\d{2}:\d{2}(?::\d{2})?/);
  return m ? m[1] : v;
}

function relativeTime(iso: string): string {
  try {
    const d = parseISO(iso);
    const ms = Date.now() - d.getTime();
    const mins = Math.round(ms / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days < 7) return `${days}d ago`;
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return '';
  }
}

/* =============================================================
 * Bulk grouping helper — exported so the dashboard can call it
 * ============================================================= */

export function groupBulkActivity(events: RecentActivityEvent[]): ActivityGroup[] {
  const groups: ActivityGroup[] = [];
  const WINDOW_MS = 60_000;
  for (const e of events) {
    const eTime = e.created_at ? new Date(e.created_at).getTime() : 0;
    const key = e.type === 'comment'
      ? `comment|${e.username}|${e.po_number}|${e.comment_text || ''}`
      : `change|${e.username}|${e.po_number}|${e.field_name || ''}|${e.old_value || ''}|${e.new_value || ''}|${e.component_name || ''}`;
    const match = groups.find((g) => {
      const gKey = g.type === 'comment'
        ? `comment|${g.username}|${g.po_number}|${g.comment_text || ''}`
        : `change|${g.username}|${g.po_number}|${g.field_name || ''}|${g.old_value || ''}|${g.new_value || ''}|${g.component_name || ''}`;
      if (gKey !== key) return false;
      const gTime = g.created_at ? new Date(g.created_at).getTime() : 0;
      return Math.abs(gTime - eTime) <= WINDOW_MS;
    });
    if (match) {
      if (e.style_code && !match.styles.includes(e.style_code)) match.styles.push(e.style_code);
      match.count += 1;
    } else {
      groups.push({
        ...e,
        styles: e.style_code ? [e.style_code] : [],
        count: 1,
      });
    }
  }
  return groups;
}
