'use client';

import { format, parseISO } from 'date-fns';
import { MessageSquare, Eye, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SortableTh } from '@/components/orders/v2-list-primitives';
import type { Order } from '@/types';

/**
 * Shared model + table for the V2 order lists.
 *
 * Both /orders-v2 (which /design renders) and FactoryV2View (which the
 * factory routes render) show the same thing — POs grouped with their
 * styles — but they were separate 2,000-line files with their own copies
 * of the formatters, the status palette and the row markup. Everything
 * that isn't genuinely view-specific now lives here so a change to the
 * table lands on both at once.
 *
 * Deliberately NOT here: data loading, filtering state, the detail
 * panel, and anything supplier-gated. Those differ per view (local state
 * vs global store, the supplier date-request flow, column scoping) and
 * pulling them in would have meant a props interface bigger than the
 * duplication it removed.
 */

export interface POGroup {
  po_number: string;
  customer: string;
  factory: string;
  styles: Order[];
  totalQty: number;
  totalValue: number;
  statusSummary: string;
  /** Semantically the EARLIEST ex-factory across the PO's styles — the
   *  name is historical and kept for blast radius. */
  latestDate: string | null;
  unreadComments: number;
  latestUpdate: string;
}

// ─── Formatters ───────────────────────────────────────────────────────

export function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return 'never';
  try {
    const d = parseISO(dateStr);
    const mins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return format(d, 'dd MMM yyyy');
  } catch {
    return 'unknown';
  }
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return format(parseISO(dateStr), 'dd MMM yyyy');
  } catch {
    return dateStr;
  }
}

