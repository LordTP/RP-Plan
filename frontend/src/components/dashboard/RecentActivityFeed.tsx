'use client';

import { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
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
  ExternalLink,
} from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { cn, getStatusColor } from '@/lib/utils';
import type { RecentActivityEvent } from '@/lib/api';

/**
 * Stripe-style PO-grouped activity feed: every PO with recent activity gets
 * its own card with header (PO number, customer, status pill, "Open" CTA)
 * + a list of slim event rows nested inside. Bulk events (same field+value
 * across multiple styles within 60s) collapse into a single row with a
 * hover tooltip listing the affected SKUs.
 */

export type ActivityGroup = RecentActivityEvent & {
  styles: string[];
  count: number;
};

interface POGroup {
  po_number: string;
  customer: string | null;
  status: string | null;
  factory: string | null;
  groups: ActivityGroup[];
  latestAt: number;
}

interface Props {
  groups: ActivityGroup[];
  onPOClick: (po: string, style?: string) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

export function RecentActivityFeed({ groups, onPOClick, hasMore, loadingMore, onLoadMore }: Props) {
  // Re-group the bulk-collapsed events by PO so each PO becomes a card.
  const poGroups = useMemo(() => groupByPO(groups), [groups]);

  if (poGroups.length === 0) {
    return (
      <div className="rounded-lg ring-1 ring-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-400 italic">
        Nothing's happened yet.
      </div>
    );
  }

  // Single bordered container · PO header acts as a section divider inside
  // the same list, NOT as a separate card. Events flow as one continuous
  // surface from one PO to the next.
  return (
    <div className="ring-1 ring-gray-200 rounded-lg overflow-hidden bg-white flex flex-col" style={{ height: 640 }}>
      <div
        className="flex-1 overflow-y-auto"
        style={{
          scrollBehavior: 'smooth',
          overscrollBehavior: 'contain',
        }}
      >
        {poGroups.map((po, poIdx) => (
          <div key={po.po_number}>
            <POSectionHeader po={po} onPOClick={onPOClick} isFirst={poIdx === 0} />
            {po.groups.map((g, idx) => (
              <POActivityRow
                key={`${g.type}-${idx}`}
                group={g}
                poNumber={po.po_number}
                onStyleClick={(s) => onPOClick(po.po_number, s)}
              />
            ))}
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="border-t border-gray-100 px-3 py-2 flex justify-center bg-gray-50/40 flex-shrink-0">
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="text-[11px] font-semibold text-gray-500 hover:text-gray-700 disabled:opacity-50 transition-colors"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}

function POSectionHeader({ po, onPOClick, isFirst }: { po: POGroup; onPOClick: (po: string, style?: string) => void; isFirst: boolean }) {
  const totalEvents = po.groups.reduce((sum, g) => sum + g.count, 0);
  const latestRel = relativeTime(new Date(po.latestAt).toISOString());
  const statusClass = po.status ? getStatusColor(po.status) : '';

  return (
    <div className={cn(
      'px-3 py-2 flex items-center gap-2 bg-gray-50/70 sticky top-0 z-10',
      !isFirst && 'border-t border-gray-200'
    )}>
      <button
        onClick={(e) => { e.stopPropagation(); onPOClick(po.po_number); }}
        className="font-mono text-xs font-bold text-gray-900 hover:text-blue-700"
      >
        {po.po_number}
      </button>
      {po.customer && (
        <span className="text-[11px] text-gray-500 truncate max-w-[180px]">{po.customer}</span>
      )}
      {po.status && (
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-semibold', statusClass)}>
          {po.status}
        </span>
      )}
      <span className="ml-auto text-[10px] text-gray-400 whitespace-nowrap flex items-center gap-1.5">
        {totalEvents} event{totalEvents > 1 ? 's' : ''} · {latestRel}
        <button
          onClick={(e) => { e.stopPropagation(); onPOClick(po.po_number); }}
          className="text-gray-400 hover:text-blue-600"
          title="Open PO"
        >
          <ExternalLink className="w-3 h-3" />
        </button>
      </span>
    </div>
  );
}

function POActivityRow({ group, poNumber, onStyleClick }: {
  group: ActivityGroup;
  poNumber: string;
  onStyleClick: (style: string) => void;
}) {
  const f = formatGroup(group);
  const isBulk = group.count > 1;
  const isSupplier = (group.source || '').toLowerCase() === 'supplier';

  return (
    <div className="px-3 py-1.5 pl-4 flex items-start gap-2.5 hover:bg-gray-50/60 transition-colors border-t border-gray-50">
      {/* Icon tile */}
      <div className={cn('flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md mt-0.5', f.iconBg)}>
        <f.Icon className={cn('h-3.5 w-3.5', f.iconText)} />
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="text-xs text-gray-800 leading-snug break-words">
          <strong className="text-gray-900">{group.username}</strong>
          {isSupplier && (
            <span className="ml-1 px-1 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-orange-50 text-orange-700 ring-1 ring-orange-100 align-middle">
              supplier
            </span>
          )}{' '}
          {f.verb}
          {isBulk ? (
            <>
              {' '}
              <BulkStylesPill
                count={group.count}
                styles={group.styles}
                poNumber={poNumber}
                onStyleClick={onStyleClick}
              />
            </>
          ) : group.style_code ? (
            <> on <span className="font-mono text-gray-700">{group.style_code}</span></>
          ) : null}
        </div>
        {f.detail && <div className="text-[11px] text-gray-500 mt-0.5 break-words">{f.detail}</div>}
      </div>

      <span className="text-[10px] text-gray-400 font-mono whitespace-nowrap mt-0.5">
        {group.created_at ? relativeTime(group.created_at) : ''}
      </span>
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
  const [pos, setPos] = useState<{ top: number; left: number; below: boolean } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Position the portal-rendered popup near the trigger. Flip above
  // when there's no room below, and clamp left within the viewport.
  useLayoutEffect(() => {
    if (!show || !triggerRef.current) { setPos(null); return; }
    const rect = triggerRef.current.getBoundingClientRect();
    const POPUP_W = 260;
    const POPUP_H = 240;
    const GAP = 6;
    const below = rect.bottom + GAP + POPUP_H <= window.innerHeight - 8;
    const top = below ? rect.bottom + GAP : Math.max(8, rect.top - POPUP_H - GAP);
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - POPUP_W - 8);
    setPos({ top, left, below });
  }, [show]);

  return (
    <>
      <span
        ref={triggerRef}
        className="inline-flex"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      >
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded text-[10px] font-bold bg-blue-50 text-blue-700 ring-1 ring-blue-100 hover:bg-blue-100 transition-colors align-baseline"
        >
          {count} styles
          <svg className="w-2.5 h-2.5" viewBox="0 0 12 12">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </span>
      {show && pos && styles.length > 0 && typeof window !== 'undefined' && createPortal(
        <div
          ref={popupRef}
          className="fixed bg-white text-gray-800 rounded-lg shadow-xl ring-1 ring-gray-200 py-2 px-2.5 min-w-[180px] max-w-[260px]"
          style={{ top: pos.top, left: pos.left, zIndex: 100 }}
          onMouseEnter={() => setShow(true)}
          onMouseLeave={() => setShow(false)}
        >
          <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 px-1">Styles · {poNumber}</p>
          <div className="space-y-0 max-h-56 overflow-y-auto" style={{ scrollBehavior: 'smooth', overscrollBehavior: 'contain' }}>
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
        </div>,
        document.body,
      )}
    </>
  );
}

/* =============================================================
 * Formatter — returns the icon + "verb" sentence + optional
 * detail line for a group. Sentences are written so the row
 * reads as: "<actor> <verb> <on STYLE / on N styles>"
 * ============================================================= */

interface Formatted {
  Icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconText: string;
  verb: React.ReactNode;
  detail: React.ReactNode | null;
}

function formatGroup(g: ActivityGroup): Formatted {
  if (g.type === 'comment') {
    return {
      Icon: MessageSquare,
      iconBg: 'bg-purple-50',
      iconText: 'text-purple-600',
      verb: <>commented</>,
      detail: <span className="italic text-gray-700">"{g.comment_text || 'Added a comment'}"</span>,
    };
  }

  const field = (g.field_name || '').toLowerCase();
  const newVal = g.new_value || '';
  const oldVal = g.old_value || '';
  const fieldLabel = prettyField(field);

  if (isStatusField(field)) {
    return formatStatus(g, field, newVal, oldVal);
  }
  if (field === 'status') {
    return {
      Icon: Layers,
      iconBg: 'bg-amber-50',
      iconText: 'text-amber-600',
      verb: <>changed <strong className="font-semibold">Status</strong> to <strong className="text-amber-700">{newVal}</strong></>,
      detail: oldVal ? <span>from <span className="line-through">{oldVal}</span></span> : null,
    };
  }
  if (isDateField(field)) {
    return {
      Icon: Calendar,
      iconBg: 'bg-indigo-50',
      iconText: 'text-indigo-600',
      verb: <>changed {g.component_name && <span className="text-violet-600 font-semibold">{g.component_name} · </span>}<strong className="font-semibold">{fieldLabel}</strong></>,
      detail: <ChangeBody oldValue={stripTime(oldVal)} newValue={stripTime(newVal)} />,
    };
  }
  if (isQuantityField(field)) {
    return {
      Icon: Package,
      iconBg: 'bg-teal-50',
      iconText: 'text-teal-600',
      verb: <>updated <strong className="font-semibold">{fieldLabel}</strong></>,
      detail: <ChangeBody oldValue={oldVal} newValue={newVal} />,
    };
  }
  if (isMoneyField(field)) {
    return {
      Icon: DollarSign,
      iconBg: 'bg-emerald-50',
      iconText: 'text-emerald-600',
      verb: <>updated <strong className="font-semibold">{fieldLabel}</strong></>,
      detail: <ChangeBody oldValue={oldVal} newValue={newVal} />,
    };
  }
  if (field.includes('vessel') || field.includes('tracking') || field.includes('fcl')) {
    return {
      Icon: Truck,
      iconBg: 'bg-sky-50',
      iconText: 'text-sky-600',
      verb: <>updated <strong className="font-semibold">{fieldLabel}</strong></>,
      detail: newVal && !oldVal
        ? <strong className="text-gray-700">{newVal}</strong>
        : <ChangeBody oldValue={oldVal} newValue={newVal} />,
    };
  }
  if (field === 'size_breakdown' || field.startsWith('xs_') || field.startsWith('s_')) {
    return {
      Icon: Ruler,
      iconBg: 'bg-violet-50',
      iconText: 'text-violet-600',
      verb: <>updated <strong className="font-semibold">{fieldLabel}</strong></>,
      detail: <ChangeBody oldValue={oldVal} newValue={newVal} />,
    };
  }

  return {
    Icon: Edit2,
    iconBg: 'bg-slate-50',
    iconText: 'text-slate-600',
    verb: <>updated {g.component_name && <span className="text-violet-600 font-semibold">{g.component_name} · </span>}<strong className="font-semibold">{fieldLabel}</strong></>,
    detail: <ChangeBody oldValue={oldVal} newValue={newVal} />,
  };
}

function formatStatus(g: ActivityGroup, field: string, newVal: string, oldVal: string): Formatted {
  const v = newVal.toUpperCase();
  const sampleLabel = field.includes('fit') ? 'Fit Sample'
    : field.includes('strike') ? 'Strike Off'
    : field.includes('lab') ? 'Lab Dip'
    : field.includes('pps') ? 'PPS'
    : prettyField(field);
  const labelNode = g.component_name
    ? <><span className="text-violet-600 font-semibold">{g.component_name} · </span><strong className="font-semibold">{sampleLabel}</strong></>
    : <strong className="font-semibold">{sampleLabel}</strong>;

  if (v === 'APPROVED') {
    return {
      Icon: CheckCircle2,
      iconBg: 'bg-emerald-50',
      iconText: 'text-emerald-600',
      verb: <>approved {labelNode}</>,
      detail: null,
    };
  }
  if (v === 'REJECTED') {
    return {
      Icon: XCircle,
      iconBg: 'bg-red-50',
      iconText: 'text-red-600',
      verb: <>rejected {labelNode}</>,
      detail: null,
    };
  }
  if (v === 'OUTSTANDING') {
    return {
      Icon: AlertCircle,
      iconBg: 'bg-amber-50',
      iconText: 'text-amber-600',
      verb: <>marked {labelNode} <strong className="text-amber-700">outstanding</strong></>,
      detail: null,
    };
  }
  if (v === 'NOT REQUIRED') {
    return {
      Icon: Layers,
      iconBg: 'bg-gray-100',
      iconText: 'text-gray-500',
      verb: <>marked {labelNode} <span className="text-gray-500">not required</span></>,
      detail: null,
    };
  }
  return {
    Icon: Activity,
    iconBg: 'bg-slate-50',
    iconText: 'text-slate-600',
    verb: <>updated {labelNode}</>,
    detail: <ChangeBody oldValue={oldVal} newValue={newVal} />,
  };
}

function ChangeBody({ oldValue, newValue }: { oldValue: string; newValue: string }) {
  if (!oldValue && !newValue) return null;
  return (
    <span>
      {oldValue && <span className="line-through text-gray-400">{oldValue}</span>}
      {oldValue && newValue && <span className="text-gray-300"> → </span>}
      {newValue && <strong className="text-gray-700">{newValue}</strong>}
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
  return field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
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
 * Bulk grouping helper — collapses same-field+value writes across
 * multiple styles within a 60s window into a single ActivityGroup
 * (used by the dashboard before passing into this component).
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

/* =============================================================
 * PO grouping — fold the bulk-collapsed events under their PO,
 * preserving overall newest-first order by latest event timestamp.
 * ============================================================= */

function groupByPO(activityGroups: ActivityGroup[]): POGroup[] {
  const byPO = new Map<string, POGroup>();
  for (const g of activityGroups) {
    const t = g.created_at ? new Date(g.created_at).getTime() : 0;
    const existing = byPO.get(g.po_number);
    if (existing) {
      existing.groups.push(g);
      if (t > existing.latestAt) existing.latestAt = t;
    } else {
      byPO.set(g.po_number, {
        po_number: g.po_number,
        customer: g.customer ?? null,
        status: g.status ?? null,
        factory: g.factory ?? null,
        groups: [g],
        latestAt: t,
      });
    }
  }
  return Array.from(byPO.values()).sort((a, b) => b.latestAt - a.latestAt);
}