export function formatCurrency(val: number | null | undefined): string {
  if (val == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}

export function formatQty(val: number | null | undefined): string {
  if (val == null) return '—';
  return val.toLocaleString();
}

// ─── Order status palette ─────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  'In Production': { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-400' },
  'Pending Approval': { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-400' },
  'Shipped': { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-400' },
  'Delivered': { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-400' },
  'Cancelled': { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-400' },
  'On Hold': { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  'In Transit': { bg: 'bg-indigo-50', text: 'text-indigo-700', dot: 'bg-indigo-400' },
  'Order Confirmed': { bg: 'bg-teal-50', text: 'text-teal-700', dot: 'bg-teal-400' },
};

export function getStatusStyle(status: string | undefined) {
  if (!status) return { bg: 'bg-gray-100', text: 'text-gray-500', dot: 'bg-gray-300' };
  return STATUS_COLORS[status] || { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' };
}

/** Raw hex for a status dot — StatusTile takes a CSS colour rather than a
 *  Tailwind class because statuses are DB-driven, so the palette can't be
 *  resolved at build time from a static class map. */
const STATUS_DOT_HEX: Record<string, string> = {
  'In Production': '#fbbf24',
  'Pending Approval': '#fb923c',
  'Shipped': '#60a5fa',
  'Delivered': '#4ade80',
  'Cancelled': '#f87171',
  'On Hold': '#9ca3af',
  'In Transit': '#818cf8',
  'Order Confirmed': '#2dd4bf',
};

export function statusDotHex(status: string | undefined): string {
  if (!status) return '#d1d5db';
  return STATUS_DOT_HEX[status] || '#9ca3af';
}

// ─── Sample lifecycle palette ─────────────────────────────────────────
// Separate from getStatusStyle, which colours ORDER status. Conflating
// them would have APPROVED sharing a green with Delivered and
// OUTSTANDING sharing an amber with In Production — two different
// meanings wearing the same colour in the same panel.

const SAMPLE_STATUS_STYLE: Record<string, string> = {
  'APPROVED': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'RECEIVED': 'bg-blue-50 text-blue-700 border-blue-200',
  'OUTSTANDING': 'bg-amber-50 text-amber-700 border-amber-200',
  'LATE': 'bg-red-50 text-red-700 border-red-200',
  'REJECTED': 'bg-red-50 text-red-700 border-red-200',
  'NOT REQUIRED': 'bg-gray-100 text-gray-500 border-gray-200',
  'P23 ADVISE UPDATE': 'bg-orange-50 text-orange-700 border-orange-200',
};

export function SampleStatusPill({ status }: { status: string | null | undefined }) {
  const s = (status || '').toUpperCase();
  if (!s) return <span className="text-[10px] text-gray-300 italic">not set</span>;
  return (
    <span className={cn(
      'px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wide whitespace-nowrap',
      SAMPLE_STATUS_STYLE[s] || 'bg-gray-100 text-gray-600 border-gray-200',
    )}>
      {s}
    </span>
  );
}

// ─── Ex-factory window filter ─────────────────────────────────────────

export type ExFacWindow = '' | 'week' | '14' | '30' | 'overdue' | 'unset';

export const EXFAC_WINDOW_LABEL: Record<ExFacWindow, string> = {
  '': 'Any time',
  week: 'Next 7 days',
  '14': 'Next 14 days',
  '30': 'Next 30 days',
  overdue: 'Overdue',
  unset: 'No date set',
};

/** The date a style is actually working to — revised wins over original,
 *  matching the rule used everywhere else in the app. */
export function effectiveExFactory(order: Order): string | null {
  return order.revised_po_ex_factory || order.original_po_ex_factory || null;
}

export function matchesExFacWindow(order: Order, w: ExFacWindow): boolean {
  if (!w) return true;
  const iso = effectiveExFactory(order);
  if (w === 'unset') return !iso;
  if (!iso) return false;

  // Compare on date only — a style ex-factory'ing later today shouldn't
  // read as overdue because the stored timestamp is midnight.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let d: Date;
  try {
    d = parseISO(iso);
  } catch {
    return false;
  }
  d.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);

  if (w === 'overdue') return days < 0;
  if (w === 'week') return days >= 0 && days <= 7;
  if (w === '14') return days >= 0 && days <= 14;
  if (w === '30') return days >= 0 && days <= 30;
  return true;
}

// ─── Table sorting ────────────────────────────────────────────────────

export type SortKey = 'po' | 'style' | 'description' | 'colour' | 'status' | 'exfac' | 'qty' | 'value';

function sortValue(o: Order, key: SortKey): string | number | null {
  switch (key) {
    case 'po': return (o.po_number || '').toLowerCase();
    case 'style': return (o.style_code || '').toLowerCase();
    case 'description': return (o.description || '').toLowerCase();
    case 'colour': return (o.colour || '').toLowerCase();
    case 'status': return (o.status || '').toLowerCase();
    case 'exfac': return effectiveExFactory(o);
    case 'qty': return o.total_quantity ?? null;
    case 'value': return o.total_order_value ?? null;
    default: return null;
  }
}

export function compareStyles(a: Order, b: Order, key: SortKey, dir: 'asc' | 'desc'): number {
  const av = sortValue(a, key);
  const bv = sortValue(b, key);
  // Blanks sink regardless of direction — a column of empty dates at the
  // top of an ascending sort is never what someone asked for.
  const aEmpty = av === null || av === '';
  const bEmpty = bv === null || bv === '';
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  let cmp: number;
  if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
  else cmp = String(av).localeCompare(String(bv));
  return dir === 'asc' ? cmp : -cmp;
}

/** Group-level comparable for the active sort key. style / description /
 *  colour have no meaningful aggregate across a PO, so those fall back to
 *  earliest ex-factory and only the rows inside the group re-sort. */
export function groupSortValue(g: POGroup, key: SortKey): string | number | null {
  switch (key) {
    case 'po': return g.po_number.toLowerCase();
    case 'status': return (g.statusSummary || '').toLowerCase();
    case 'exfac': return g.latestDate;
    case 'qty': return g.totalQty;
    case 'value': return g.totalValue;
    default: return g.latestDate;
  }
}

export function sortGroups(groups: POGroup[], key: SortKey, dir: 'asc' | 'desc'): POGroup[] {
  return groups
    .map(g => ({ ...g, styles: [...g.styles].sort((a, b) => compareStyles(a, b, key, dir)) }))
    .sort((a, b) => {
      const av = groupSortValue(a, key);
      const bv = groupSortValue(b, key);
      const aEmpty = av === null || av === '';
      const bEmpty = bv === null || bv === '';
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv));
      return dir === 'asc' ? cmp : -cmp;
    });
}

// ─── Order table ──────────────────────────────────────────────────────

export function OrderTableV2({
  groups,
  flatRows,
  groupByPO,
  expandedPOs,
  onTogglePO,
  onStyleClick,
  onCommentClick,
  selectedStyleId,
  selectedIds,
  onToggleRow,
  onToggleGroup,
  onToggleAll,
  allVisibleSelected,
  sortKey,
  sortDir,
  onSort,
  isSupplier,
  isDesigner,
  rowExtra,
}: {
  groups: POGroup[];
  flatRows: Order[];
  groupByPO: boolean;
  expandedPOs: Set<string>;
  onTogglePO: (po: string) => void;
  onStyleClick: (order: Order) => void;
  onCommentClick: (order: Order) => void;
  selectedStyleId: number | null;
  selectedIds: Set<number>;
  onToggleRow: (order: Order, shiftKey: boolean) => void;
  onToggleGroup: (group: POGroup) => void;
  onToggleAll: (checked: boolean) => void;
  allVisibleSelected: boolean;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (key: string) => void;
  isSupplier: boolean;
  isDesigner?: boolean;
  /** Extra per-row control rendered in the actions cell. The factory views
   *  use it for the supplier's orange request-date-change button, which
   *  has no equivalent on the internal views. */
  rowExtra?: (order: Order) => React.ReactNode;
}) {
  const showValue = !isSupplier && !isDesigner;
  const colCount = (showValue ? 9 : 8) + (groupByPO ? 0 : 1);

  return (
    <table className="w-full text-sm border-collapse min-w-[1040px]">
      <thead className="sticky top-0 bg-gray-50 z-10">
        <tr className="text-left text-[10.5px] uppercase tracking-wider text-gray-500">
          <th className="px-3 py-2.5 border-b border-gray-200 w-9">
            <input
              type="checkbox"
              title="Select all visible styles"
              className="accent-primary-600 cursor-pointer"
              checked={allVisibleSelected}
              onChange={(e) => onToggleAll(e.target.checked)}
            />
          </th>
          {!groupByPO && (
            <SortableTh label="PO" sortKey="po" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-[110px]" />
          )}
          <SortableTh label="Style" sortKey="style" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-[150px]" />
          <SortableTh label="Description" sortKey="description" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
          <SortableTh label="Colour" sortKey="colour" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-[110px]" />
          <SortableTh label="Status" sortKey="status" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-[150px]" />
          <SortableTh label="Ex-factory" sortKey="exfac" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="w-[120px]" />
          <SortableTh label="Qty" sortKey="qty" currentSort={sortKey} currentDir={sortDir} onSort={onSort} align="right" className="w-[85px]" />
          {showValue && (
            <SortableTh label="Value" sortKey="value" currentSort={sortKey} currentDir={sortDir} onSort={onSort} align="right" className="w-[105px]" />
          )}
          <th className="px-3 py-2.5 border-b border-gray-200 w-[92px]" />
        </tr>
      </thead>
      <tbody>
        {groupByPO
          ? groups.map((g) => (
              <POGroupRows
                key={g.po_number}
                group={g}
                expanded={expandedPOs.has(g.po_number)}
                onToggle={() => onTogglePO(g.po_number)}
                onStyleClick={onStyleClick}
                onCommentClick={onCommentClick}
                selectedStyleId={selectedStyleId}
                selectedIds={selectedIds}
                onToggleRow={onToggleRow}
                onToggleGroup={onToggleGroup}
                isSupplier={isSupplier}
                isDesigner={isDesigner}
                colCount={colCount}
                rowExtra={rowExtra}
              />
            ))
          : flatRows.map((style) => (
              <StyleRow
                key={style.id}
                style={style}
                showPO
                selected={style.id === selectedStyleId}
                checked={selectedIds.has(style.id)}
                onToggleRow={onToggleRow}
                onStyleClick={onStyleClick}
                onCommentClick={onCommentClick}
                isSupplier={isSupplier}
                isDesigner={isDesigner}
                rowExtra={rowExtra}
              />
            ))}
      </tbody>
    </table>
  );
}

function POGroupRows({
  group,
  expanded,
  onToggle,
  onStyleClick,
  onCommentClick,
  selectedStyleId,
  selectedIds,
  onToggleRow,
  onToggleGroup,
  isSupplier,
  isDesigner,
  colCount,
  rowExtra,
}: {
  group: POGroup;
  expanded: boolean;
  onToggle: () => void;
  onStyleClick: (order: Order) => void;
  onCommentClick: (order: Order) => void;
  selectedStyleId: number | null;
  selectedIds: Set<number>;
  onToggleRow: (order: Order, shiftKey: boolean) => void;
  onToggleGroup: (group: POGroup) => void;
  isSupplier: boolean;
  isDesigner?: boolean;
  colCount: number;
  rowExtra?: (order: Order) => React.ReactNode;
}) {
  const statusStyle = getStatusStyle(group.statusSummary);
  const hasMultipleStatuses = new Set(group.styles.map((s) => s.status)).size > 1;
  const showValue = !isSupplier && !isDesigner;
  const allChecked = group.styles.length > 0 && group.styles.every((s) => selectedIds.has(s.id));
  const someChecked = !allChecked && group.styles.some((s) => selectedIds.has(s.id));

  return (
    <>
      <tr id={`po-card-${group.po_number}`} className="bg-gray-50/80 border-b border-gray-200">
        <td className="px-3 py-2">
          <input
            type="checkbox"
            className="accent-primary-600 cursor-pointer"
            checked={allChecked}
            ref={(el) => { if (el) el.indeterminate = someChecked; }}
            onChange={() => onToggleGroup(group)}
            onClick={(e) => e.stopPropagation()}
            title={`Select all ${group.styles.length} styles on PO ${group.po_number}`}
          />
        </td>
        <td colSpan={colCount - 1} className="px-3 py-2">
          <button onClick={onToggle} className="w-full flex items-center gap-3 text-left">
            <ChevronRight className={cn('w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0', expanded && 'rotate-90')} />
            <span className="font-mono font-bold text-gray-900 tabular-nums">{group.po_number}</span>
            {group.styles[0]?.china_orderbook_ref && (
              <span className="text-[11px] text-gray-400">— {group.styles[0].china_orderbook_ref}</span>
            )}
            <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold', statusStyle.bg, statusStyle.text)}>
              <span className={cn('w-1.5 h-1.5 rounded-full', statusStyle.dot)} />
              {group.statusSummary || 'Unknown'}
            </span>
            {hasMultipleStatuses && <span className="text-[10px] text-gray-400 italic">mixed</span>}
            {group.unreadComments > 0 && (
              <span className="inline-flex items-center gap-1 text-primary-500">
                <MessageSquare className="w-3 h-3 fill-current" />
                <span className="text-[10px] font-bold">{group.unreadComments}</span>
              </span>
            )}
            <span className="text-[11px] text-gray-500 truncate">{group.customer}</span>
            {!isSupplier && group.factory && (
              <span className="text-[11px] text-gray-400 truncate">· {group.factory}</span>
            )}
            <span className="ml-auto flex items-center gap-4 text-[11px] text-gray-500 tabular-nums flex-shrink-0">
              <span>{group.styles.length} style{group.styles.length === 1 ? '' : 's'}</span>
              <span>{formatQty(group.totalQty)} units</span>
              {showValue && <span>{formatCurrency(group.totalValue)}</span>}
              <span className="text-gray-400">{formatDate(group.latestDate)}</span>
            </span>
          </button>
        </td>
      </tr>
      {expanded && group.styles.map((style) => (
        <StyleRow
          key={style.id}
          style={style}
          selected={style.id === selectedStyleId}
          checked={selectedIds.has(style.id)}
          onToggleRow={onToggleRow}
          onStyleClick={onStyleClick}
          onCommentClick={onCommentClick}
          isSupplier={isSupplier}
          isDesigner={isDesigner}
          rowExtra={rowExtra}
        />
      ))}
    </>
  );
}

function StyleRow({
  style,
  showPO = false,
  selected,
  checked,
  onToggleRow,
  onStyleClick,
  onCommentClick,
  isSupplier,
  isDesigner,
  rowExtra,
}: {
  style: Order;
  showPO?: boolean;
  selected: boolean;
  checked: boolean;
  onToggleRow: (order: Order, shiftKey: boolean) => void;
  onStyleClick: (order: Order) => void;
  onCommentClick: (order: Order) => void;
  isSupplier: boolean;
  isDesigner?: boolean;
  rowExtra?: (order: Order) => React.ReactNode;
}) {
  const ss = getStatusStyle(style.status);
  const showValue = !isSupplier && !isDesigner;
  const exFac = effectiveExFactory(style);
  const exFacNote = style.date_notes?.revised_po_ex_factory || style.date_notes?.original_po_ex_factory;

  return (
    <tr
      onClick={() => onStyleClick(style)}
      className={cn(
        'border-b border-gray-100 cursor-pointer transition-colors',
        selected ? 'bg-primary-50' : checked ? 'bg-primary-50/40' : 'bg-white hover:bg-gray-50',
      )}
    >
      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          className="accent-primary-600 cursor-pointer"
          checked={checked}
          onChange={() => { /* handled on click so we can read shiftKey */ }}
          onClick={(e) => { e.stopPropagation(); onToggleRow(style, e.shiftKey); }}
        />
      </td>
      {showPO && (
        <td className="px-3 py-2 font-mono text-[12px] text-gray-500 tabular-nums truncate">{style.po_number}</td>
      )}
      <td className="px-3 py-2 font-mono text-[12px] font-semibold text-gray-900 tabular-nums truncate">
        {style.style_code || '—'}
      </td>
      <td className="px-3 py-2 text-gray-700 truncate max-w-0">{style.description || '—'}</td>
      <td className="px-3 py-2 text-[12px] text-gray-500 truncate">{style.colour || '—'}</td>
      <td className="px-3 py-2">
        <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap', ss.bg, ss.text)}>
          <span className={cn('w-1.5 h-1.5 rounded-full', ss.dot)} />
          {style.status || 'Unknown'}
        </span>
        {style.is_late && (
          <span className="ml-1 px-1.5 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded text-[9px] font-bold">LATE</span>
        )}
      </td>
      <td className="px-3 py-2 text-[12px] text-gray-700 tabular-nums whitespace-nowrap">
        {exFacNote || formatDate(exFac)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-gray-900">{formatQty(style.total_quantity)}</td>
      {showValue && (
        <td className="px-3 py-2 text-right tabular-nums text-gray-700 text-[12px]">{formatCurrency(style.total_order_value)}</td>
      )}
      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-0.5 justify-end">
          {rowExtra?.(style)}
          {(style.comment_count || 0) > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); onCommentClick(style); }}
              className="relative p-1 hover:bg-primary-50 rounded transition-colors"
              title={`${style.comment_count} comment${style.comment_count === 1 ? '' : 's'}`}
            >
              <MessageSquare className={cn('w-3.5 h-3.5', (style.unread_comment_count || 0) > 0 ? 'text-primary-500 fill-current' : 'text-gray-300')} />
              {(style.unread_comment_count || 0) > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[13px] h-3 px-0.5 bg-primary-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                  {style.unread_comment_count}
                </span>
              )}
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onStyleClick(style); }}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
            title="Open detail"
          >
            <Eye className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>
      </td>
    </tr>
  );
}
