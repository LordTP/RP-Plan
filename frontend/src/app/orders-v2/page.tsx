'use client';

import { useEffect, useState, useCallback, useMemo, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Search,
  Filter,
  RefreshCw,
  X,
  Download,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  ChevronRight,
  Loader2,
  Package,
  MessageSquare,
  Calendar,
  DollarSign,
  Hash,
  Truck,
  Clock,
  ArrowRight,
  Eye,
  Layers,
  Grid3X3,
  List,
  Ruler,
} from 'lucide-react';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/layout/AuthProvider';
import { CommentSidebar } from '@/components/orders/CommentSidebar';
import { ComponentsSection } from '@/components/orders/FactoryV2View';
import { StatusDropdown } from '@/components/orders/StatusDropdown';
import { InlineComments } from '@/components/orders/InlineComments';
import { DatePickerInput } from '@/components/ui/DatePickerInput';
import { HeroTile, SectionPill, SectionHeader, SectionDivider, SampleCard, BulkScopeProvider, InlineBulkScopeEditor, useBulkScope } from '@/components/orders/v2-detail-helpers';
import { StatusTile, Chip, Opt, TogglePill, Segmented, StatusBar, SortableTh, BulkBar } from '@/components/orders/v2-list-primitives';
import { useStore } from '@/store/useStore';
import { ordersApi, excelApi, statusesApi, submissionsApi, componentsApi, OrderFilters, type SampleSubmission, type SampleType, type RejectReason } from '@/lib/api';
import { RejectSampleModal } from '@/components/samples/RejectSampleModal';
import { useSizeGuide } from '@/lib/useSizeGuide';
import { ExportOrdersModal } from '@/components/orders/ExportOrdersModal';
import { cn } from '@/lib/utils';
import type { Order } from '@/types';
import { COLUMNS, FACTORY_PRODUCT_COLUMNS, FACTORY_SHIPPING_COLUMNS, FIT_SAMPLE_STATUS_OPTIONS, FIT_REQUIRED_OPTIONS, SAMPLE_STATUS_OPTIONS, SAMPLE_STATUS_FIELD_TO_TYPE } from '@/types';

// ─── Helpers ───────────────────────────────────────────────

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    return formatDistanceToNow(parseISO(dateStr), { addSuffix: true });
  } catch {
    return '';
  }
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return format(parseISO(dateStr), 'dd MMM yyyy');
  } catch {
    return dateStr;
  }
}

function formatCurrency(val: number | null | undefined): string {
  if (val == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}

function formatQty(val: number | null | undefined): string {
  if (val == null) return '—';
  return val.toLocaleString();
}

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

function getStatusStyle(status: string | undefined) {
  if (!status) return { bg: 'bg-gray-100', text: 'text-gray-500', dot: 'bg-gray-300' };
  return STATUS_COLORS[status] || { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' };
}

/** Raw hex for a status dot — the StatusTile takes a CSS colour rather
 *  than a Tailwind class because statuses are DB-driven, so the palette
 *  can't be resolved at build time from a static class map. */
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

function statusDotHex(status: string | undefined): string {
  if (!status) return '#d1d5db';
  return STATUS_DOT_HEX[status] || '#9ca3af';
}

/** Sample-lifecycle status styling. Separate from getStatusStyle, which
 *  colours ORDER status (In Production / Shipped / …) — these are the
 *  APPROVED / OUTSTANDING / LATE family and need their own semantics. */
const SAMPLE_STATUS_STYLE: Record<string, string> = {
  'APPROVED': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'RECEIVED': 'bg-blue-50 text-blue-700 border-blue-200',
  'OUTSTANDING': 'bg-amber-50 text-amber-700 border-amber-200',
  'LATE': 'bg-red-50 text-red-700 border-red-200',
  'REJECTED': 'bg-red-50 text-red-700 border-red-200',
  'NOT REQUIRED': 'bg-gray-100 text-gray-500 border-gray-200',
  'P23 ADVISE UPDATE': 'bg-orange-50 text-orange-700 border-orange-200',
};

function SampleStatusPill({ status }: { status: string | null | undefined }) {
  const s = (status || '').toUpperCase();
  if (!s) {
    return <span className="text-[10px] text-gray-300 italic">not set</span>;
  }
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

type ExFacWindow = '' | 'week' | '14' | '30' | 'overdue' | 'unset';

const EXFAC_WINDOW_LABEL: Record<ExFacWindow, string> = {
  '': 'Any time',
  week: 'Next 7 days',
  '14': 'Next 14 days',
  '30': 'Next 30 days',
  overdue: 'Overdue',
  unset: 'No date set',
};

/** The date a style is actually working to — revised wins over original,
 *  matching the rule used everywhere else in the app. */
function effectiveExFactory(order: Order): string | null {
  return order.revised_po_ex_factory || order.original_po_ex_factory || null;
}

/** One writable sample record inside a bulk selection. `kind` decides
 *  which endpoint the write goes to: component instances resolve their
 *  own column server-side, order-level styles go through the PO-scoped
 *  order endpoint. */
interface SampleTarget {
  key: string;            // 'c:<instanceId>' | 'o:<orderId>' — stable selection key
  kind: 'component' | 'order';
  id: number;             // instance id, or order id for order-level
  poNumber: string;
  customer: string;
  styleCode: string;
  componentName: string | null;
  currentStatus: string | null;
}

// ─── Table sorting ────────────────────────────────────────────────────

type SortKey = 'po' | 'style' | 'description' | 'colour' | 'status' | 'exfac' | 'qty' | 'value';

/** Comparable value for a style row under a given sort key. Strings come
 *  back lowercased so sorting is case-insensitive; nulls are normalised
 *  so blanks always sink to the bottom regardless of direction. */
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

function compareStyles(a: Order, b: Order, key: SortKey, dir: 'asc' | 'desc'): number {
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

function matchesExFacWindow(order: Order, w: ExFacWindow): boolean {
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

// ─── Types ─────────────────────────────────────────────────

interface POGroup {
  po_number: string;
  customer: string;
  factory: string;
  styles: Order[];
  totalQty: number;
  totalValue: number;
  statusSummary: string;
  latestDate: string | null;
  unreadComments: number;
  latestUpdate: string;
}

// ─── Page Entry ────────────────────────────────────────────

export default function OrdersV2Page() {
  return (
    <AuthProvider>
      <Suspense fallback={<OrdersLoading />}>
        <OrdersV2Content />
      </Suspense>
    </AuthProvider>
  );
}

function OrdersLoading() {
  return (
    <AppShell title="Orders" subtitle="v2">
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Loading orders...</p>
        </div>
      </div>
    </AppShell>
  );
}

// ─── Main Content ──────────────────────────────────────────

function OrdersV2Content() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { orders: storeOrders, setOrders: setStoreOrders, totalOrders: storeTotalOrders, user, setPage, setSelectedOrder, setSidebarOpen } = useStore();

  // Determine which view we're in
  const viewParam = searchParams.get('view');
  const isFactoryView = viewParam === 'factory-product' || viewParam === 'factory-shipping';

  // Deep-link params from dashboard warnings centre + activity feed
  const openStyleParam = searchParams.get('openStyle');
  const expandPOParam = searchParams.get('expandPO');
  const styleCodeParam = searchParams.get('style_code');

  // Use local state for factory views, global store for main orders
  const [localOrders, setLocalOrders] = useState<Order[]>([]);
  const [localTotal, setLocalTotal] = useState(0);
  const orders = isFactoryView ? localOrders : storeOrders;
  const totalOrders = isFactoryView ? localTotal : storeTotalOrders;

  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [statuses, setStatuses] = useState<string[]>([]);
  const [expandedPOs, setExpandedPOs] = useState<Set<string>>(new Set());
  const [selectedStyleId, setSelectedStyleId] = useState<number | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);

  // Chip filters (Sep 2026 list rework). These narrow the same working set
  // the status tiles filter, so a tile + a chip compose rather than fight.
  const [customerF, setCustomerF] = useState<string | null>(null);
  const [factoryF, setFactoryF] = useState<string | null>(null);
  const [exFacWindow, setExFacWindow] = useState<ExFacWindow>('');
  const [lateOnly, setLateOnly] = useState(false);
  const [missingDatesOnly, setMissingDatesOnly] = useState(false);

  // Table state. Grouping defaults ON so the view still reads PO-first
  // the way the card stack did; flipping it off gives a flat list that
  // sorts across every style regardless of PO.
  const [groupByPO, setGroupByPO] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('exfac');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // Anchor for shift-click range selection — the last row clicked without
  // shift held. Null until the user ticks something.
  const lastClickedId = useRef<number | null>(null);

  const toggleSort = useCallback((key: string) => {
    const k = key as SortKey;
    setSortKey((prev) => {
      if (prev === k) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      // New column starts ascending, except the numeric/value columns
      // where "biggest first" is almost always what you want.
      setSortDir(k === 'qty' || k === 'value' ? 'desc' : 'asc');
      return k;
    });
  }, []);

  const isSupplier = user?.role === 'supplier';
  const isDesigner = user?.role === 'sourcelab_designer';

  const viewTitle = viewParam === 'factory-product' ? 'Factory Product'
    : viewParam === 'factory-shipping' ? 'Factory Shipping'
    : 'Orders';
  const viewSubtitle = 'v2 Preview';

  // Load statuses
  useEffect(() => {
    statusesApi.getStatuses().then(res => setStatuses(res.statuses)).catch(console.error);
  }, []);

  // Load orders — get a big batch so we can group client-side
  const loadOrders = useCallback(async (filters?: OrderFilters) => {
    setIsLoading(true);
    try {
      // V2 groups POs client-side and lets users search across every order,
      // so we need the full working set on load — lazy load would silently
      // hide POs that match a search. Bumped once we crossed ~700 orders.
      const response = await ordersApi.getOrders(1, 5000, filters || {});
      if (isFactoryView) {
        setLocalOrders(response.orders);
        setLocalTotal(response.total);
      } else {
        setStoreOrders(response.orders, response.total);
        setPage(1);
      }
    } catch (error) {
      console.error('Failed to load orders:', error);
      toast.error('Failed to load orders');
    } finally {
      setIsLoading(false);
    }
  }, [isFactoryView, setStoreOrders, setPage]);

  useEffect(() => {
    loadOrders();
  }, []);

  // Handle deep-link from dashboard warnings centre + activity feed
  useEffect(() => {
    if (!orders.length) return;
    if (openStyleParam) {
      const id = parseInt(openStyleParam, 10);
      const found = orders.find(o => o.id === id);
      if (found) {
        setExpandedPOs(prev => new Set(prev).add(found.po_number));
        setSelectedStyleId(id);
      }
    } else if (styleCodeParam && expandPOParam) {
      // Activity feed → click a style chip: find by (po_number, style_code) and open it
      const found = orders.find(o => o.po_number === expandPOParam && o.style_code === styleCodeParam);
      if (found) {
        setExpandedPOs(prev => new Set(prev).add(found.po_number));
        setSelectedStyleId(found.id);
      } else {
        // PO match without the style still expands the PO card
        setExpandedPOs(prev => new Set(prev).add(expandPOParam));
        setTimeout(() => {
          const el = document.getElementById(`po-card-${expandPOParam}`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 200);
      }
    } else if (expandPOParam) {
      setExpandedPOs(prev => new Set(prev).add(expandPOParam));
      // Scroll to the PO card
      setTimeout(() => {
        const el = document.getElementById(`po-card-${expandPOParam}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 200);
    }
  }, [orders.length, openStyleParam, expandPOParam, styleCodeParam]);

  // Group orders by PO number
  const poGroups = useMemo(() => {
    let filtered = orders;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(o =>
        o.po_number?.toLowerCase().includes(q) ||
        o.customer?.toLowerCase().includes(q) ||
        o.style_code?.toLowerCase().includes(q) ||
        o.factory?.toLowerCase().includes(q) ||
        o.description?.toLowerCase().includes(q) ||
        o.colour?.toLowerCase().includes(q) ||
        o.china_orderbook_ref?.toLowerCase().includes(q)
      );
    }

    // Status filter — 'open' hides shipped/done lines so mixed POs still
    // appear in Open (their non-shipped lines form the group). 'shipped'
    // is the counterpart chip. 'all' is unreachable from the UI but kept
    // as a defensive escape hatch.
    const TERMINAL_STATUSES = new Set(['Shipped', 'Delivered', 'Complete', 'Completed', 'Cancelled']);
    if (statusFilter === 'open') {
      filtered = filtered.filter(o => !TERMINAL_STATUSES.has(o.status || ''));
    } else if (statusFilter === 'shipped') {
      filtered = filtered.filter(o => o.status === 'Shipped');
    } else if (statusFilter !== 'all') {
      filtered = filtered.filter(o => o.status === statusFilter);
    }

    // Chip filters — applied at the LINE level so a PO only survives if
    // it still has at least one matching style. Keeps mixed POs visible
    // when part of the PO matches, same principle as the 'open' filter.
    if (customerF) filtered = filtered.filter(o => (o.customer || '') === customerF);
    if (factoryF) filtered = filtered.filter(o => (o.factory || '') === factoryF);
    if (exFacWindow) filtered = filtered.filter(o => matchesExFacWindow(o, exFacWindow));
    if (lateOnly) filtered = filtered.filter(o => !!o.is_late);
    if (missingDatesOnly) filtered = filtered.filter(o => !effectiveExFactory(o));

    // Group by PO
    const groups: Record<string, POGroup> = {};
    for (const order of filtered) {
      const po = order.po_number;
      if (!groups[po]) {
        groups[po] = {
          po_number: po,
          customer: order.customer || '',
          factory: order.factory || '',
          styles: [],
          totalQty: 0,
          totalValue: 0,
          statusSummary: '',
          latestDate: null,
          unreadComments: 0,
          latestUpdate: order.updated_at,
        };
      }
      groups[po].styles.push(order);
      groups[po].totalQty += order.total_quantity || 0;
      groups[po].totalValue += order.total_order_value || 0;
      groups[po].unreadComments += order.unread_comment_count || 0;
      if (order.updated_at > groups[po].latestUpdate) {
        groups[po].latestUpdate = order.updated_at;
      }

      // Ex-factory date for THIS style — revised wins over original.
      // We store the EARLIEST across the PO's styles so the sort picks
      // up the most urgent one; the field name stays `latestDate` for
      // minimal blast radius, but semantically it's now "earliest".
      const exFactory = order.revised_po_ex_factory || order.original_po_ex_factory;
      if (exFactory && (!groups[po].latestDate || exFactory < groups[po].latestDate)) {
        groups[po].latestDate = exFactory;
      }
    }

    // Compute status summary for each group
    for (const group of Object.values(groups)) {
      const statusCounts: Record<string, number> = {};
      for (const s of group.styles) {
        const st = s.status || 'Unknown';
        statusCounts[st] = (statusCounts[st] || 0) + 1;
      }
      const entries = Object.entries(statusCounts).sort((a, b) => b[1] - a[1]);
      if (entries.length === 1) {
        group.statusSummary = entries[0][0];
      } else {
        group.statusSummary = entries[0][0]; // Most common
      }
    }

    // Sort: earliest ex-factory first (soonest = most urgent). POs with
    // no ex-factory sink to the bottom, broken ties by most recent update.
    return Object.values(groups).sort((a, b) => {
      if (a.latestDate && b.latestDate) return a.latestDate.localeCompare(b.latestDate);
      if (a.latestDate && !b.latestDate) return -1;
      if (!a.latestDate && b.latestDate) return 1;
      return b.latestUpdate.localeCompare(a.latestUpdate);
    });
  }, [orders, searchQuery, statusFilter, customerF, factoryF, exFacWindow, lateOnly, missingDatesOnly]);

  // Status counts for chips
  const statusCounts = useMemo(() => {
    // Count unique POs per status, not individual lines. 'open' and
    // 'shipped' are synthetic buckets driving the top-level chips.
    const TERMINAL_STATUSES = new Set(['Shipped', 'Delivered', 'Complete', 'Completed', 'Cancelled']);
    const posByStatus: Record<string, Set<string>> = { all: new Set(), open: new Set(), shipped: new Set() };
    for (const o of orders) {
      posByStatus.all.add(o.po_number);
      const s = o.status || 'Unknown';
      if (!posByStatus[s]) posByStatus[s] = new Set();
      posByStatus[s].add(o.po_number);
      if (!TERMINAL_STATUSES.has(o.status || '')) posByStatus.open.add(o.po_number);
      if (o.status === 'Shipped') posByStatus.shipped.add(o.po_number);
    }
    const counts: Record<string, number> = {};
    for (const [k, v] of Object.entries(posByStatus)) {
      counts[k] = v.size;
    }
    return counts;
  }, [orders]);

  // ─── Status tiles ───────────────────────────────────────────────────
  // One tile per status that actually has rows, plus a Late tile. Each
  // carries a PO count (the headline number) and a units/value secondary
  // line. Computed off the UNFILTERED working set so the tiles keep
  // showing the whole picture while you drill into one of them — the
  // thing that makes them usable as navigation rather than just readouts.
  const statusTiles = useMemo(() => {
    const byStatus = new Map<string, { pos: Set<string>; units: number; value: number }>();
    for (const o of orders) {
      const s = o.status || 'Unknown';
      let e = byStatus.get(s);
      if (!e) { e = { pos: new Set(), units: 0, value: 0 }; byStatus.set(s, e); }
      e.pos.add(o.po_number);
      e.units += o.total_quantity || 0;
      e.value += o.total_order_value || 0;
    }
    return Array.from(byStatus.entries())
      .map(([status, e]) => ({ status, poCount: e.pos.size, units: e.units, value: e.value }))
      .sort((a, b) => b.poCount - a.poCount);
  }, [orders]);

  const lateTile = useMemo(() => {
    const pos = new Set<string>();
    let units = 0;
    let value = 0;
    for (const o of orders) {
      if (!o.is_late) continue;
      pos.add(o.po_number);
      units += o.total_quantity || 0;
      value += o.total_order_value || 0;
    }
    return { poCount: pos.size, units, value };
  }, [orders]);

  // ─── Chip option lists ──────────────────────────────────────────────
  // Counts are PO-level so they line up with what the tiles report.
  const customerOpts = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const o of orders) {
      const c = o.customer || '';
      if (!c) continue;
      if (!m.has(c)) m.set(c, new Set());
      m.get(c)!.add(o.po_number);
    }
    return Array.from(m.entries())
      .map(([v, pos]) => [v, pos.size] as [string, number])
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [orders]);

  const factoryOpts = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const o of orders) {
      const f = o.factory || '';
      if (!f) continue;
      if (!m.has(f)) m.set(f, new Set());
      m.get(f)!.add(o.po_number);
    }
    return Array.from(m.entries())
      .map(([v, pos]) => [v, pos.size] as [string, number])
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [orders]);

  const anyFilter = !!(customerF || factoryF || exFacWindow || lateOnly || missingDatesOnly || searchQuery.trim());

  const clearFilters = () => {
    setCustomerF(null);
    setFactoryF(null);
    setExFacWindow('');
    setLateOnly(false);
    setMissingDatesOnly(false);
    setSearchQuery('');
  };

  // Totals across whatever's currently visible — drives the status bar.
  const visibleTotals = useMemo(() => {
    let styles = 0, units = 0, value = 0;
    for (const g of poGroups) {
      styles += g.styles.length;
      units += g.totalQty;
      value += g.totalValue;
    }
    return { pos: poGroups.length, styles, units, value };
  }, [poGroups]);

  // ─── Sorting ────────────────────────────────────────────────────────
  // Grouped mode sorts the GROUPS by their aggregate for the active key
  // and the styles within each group by the same key, so clicking a
  // column reorders both levels coherently. Flat mode just sorts every
  // style across every PO.
  const sortedGroups = useMemo(() => {
    const groupAggregate = (g: POGroup): string | number | null => {
      switch (sortKey) {
        case 'po': return g.po_number.toLowerCase();
        case 'status': return (g.statusSummary || '').toLowerCase();
        case 'exfac': return g.latestDate;
        case 'qty': return g.totalQty;
        case 'value': return g.totalValue;
        // style / description / colour have no meaningful group-level
        // aggregate — fall back to the earliest ex-factory so groups keep
        // a stable, sensible order while the styles inside them re-sort.
        default: return g.latestDate;
      }
    };

    const withSortedStyles = poGroups.map((g) => ({
      ...g,
      styles: [...g.styles].sort((a, b) => compareStyles(a, b, sortKey, sortDir)),
    }));

    return withSortedStyles.sort((a, b) => {
      const av = groupAggregate(a);
      const bv = groupAggregate(b);
      const aEmpty = av === null || av === '';
      const bEmpty = bv === null || bv === '';
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [poGroups, sortKey, sortDir]);

  const flatRows = useMemo(
    () => poGroups.flatMap(g => g.styles).sort((a, b) => compareStyles(a, b, sortKey, sortDir)),
    [poGroups, sortKey, sortDir],
  );

  // ─── Row selection ──────────────────────────────────────────────────
  // Rows visible for selection purposes: in grouped mode only styles
  // inside an EXPANDED group can be range-selected, because shift-click
  // ranges have to follow what's actually on screen.
  const selectableRows = useMemo(() => {
    if (!groupByPO) return flatRows;
    return sortedGroups.flatMap(g => expandedPOs.has(g.po_number) ? g.styles : []);
  }, [groupByPO, flatRows, sortedGroups, expandedPOs]);

  const toggleRow = useCallback((order: Order, shiftKey: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const anchor = lastClickedId.current;

      // Shift-click extends from the last plain click to here, matching
      // the rendered row order rather than id order.
      if (shiftKey && anchor != null && anchor !== order.id) {
        const ids = selectableRows.map(r => r.id);
        const from = ids.indexOf(anchor);
        const to = ids.indexOf(order.id);
        if (from !== -1 && to !== -1) {
          const [lo, hi] = from < to ? [from, to] : [to, from];
          // Range takes the state we're moving the clicked row INTO, so a
          // shift-click on a ticked row clears the range instead of
          // stubbornly re-ticking it.
          const turningOn = !next.has(order.id);
          for (let i = lo; i <= hi; i++) {
            if (turningOn) next.add(ids[i]);
            else next.delete(ids[i]);
          }
          return next;
        }
      }

      if (next.has(order.id)) next.delete(order.id);
      else next.add(order.id);
      lastClickedId.current = order.id;
      return next;
    });
  }, [selectableRows]);

  const toggleGroup = useCallback((group: POGroup) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allOn = group.styles.every(s => next.has(s.id));
      for (const s of group.styles) {
        if (allOn) next.delete(s.id);
        else next.add(s.id);
      }
      return next;
    });
  }, []);

  const allVisibleIds = useMemo(() => poGroups.flatMap(g => g.styles.map(s => s.id)), [poGroups]);

  const toggleAllVisible = useCallback((checked: boolean) => {
    setSelectedIds(checked ? new Set(allVisibleIds) : new Set());
    lastClickedId.current = null;
  }, [allVisibleIds]);

  const allVisibleSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => selectedIds.has(id));

  // Drop any selection that's been filtered out from under the user —
  // otherwise a bulk action could hit rows they can no longer see.
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(allVisibleIds);
      let changed = false;
      const next = new Set<number>();
      // Array.from rather than for-of: tsconfig targets ES5 here, so
      // iterating a Set directly needs downlevelIteration.
      Array.from(prev).forEach((id) => {
        if (visible.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [allVisibleIds]);

  const selectedOrders = useMemo(
    () => orders.filter(o => selectedIds.has(o.id)),
    [orders, selectedIds],
  );

  // ─── Bulk actions ───────────────────────────────────────────────────
  // Both supported actions route through /api/orders/bulk-update-date,
  // which is PO-scoped — so a selection spanning multiple POs fans out
  // into one call per PO. Suppliers hitting a DATE field go down the
  // backend's pending-approval path and must supply a reason; sample
  // statuses are Sourcelab's call, so that action is internal-only.
  const [bulkPanel, setBulkPanel] = useState<'date' | 'sample' | 'fitreq' | null>(null);
  const [bulkDate, setBulkDate] = useState('');
  const [bulkSampleField, setBulkSampleField] = useState('strike_off_status');
  const [bulkSampleValue, setBulkSampleValue] = useState('');
  const [bulkReason, setBulkReason] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  /** Which lifecycle field the sample panel writes — the status column,
   *  or one of the two dates. Dates matter because a batch physically
   *  lands on one day; typing that date per style is the tedium this is
   *  meant to kill. */
  const [bulkSampleMode, setBulkSampleMode] = useState<'status' | 'received' | 'approved'>('status');
  const [bulkSampleDate, setBulkSampleDate] = useState('');
  const [bulkRejectReason, setBulkRejectReason] = useState('');
  const [bulkRejectNotes, setBulkRejectNotes] = useState('');
  const [rejectReasons, setRejectReasons] = useState<RejectReason[]>([]);
  const [bulkFitRequired, setBulkFitRequired] = useState('');

  const isBulkRejecting = bulkSampleMode === 'status' && bulkSampleValue === 'REJECTED';

  // Reason taxonomy loads lazily the first time REJECTED is picked.
  useEffect(() => {
    if (!isBulkRejecting || rejectReasons.length > 0) return;
    submissionsApi.getRejectReasons()
      .then(r => setRejectReasons(r.reasons))
      .catch(() => { /* submit stays blocked by the empty-reason guard */ });
  }, [isBulkRejecting, rejectReasons.length]);
  /** Which targets the sample-status write lands on — component names,
   *  plus the ORDER_LEVEL sentinel for styles that track this sample at
   *  order level. */
  const [bulkSampleTargets, setBulkSampleTargets] = useState<Set<string>>(new Set());

  // Strike Off and Lab Dip move INSIDE components when a style has them —
  // the order-level column is left blank in that case (see the export's
  // _COMPONENT_ROLLUP_FIELDS). Fit Sample and PPS are whole-garment
  // concerns and always stay at order level. So only these two sample
  // types ever need a component picker.
  const COMPONENT_BACKED_SAMPLE: Record<string, 'strike_off' | 'lab_dip'> = {
    strike_off_status: 'strike_off',
    lab_dip_status: 'lab_dip',
  };

  // Expand the selection into the ACTUAL sample records that will be
  // written — one target per component instance for component-backed
  // sample types, one per style otherwise. Without this the bulk write
  // would land on the order-level column for component styles, a field
  // that's blank by design and read by nothing.
  const sampleTargets = useMemo((): SampleTarget[] => {
    const compType = COMPONENT_BACKED_SAMPLE[bulkSampleField];
    const out: SampleTarget[] = [];
    for (const o of selectedOrders) {
      const comps = compType ? (o.components || []).filter(c => c.sample_type === compType) : [];
      if (comps.length > 0) {
        for (const c of comps) {
          out.push({
            key: `c:${c.id}`,
            kind: 'component',
            id: c.id,
            poNumber: o.po_number,
            customer: o.customer || '',
            styleCode: o.style_code || `#${o.id}`,
            componentName: c.name,
            currentStatus: (c as any)[bulkSampleField] ?? null,
          });
        }
      } else {
        out.push({
          key: `o:${o.id}`,
          kind: 'order',
          id: o.id,
          poNumber: o.po_number,
          customer: o.customer || '',
          styleCode: o.style_code || `#${o.id}`,
          componentName: null,
          currentStatus: (o as any)[bulkSampleField] ?? null,
        });
      }
    }
    return out;
  }, [selectedOrders, bulkSampleField]);

  // Grouped by PO for display — merch read the world PO-first, so a flat
  // list of 40 instances across 6 POs is much harder to audit than the
  // same 40 nested under their PO headers.
  const sampleTargetGroups = useMemo(() => {
    const m = new Map<string, { poNumber: string; customer: string; targets: SampleTarget[] }>();
    for (const t of sampleTargets) {
      let g = m.get(t.poNumber);
      if (!g) { g = { poNumber: t.poNumber, customer: t.customer, targets: [] }; m.set(t.poNumber, g); }
      g.targets.push(t);
    }
    return Array.from(m.values())
      .map(g => ({
        ...g,
        targets: g.targets.sort((a, b) =>
          a.styleCode.localeCompare(b.styleCode) || (a.componentName || '').localeCompare(b.componentName || ''),
        ),
      }))
      .sort((a, b) => a.poNumber.localeCompare(b.poNumber));
  }, [sampleTargets]);

  // Default every target on whenever the set changes — picking a sample
  // type shouldn't leave the user with nothing ticked.
  useEffect(() => {
    setBulkSampleTargets(new Set(sampleTargets.map(t => t.key)));
  }, [sampleTargets]);

  const bulkSampleTargetCount = useMemo(
    () => sampleTargets.filter(t => bulkSampleTargets.has(t.key)).length,
    [sampleTargets, bulkSampleTargets],
  );

  const closeBulkPanel = () => {
    setBulkPanel(null);
    setBulkDate('');
    setBulkSampleValue('');
    setBulkSampleDate('');
    setBulkSampleMode('status');
    setBulkRejectReason('');
    setBulkRejectNotes('');
    setBulkFitRequired('');
    setBulkReason('');
  };

  /** Sample-status writes fan out to TWO different endpoints depending on
   *  where each target actually stores the value: component instances go
   *  through the components bulk-edit (which resolves the right column
   *  from each instance's own sample_type), order-level styles go through
   *  the PO-scoped order bulk endpoint. */
  const applyBulkSample = async () => {
    const writingDate = bulkSampleMode !== 'status';
    const value = writingDate ? bulkSampleDate : bulkSampleValue;
    if (!value || bulkSampleTargetCount === 0) return;
    if (isBulkRejecting && !bulkRejectReason) return;

    setBulkSaving(true);
    try {
      let changed = 0;

      const chosen = sampleTargets.filter(t => bulkSampleTargets.has(t.key));
      const instanceIds = chosen.filter(t => t.kind === 'component').map(t => t.id);
      const orderTargets = chosen.filter(t => t.kind === 'order');

      // The order-level column this write lands on. Component instances
      // don't need it — the components endpoint resolves the column from
      // each instance's own sample_type.
      const samplePrefix = bulkSampleField.replace('_status', '');
      const orderField = writingDate ? `${samplePrefix}_${bulkSampleMode}` : bulkSampleField;

      if (instanceIds.length > 0) {
        const payload: any = { instance_ids: instanceIds };
        if (writingDate) payload[bulkSampleMode] = value;
        else {
          payload.status = value;
          // REJECTED is a lifecycle event — the endpoint dispatches each
          // instance through _reject_one_target (closes the attempt, opens
          // v+1, clears dates), which needs a structured reason.
          if (isBulkRejecting) {
            payload.reason = bulkRejectReason;
            if (bulkRejectNotes.trim()) payload.notes = bulkRejectNotes.trim();
          }
        }
        const res = await componentsApi.bulkEditInstances(payload);
        changed += res.changed_count;
      }

      if (orderTargets.length > 0) {
        const byPo = new Map<string, number[]>();
        for (const t of orderTargets) {
          const arr = byPo.get(t.poNumber) || [];
          arr.push(t.id);
          byPo.set(t.poNumber, arr);
        }
        for (const [po, ids] of Array.from(byPo.entries())) {
          const res: any = await ordersApi.bulkUpdateDate(po, orderField, value, ids);
          changed += res?.orders_updated ?? 0;
        }
      }

      // Optimistic patch — order-level styles get the column written,
      // component styles get the matching nested instances updated so the
      // drawer and any component summary reflect it without a refetch.
      // Rejections are the exception: the server clears dates and rolls
      // the attempt number, so a naive local patch would lie. Refetch
      // those instead.
      if (isBulkRejecting) {
        await loadOrders();
      } else {
        const touchedInstances = new Set(instanceIds);
        const touchedOrderIds = new Set(orderTargets.map(t => t.id));
        const compType = COMPONENT_BACKED_SAMPLE[bulkSampleField];
        const instanceField = writingDate ? `${samplePrefix}_${bulkSampleMode}` : bulkSampleField;
        const patch = (o: Order): Order => {
          let next = o;
          if (touchedOrderIds.has(o.id)) {
            next = { ...next, [orderField]: value } as Order;
          }
          if (compType && next.components?.some(c => touchedInstances.has(c.id))) {
            next = {
              ...next,
              components: next.components.map(c =>
                touchedInstances.has(c.id) ? { ...c, [instanceField]: value } : c,
              ),
            } as Order;
          }
          return next;
        };
        if (isFactoryView) setLocalOrders(prev => prev.map(patch));
        else setStoreOrders(orders.map(patch), totalOrders);
      }

      toast.success(
        isBulkRejecting
          ? `Rejected ${changed} sample${changed === 1 ? '' : 's'} — v+1 opened OUTSTANDING`
          : `Updated ${changed} sample${changed === 1 ? '' : 's'}`,
      );
      setSelectedIds(new Set());
      lastClickedId.current = null;
      closeBulkPanel();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Bulk update failed');
    } finally {
      setBulkSaving(false);
    }
  };

  /** Export exactly the ticked styles. Deliberately NOT the export modal,
   *  which works PO-at-a-time — a chase list of 9 specific styles across
   *  4 POs shouldn't come back as every style on those 4 POs. */
  const exportSelection = async () => {
    if (selectedIds.size === 0) return;
    setBulkSaving(true);
    try {
      const blob = await excelApi.exportExcel({ order_ids: Array.from(selectedIds) });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${isSupplier ? 'factory' : 'orderbook'}_selection_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Exported ${selectedIds.size} style${selectedIds.size === 1 ? '' : 's'}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Export failed');
    } finally {
      setBulkSaving(false);
    }
  };

  const applyBulk = async (field: string, value: string | null) => {
    if (selectedOrders.length === 0) return;
    setBulkSaving(true);
    try {
      const byPo = new Map<string, number[]>();
      for (const o of selectedOrders) {
        const arr = byPo.get(o.po_number) || [];
        arr.push(o.id);
        byPo.set(o.po_number, arr);
      }

      let updated = 0;
      let pending = 0;
      for (const [po, ids] of Array.from(byPo.entries())) {
        const res: any = await ordersApi.bulkUpdateDate(
          po,
          field,
          value,
          ids,
          isSupplier ? bulkReason.trim() : undefined,
        );
        if (res?.pending_approval) pending += res.pending_count ?? ids.length;
        else updated += res?.orders_updated ?? 0;
      }

      if (pending > 0) {
        toast.success(`${pending} date change${pending === 1 ? '' : 's'} submitted for approval`);
      } else {
        // Optimistic patch so the table reflects the change straight away
        // — same no-refetch principle as the /orders bulk save.
        const touched = new Set(selectedIds);
        const patch = (o: Order) => (touched.has(o.id) ? { ...o, [field]: value } as Order : o);
        if (isFactoryView) setLocalOrders(prev => prev.map(patch));
        else setStoreOrders(orders.map(patch), totalOrders);
        toast.success(`Updated ${updated} style${updated === 1 ? '' : 's'}`);
      }

      setSelectedIds(new Set());
      lastClickedId.current = null;
      closeBulkPanel();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Bulk update failed');
    } finally {
      setBulkSaving(false);
    }
  };

  const togglePO = (po: string) => {
    setExpandedPOs(prev => {
      const next = new Set(prev);
      if (next.has(po)) next.delete(po);
      else next.add(po);
      return next;
    });
  };

  const handleStyleClick = (order: Order) => {
    setSelectedStyleId(order.id);
  };

  const [openOnComments, setOpenOnComments] = useState(false);

  const handleCommentClick = (order: Order) => {
    setOpenOnComments(true);
    setSelectedStyleId(order.id);
    // Mark as read and clear badge immediately
    if (order.unread_comment_count && order.unread_comment_count > 0) {
      const updated = { ...order, unread_comment_count: 0 };
      if (isFactoryView) {
        setLocalOrders(prev => prev.map(o => o.id === order.id ? updated : o));
      } else {
        setStoreOrders(orders.map(o => o.id === order.id ? updated : o), totalOrders);
      }
    }
    ordersApi.markCommentsRead(order.id).catch(console.error);
  };

  const selectedStyle = useMemo(() => {
    if (!selectedStyleId) return null;
    return orders.find(o => o.id === selectedStyleId) || null;
  }, [selectedStyleId, orders]);

  // ─── Drawer open/close ──────────────────────────────────────────────
  // The drawer stays mounted through its slide-out so the transition
  // actually plays — `drawerClosing` drives the transform, and the real
  // unmount happens after the animation window. Matches the duration on
  // the drawer's transition-transform class; if one changes, change both.
  const DRAWER_ANIM_MS = 300;
  const [drawerClosing, setDrawerClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const closeDrawer = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setDrawerClosing(true);
    closeTimer.current = setTimeout(() => {
      setSelectedStyleId(null);
      setOpenOnComments(false);
      setDrawerClosing(false);
      closeTimer.current = null;
    }, DRAWER_ANIM_MS);
  }, []);

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  // Flat style list in the order they're rendered — drives the drawer's
  // prev/next so paging through styles follows what's on screen rather
  // than raw id order.
  const flatStyles = useMemo(() => poGroups.flatMap(g => g.styles), [poGroups]);

  const { prevStyle, nextStyle } = useMemo(() => {
    if (selectedStyleId == null) return { prevStyle: null, nextStyle: null };
    const i = flatStyles.findIndex(s => s.id === selectedStyleId);
    if (i === -1) return { prevStyle: null, nextStyle: null };
    return {
      prevStyle: i > 0 ? flatStyles[i - 1] : null,
      nextStyle: i < flatStyles.length - 1 ? flatStyles[i + 1] : null,
    };
  }, [flatStyles, selectedStyleId]);

  const handleRefresh = () => {
    loadOrders();
    toast.success('Orders refreshed');
  };

  const handleDetailSave = async (orderId: number, field: string, value: any) => {
    // Sentinel used by the reject-sample flow to force a fresh fetch of the
    // order row after the rejection mutation has happened out-of-band. No
    // actual field change is in play.
    if (field === '__refresh__') {
      try {
        const fresh = await ordersApi.getOrder(orderId);
        if (isFactoryView) {
          setLocalOrders(prev => prev.map(o => o.id === fresh.id ? fresh : o));
        } else {
          setStoreOrders([...orders.map(o => o.id === fresh.id ? fresh : o)], totalOrders);
        }
      } catch {
        // Silent — stale state is fine if the refetch hiccups.
      }
      return;
    }

    try {
      const result = await ordersApi.updateOrder(orderId, { [field]: value });
      if (result && typeof result === 'object' && 'pending_approval' in result && result.pending_approval) {
        toast.success(result.message || 'Date change submitted for approval');
      } else {
        const updatedOrder = result as Order;
        if (isFactoryView) {
          setLocalOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
        } else {
          setStoreOrders([...orders.map(o => o.id === updatedOrder.id ? updatedOrder : o)], totalOrders);
        }
        toast.success('Updated successfully');
      }
    } catch (error: any) {
      const msg = error?.response?.data?.detail || 'Failed to update';
      toast.error(msg);
    }
  };

  return (
    <AppShell title={viewTitle} subtitle={viewSubtitle}>
      <div className="flex gap-6 overflow-hidden" style={{ height: 'calc(100vh - 116px)' }}>

        {/* ─── Order List ─── */}
        <div className="flex flex-col min-w-0 w-full">

          {/* Search + Actions */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search PO, customer, style, factory..."
                className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 placeholder:text-gray-400 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
              Refresh
            </button>

            <button
              onClick={() => setShowExportModal(true)}
              className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export
            </button>

            {/* Link to classic/table view */}
            <button
              onClick={() => router.push(
                viewParam === 'factory-product' ? '/factory-product'
                : viewParam === 'factory-shipping' ? '/factory-shipping'
                : '/orders'
              )}
              className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <Grid3X3 className="w-4 h-4" />
              Table View
            </button>
          </div>

          {/* Status tiles — KPI cards that double as the status filter.
              Counts are PO-level and computed off the unfiltered set, so
              the row keeps showing the whole picture while you're drilled
              into one of them. */}
          <div
            className="grid gap-2 mb-3 shrink-0"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}
          >
            <StatusTile
              label="Open orders"
              count={statusCounts.open || 0}
              secondary={`${poGroups.length} shown`}
              active={statusFilter === 'open' && !lateOnly}
              onClick={() => { setStatusFilter('open'); setLateOnly(false); }}
            />
            {statusTiles.map(({ status, poCount, units, value }) => (
              <StatusTile
                key={status}
                label={status}
                dotColor={statusDotHex(status)}
                count={poCount}
                secondary={
                  isDesigner
                    ? `${units.toLocaleString()} units`
                    : `${units.toLocaleString()} units · ${formatCurrency(value)}`
                }
                active={statusFilter === status && !lateOnly}
                onClick={() => {
                  setStatusFilter(statusFilter === status ? 'open' : status);
                  setLateOnly(false);
                }}
              />
            ))}
            {lateTile.poCount > 0 && (
              <StatusTile
                label="Late"
                dotColor="#dc2626"
                tone="danger"
                count={lateTile.poCount}
                secondary={
                  isDesigner
                    ? `${lateTile.units.toLocaleString()} units`
                    : `${lateTile.units.toLocaleString()} units · ${formatCurrency(lateTile.value)}`
                }
                active={lateOnly}
                onClick={() => { setLateOnly(v => !v); setStatusFilter('open'); }}
              />
            )}
          </div>

          {/* Filter chips */}
          <div className="flex items-center gap-1.5 flex-wrap mb-3 shrink-0">
            <Chip
              label="Customer"
              active={!!customerF}
              valueText={customerF}
              onClear={() => setCustomerF(null)}
            >
              {(close) => (
                <>
                  <Opt label="All customers" on={!customerF} onClick={() => { setCustomerF(null); close(); }} />
                  {customerOpts.map(([v, n]) => (
                    <Opt key={v} label={v} count={n} on={customerF === v} onClick={() => { setCustomerF(v); close(); }} />
                  ))}
                </>
              )}
            </Chip>

            {!isSupplier && (
              <Chip
                label="Factory"
                active={!!factoryF}
                valueText={factoryF}
                onClear={() => setFactoryF(null)}
              >
                {(close) => (
                  <>
                    <Opt label="All factories" on={!factoryF} onClick={() => { setFactoryF(null); close(); }} />
                    {factoryOpts.map(([v, n]) => (
                      <Opt key={v} label={v} count={n} on={factoryF === v} onClick={() => { setFactoryF(v); close(); }} />
                    ))}
                  </>
                )}
              </Chip>
            )}

            <Chip
              label="Ex-factory"
              active={!!exFacWindow}
              valueText={exFacWindow ? EXFAC_WINDOW_LABEL[exFacWindow] : null}
              onClear={() => setExFacWindow('')}
            >
              {(close) => (
                <>
                  {(['', 'week', '14', '30', 'overdue', 'unset'] as ExFacWindow[]).map((w) => (
                    <Opt
                      key={w || 'any'}
                      label={EXFAC_WINDOW_LABEL[w]}
                      on={exFacWindow === w}
                      onClick={() => { setExFacWindow(w); close(); }}
                    />
                  ))}
                </>
              )}
            </Chip>

            <span className="w-px h-4 bg-gray-200 mx-1" />

            <TogglePill
              on={missingDatesOnly}
              label="Missing dates"
              title="Styles with no ex-factory date set"
              tone="warn"
              onClick={() => setMissingDatesOnly(v => !v)}
            />

            {anyFilter && (
              <button onClick={clearFilters} className="text-xs text-gray-500 hover:text-gray-800 px-2">
                Clear all
              </button>
            )}

            <div className="flex-1" />

            <TogglePill
              on={groupByPO}
              label="Group by PO"
              title="Group styles under their PO, or show one flat sortable list"
              onClick={() => setGroupByPO(v => !v)}
            />

            {groupByPO && poGroups.length > 0 && (
              <button
                onClick={() => setExpandedPOs(prev =>
                  prev.size ? new Set() : new Set(poGroups.map(g => g.po_number))
                )}
                className="text-[11px] text-gray-500 hover:text-gray-800 px-1.5"
              >
                {expandedPOs.size ? 'Collapse all' : 'Expand all'}
              </button>
            )}

            <Segmented
              options={[
                { value: 'open', label: 'Open' },
                { value: 'all', label: 'All' },
                { value: 'shipped', label: 'Shipped' },
              ] as const}
              value={(statusFilter === 'open' || statusFilter === 'all' || statusFilter === 'shipped') ? statusFilter : 'all'}
              onChange={(v) => { setStatusFilter(v); setLateOnly(false); }}
            />
          </div>

          {/* Order table — contained in a card so the list reads as a
              deliberate surface rather than bleeding to the page edge,
              with the mono status bar closing it off underneath. */}
          <div className="flex-1 min-h-0 overflow-auto bg-white border border-gray-200 rounded-t-xl">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <div className="w-10 h-10 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-sm text-gray-500">Loading orders...</p>
                </div>
              </div>
            ) : poGroups.length === 0 ? (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-500">No orders found</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {anyFilter ? 'Try clearing a filter above.' : 'Nothing in this view.'}
                  </p>
                </div>
              </div>
            ) : (
              <OrderTableV2
                groups={sortedGroups}
                flatRows={flatRows}
                groupByPO={groupByPO}
                expandedPOs={expandedPOs}
                onTogglePO={togglePO}
                onStyleClick={handleStyleClick}
                onCommentClick={handleCommentClick}
                selectedStyleId={selectedStyleId}
                selectedIds={selectedIds}
                onToggleRow={toggleRow}
                onToggleGroup={toggleGroup}
                onToggleAll={toggleAllVisible}
                allVisibleSelected={allVisibleSelected}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={toggleSort}
                isSupplier={isSupplier}
                isDesigner={isDesigner}
              />
            )}
          </div>

          <StatusBar
            segments={[
              `${visibleTotals.pos} of ${statusCounts.all || 0} POs`,
              `${visibleTotals.styles} styles · ${visibleTotals.units.toLocaleString()} units`,
              isDesigner ? null : formatCurrency(visibleTotals.value),
            ]}
            hint={groupByPO
              ? 'click a PO to expand · click a style to open detail · shift-click to select a range'
              : 'click a row to open detail · tick to select · shift-click for a range'}
          />
        </div>

        {/* ─── Right: Detail Panel ─── */}
        {selectedStyle && (
          <DetailPanel
            order={selectedStyle}
            onClose={closeDrawer}
            closing={drawerClosing}
            onPrev={prevStyle ? () => setSelectedStyleId(prevStyle.id) : null}
            onNext={nextStyle ? () => setSelectedStyleId(nextStyle.id) : null}
            onCommentClick={() => handleCommentClick(selectedStyle)}
            isSupplier={isSupplier}
            isDesigner={isDesigner}
            view={viewParam}
            onSave={handleDetailSave}
            initialTab={openOnComments ? 'comments' : 'details'}
            onCommentCountChange={(orderId, commentCount, unreadCount) => {
              const updateOrder = (o: Order) => o.id === orderId ? { ...o, comment_count: commentCount, unread_comment_count: unreadCount } : o;
              if (isFactoryView) {
                setLocalOrders(prev => prev.map(updateOrder));
              } else {
                setStoreOrders(orders.map(updateOrder), totalOrders);
              }
            }}
          />
        )}
      </div>

      {/* Floating bulk bar — slides up whenever rows are ticked. Action
          panels expand ABOVE the bar so the bar itself stays a stable
          anchor while you fill one in. */}
      <div
        className={cn(
          'fixed left-1/2 -translate-x-1/2 bottom-6 z-40 transition-all duration-200',
          selectedIds.size > 0 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none',
        )}
      >
        {bulkPanel === 'date' && (
          <div className="mb-2 bg-white border border-gray-200 rounded-xl shadow-xl w-[min(92vw,560px)] overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-gray-900">Set revised ex-factory date</p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {isSupplier
                    ? `Submits a date-change request on ${selectedIds.size} style${selectedIds.size === 1 ? '' : 's'} for Sourcelab to approve. Nothing changes until they do.`
                    : `Overwrites Revised Ex-Factory on ${selectedIds.size} selected style${selectedIds.size === 1 ? '' : 's'}. ETA UK / ETA Customer recalculate from it.`}
                </p>
              </div>
              <button onClick={closeBulkPanel} className="text-gray-400 hover:text-gray-700 p-0.5 shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="px-3 py-2.5 flex items-center gap-2 text-xs flex-wrap">
              <input
                type="date"
                value={bulkDate}
                onChange={(e) => setBulkDate(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1"
              />
              {isSupplier && (
                <input
                  type="text"
                  value={bulkReason}
                  onChange={(e) => setBulkReason(e.target.value)}
                  placeholder="Reason for the change (required)"
                  className="border border-gray-300 rounded px-2 py-1 flex-1 min-w-[180px]"
                />
              )}
              <button
                disabled={!bulkDate || bulkSaving || (isSupplier && !bulkReason.trim())}
                onClick={() => applyBulk('revised_po_ex_factory', bulkDate)}
                className="ml-auto px-3 py-1 rounded-md bg-primary-600 text-white font-medium disabled:opacity-40 flex items-center gap-1.5 whitespace-nowrap"
              >
                {bulkSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                {isSupplier ? 'Submit for approval' : `Apply to ${selectedIds.size}`}
              </button>
            </div>
          </div>
        )}

        {bulkPanel === 'sample' && (
          <div className="mb-2 bg-white border border-gray-200 rounded-xl shadow-xl w-[min(94vw,680px)] overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-gray-900">Set a sample status</p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Strike Off and Lab Dip live on each style&apos;s components, so pick which ones below.
                  Fit Sample and PPS are whole-garment and always sit at style level.
                </p>
              </div>
              <button onClick={closeBulkPanel} className="text-gray-400 hover:text-gray-700 p-0.5 shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="px-3 py-2.5 flex items-center gap-2 text-xs flex-wrap">
              <span className="text-gray-500">Sample</span>
              <select
                value={bulkSampleField}
                onChange={(e) => setBulkSampleField(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 bg-white"
              >
                <option value="strike_off_status">Strike Off</option>
                <option value="lab_dip_status">Lab Dip</option>
                <option value="fit_sample_status">Fit Sample</option>
                <option value="pps_status">PPS</option>
              </select>

              {/* What we're writing — the status column or one of the two
                  dates. Setting a received date also auto-flips
                  OUTSTANDING→RECEIVED server-side via reconcile_sample_status,
                  so the date alone is often the whole job. */}
              <div className="inline-flex p-0.5 bg-gray-100 rounded-lg font-semibold">
                {([
                  { v: 'status', label: 'Status' },
                  { v: 'received', label: 'Received' },
                  { v: 'approved', label: 'Approved' },
                ] as const).map(m => (
                  <button
                    key={m.v}
                    onClick={() => setBulkSampleMode(m.v)}
                    className={cn(
                      'px-2 py-1 rounded-md transition-colors',
                      bulkSampleMode === m.v ? 'bg-white shadow-sm text-primary-700' : 'text-gray-500 hover:text-gray-700',
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <span className="text-gray-400">→</span>

              {bulkSampleMode === 'status' ? (
                <select
                  value={bulkSampleValue}
                  onChange={(e) => setBulkSampleValue(e.target.value)}
                  className={cn(
                    'border rounded px-2 py-1 bg-white',
                    bulkSampleValue ? 'border-gray-300' : 'border-gray-300 text-gray-400',
                  )}
                >
                  <option value="">— Pick a status —</option>
                  {SAMPLE_STATUS_OPTIONS.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="date"
                  value={bulkSampleDate}
                  onChange={(e) => setBulkSampleDate(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1"
                />
              )}
            </div>

            {/* Rejection is a lifecycle event, not a field write — it closes
                the current attempt and opens v+1, so it needs a structured
                reason the factory can act on. */}
            {isBulkRejecting && (
              <div className="mx-3 mb-2 p-2.5 rounded border-2 border-red-300 bg-red-50 space-y-2">
                <div className="text-[10px] text-red-800 flex items-start gap-1.5">
                  <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                  <span>
                    Closes the current attempt on every ticked sample and opens v+1 at OUTSTANDING
                    with a fresh clock. Received / approved dates are cleared per sample.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={bulkRejectReason}
                    onChange={(e) => setBulkRejectReason(e.target.value)}
                    className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                  >
                    <option value="">— Reason (required) —</option>
                    {rejectReasons.map(r => (
                      <option key={r.code} value={r.code}>{r.label}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={bulkRejectNotes}
                    onChange={(e) => setBulkRejectNotes(e.target.value)}
                    placeholder="Note to the factory (optional)"
                    className="text-xs border border-gray-300 rounded px-2 py-1 flex-1 min-w-[160px] bg-white"
                  />
                </div>
              </div>
            )}

            {/* Target picker — every sample record the write will touch,
                grouped under its PO, showing the style it sits on and the
                status it's currently at. Merch read PO-first, and seeing
                the current status inline is what makes a bulk write
                auditable before you commit it. */}
            {sampleTargets.length > 0 && (
              <div className="px-3 pb-2">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                    Apply to · {bulkSampleTargetCount} of {sampleTargets.length}
                  </span>
                  <span className="flex items-center gap-2 text-[10px]">
                    <button
                      onClick={() => setBulkSampleTargets(new Set(sampleTargets.map(t => t.key)))}
                      className="text-gray-500 hover:text-gray-900"
                    >
                      All
                    </button>
                    <span className="text-gray-300">·</span>
                    <button
                      onClick={() => setBulkSampleTargets(new Set())}
                      className="text-gray-500 hover:text-gray-900"
                    >
                      None
                    </button>
                  </span>
                </div>
                <div className="rounded border border-gray-200 max-h-52 overflow-y-auto divide-y divide-gray-100">
                  {sampleTargetGroups.map((g) => {
                    const keys = g.targets.map(t => t.key);
                    const allOn = keys.every(k => bulkSampleTargets.has(k));
                    const someOn = !allOn && keys.some(k => bulkSampleTargets.has(k));
                    return (
                      <div key={g.poNumber}>
                        <label className="flex items-center gap-2 px-2 py-1.5 bg-gray-50/80 cursor-pointer sticky top-0">
                          <input
                            type="checkbox"
                            checked={allOn}
                            ref={(el) => { if (el) el.indeterminate = someOn; }}
                            onChange={() => setBulkSampleTargets((prev) => {
                              const next = new Set(prev);
                              if (allOn) keys.forEach(k => next.delete(k));
                              else keys.forEach(k => next.add(k));
                              return next;
                            })}
                            className="w-3.5 h-3.5 accent-primary-600"
                          />
                          <span className="font-mono text-[11px] font-bold text-gray-900 tabular-nums">
                            PO {g.poNumber}
                          </span>
                          {g.customer && (
                            <span className="text-[10px] text-gray-500 truncate">· {g.customer}</span>
                          )}
                          <span className="ml-auto text-[10px] text-gray-400 tabular-nums">
                            {g.targets.length} sample{g.targets.length === 1 ? '' : 's'}
                          </span>
                        </label>
                        {g.targets.map((t) => {
                          const on = bulkSampleTargets.has(t.key);
                          return (
                            <label
                              key={t.key}
                              className={cn(
                                'flex items-center gap-2 pl-6 pr-2 py-1.5 text-[11px] cursor-pointer',
                                on ? 'bg-primary-50/50' : 'hover:bg-gray-50',
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() => setBulkSampleTargets((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(t.key)) next.delete(t.key);
                                  else next.add(t.key);
                                  return next;
                                })}
                                className="w-3.5 h-3.5 accent-primary-600 shrink-0"
                              />
                              <span className="font-mono text-gray-700 tabular-nums shrink-0">{t.styleCode}</span>
                              {t.componentName ? (
                                <span className="font-semibold text-gray-900 truncate">{t.componentName}</span>
                              ) : (
                                <span className="text-gray-400 italic truncate">order level — no components</span>
                              )}
                              <span className="ml-auto shrink-0">
                                <SampleStatusPill status={t.currentStatus} />
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
                {(bulkSampleMode === 'status' ? bulkSampleValue : bulkSampleDate) && bulkSampleTargetCount > 0 && (
                  <p className="text-[10px] text-gray-500 mt-1.5">
                    {bulkSampleTargetCount} sample{bulkSampleTargetCount === 1 ? '' : 's'} will have{' '}
                    {bulkSampleMode === 'status' ? (
                      <>status set to <span className="font-semibold text-gray-900">{bulkSampleValue}</span></>
                    ) : (
                      <>
                        {bulkSampleMode} date set to{' '}
                        <span className="font-semibold text-gray-900">{formatDate(bulkSampleDate)}</span>
                      </>
                    )}
                    , overwriting whatever they&apos;re on now.
                  </p>
                )}
              </div>
            )}

            <div className="px-3 py-2 border-t border-gray-100 bg-gray-50/60 flex items-center gap-3">
              <p className="text-[10px] text-gray-500 flex-1">
                {bulkSampleMode === 'received'
                  ? 'Setting a received date also flips OUTSTANDING samples to RECEIVED automatically.'
                  : bulkSampleMode === 'approved'
                    ? 'Sets the approved date only — set the status separately if it needs to move too.'
                    : 'Status writes land on the sample column; REJECTED closes the attempt and opens v+1.'}
              </p>
              <button
                disabled={
                  bulkSaving ||
                  bulkSampleTargetCount === 0 ||
                  (bulkSampleMode === 'status' ? !bulkSampleValue : !bulkSampleDate) ||
                  (isBulkRejecting && !bulkRejectReason)
                }
                onClick={applyBulkSample}
                className={cn(
                  'px-3 py-1 rounded-md text-white text-xs font-medium disabled:opacity-40 flex items-center gap-1.5 whitespace-nowrap shrink-0',
                  isBulkRejecting ? 'bg-red-600 hover:bg-red-700' : 'bg-primary-600 hover:bg-primary-700',
                )}
              >
                {bulkSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                {isBulkRejecting ? `Reject ${bulkSampleTargetCount}` : `Apply to ${bulkSampleTargetCount}`}
              </button>
            </div>
          </div>
        )}

        {bulkPanel === 'fitreq' && (
          <div className="mb-2 bg-white border border-gray-200 rounded-xl shadow-xl w-[min(94vw,560px)] overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-gray-900">Set Fit Sample Required</p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Applies to {selectedIds.size} selected style{selectedIds.size === 1 ? '' : 's'}.
                  Setting this to N also forces Fit Sample status to NOT REQUIRED, which suppresses
                  its warnings and counts it as done.
                </p>
              </div>
              <button onClick={closeBulkPanel} className="text-gray-400 hover:text-gray-700 p-0.5 shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="px-3 py-2.5 flex items-center gap-2 text-xs">
              <span className="text-gray-500">Required</span>
              <select
                value={bulkFitRequired}
                onChange={(e) => setBulkFitRequired(e.target.value)}
                className={cn('border rounded px-2 py-1 bg-white', bulkFitRequired ? 'border-gray-300' : 'border-gray-300 text-gray-400')}
              >
                <option value="">— Pick —</option>
                {FIT_REQUIRED_OPTIONS.map(v => (
                  <option key={v} value={v}>{v === 'Y' ? 'Y — required' : 'N — not required'}</option>
                ))}
              </select>
              <button
                disabled={!bulkFitRequired || bulkSaving}
                onClick={() => applyBulk('fit_sample_required', bulkFitRequired)}
                className="ml-auto px-3 py-1 rounded-md bg-primary-600 text-white font-medium disabled:opacity-40 flex items-center gap-1.5 whitespace-nowrap"
              >
                {bulkSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                Apply to {selectedIds.size}
              </button>
            </div>
          </div>
        )}

        <BulkBar
          count={selectedIds.size}
          onClear={() => { setSelectedIds(new Set()); lastClickedId.current = null; closeBulkPanel(); }}
        >
          <button
            onClick={() => setBulkPanel(p => (p === 'date' ? null : 'date'))}
            className={cn(
              'px-2.5 py-1 rounded-md border whitespace-nowrap transition-colors',
              bulkPanel === 'date'
                ? 'border-primary-400 bg-primary-50 text-primary-800 font-medium'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50',
            )}
          >
            Ex-factory date
          </button>
          {!isSupplier && (
            <>
              <button
                onClick={() => setBulkPanel(p => (p === 'sample' ? null : 'sample'))}
                className={cn(
                  'px-2.5 py-1 rounded-md border whitespace-nowrap transition-colors',
                  bulkPanel === 'sample'
                    ? 'border-primary-400 bg-primary-50 text-primary-800 font-medium'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50',
                )}
              >
                Samples
              </button>
              <button
                onClick={() => setBulkPanel(p => (p === 'fitreq' ? null : 'fitreq'))}
                className={cn(
                  'px-2.5 py-1 rounded-md border whitespace-nowrap transition-colors',
                  bulkPanel === 'fitreq'
                    ? 'border-primary-400 bg-primary-50 text-primary-800 font-medium'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50',
                )}
              >
                Fit required
              </button>
            </>
          )}
          <button
            onClick={exportSelection}
            disabled={bulkSaving}
            className="px-2.5 py-1 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 whitespace-nowrap transition-colors disabled:opacity-40"
            title="Export exactly these styles to Excel"
          >
            Export
          </button>
        </BulkBar>
      </div>

      <CommentSidebar />

      <ExportOrdersModal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        filenamePrefix={isSupplier ? 'factory' : 'orderbook'}
      />
    </AppShell>
  );
}

// ─── PO Card ───────────────────────────────────────────────

// ─── Order table (Sep 2026 list rework) ───────────────────────────────
// Replaces the PO card stack. Grouped mode keeps the PO-first reading
// the cards had — a group header row then its styles — while flat mode
// sorts across every style regardless of PO. Row click opens the drawer;
// the checkbox column drives the bulk bar.

function OrderTableV2({
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
}) {
  const showValue = !isSupplier && !isDesigner;
  // checkbox + style + desc + colour + status + exfac + qty + [value] + actions
  const colCount = showValue ? 9 : 8;

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
          <th className="px-3 py-2.5 border-b border-gray-200 w-[68px]" />
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

// ─── Detail Panel ──────────────────────────────────────────

function DetailPanel({
  order,
  onClose,
  onCommentClick,
  isSupplier,
  isDesigner,
  view,
  onSave,
  initialTab = 'details',
  onCommentCountChange,
  closing = false,
  onPrev,
  onNext,
}: {
  order: Order;
  onClose: () => void;
  onCommentClick: () => void;
  isSupplier: boolean;
  isDesigner?: boolean;
  view: string | null;
  onSave?: (orderId: number, field: string, value: any) => void;
  initialTab?: 'details' | 'comments';
  onCommentCountChange?: (orderId: number, commentCount: number, unreadCount: number) => void;
  /** Parent is animating the drawer out — it stays mounted for the slide. */
  closing?: boolean;
  /** Page to the previous/next style in the visible list. Null at either end. */
  onPrev?: (() => void) | null;
  onNext?: (() => void) | null;
}) {
  const isProductView = view === 'factory-product';
  const isShippingView = view === 'factory-shipping';
  const allowedCols = isProductView ? new Set(FACTORY_PRODUCT_COLUMNS)
    : isShippingView ? new Set(FACTORY_SHIPPING_COLUMNS)
    : null;
  const hasCol = (key: string) => !allowedCols || allowedCols.has(key);

  // Check editability from COLUMNS definitions — same source of truth as the table
  const orderSentToFactory = !!(order.order_sent_to_factory_date && order.tech_packs_sent_to_factory && order.specs_sent_to_factory);

  const canEdit = (key: string) => {
    if (isSupplier) {
      if (!orderSentToFactory) return false;
      const col = COLUMNS.find(c => c.key === key);
      return col?.supplierEditable ?? false;
    }
    const col = COLUMNS.find(c => c.key === key);
    return col?.editable ?? false;
  };

  const [hasComponents, setHasComponents] = useState(false);
  const [modalTab, setModalTab] = useState<'details' | 'comments'>(initialTab);
  const modalContentRef = useRef<HTMLDivElement>(null);
  const statusStyle = getStatusStyle(order.status);

  const { rows: sizeGuideRows } = useSizeGuide();
  const sizes = getSizeBreakdown(order, sizeGuideRows);
  const maxSize = Math.max(...sizes.map(s => s.value || 0), 1);

  // Drive the slide-in. Mounting with translate-x-full then flipping on
  // the next frame is what makes the transition actually play — setting
  // the final transform in the same paint as the mount would just snap.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const shown = entered && !closing;

  // Close on Escape; arrow keys page between styles. Ignored while the
  // user is typing in a field so inline edits aren't hijacked.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (
        el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
      );
      if (e.key === 'Escape') { onClose(); return; }
      if (typing) return;
      if (e.key === 'ArrowUp' && onPrev) { e.preventDefault(); onPrev(); }
      if (e.key === 'ArrowDown' && onNext) { e.preventDefault(); onNext(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext]);

  return (
    <>
      {/* Scrim — lighter than the old modal overlay since the drawer
          leaves most of the list visible and usable-looking behind it. */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-gray-900/30 transition-opacity duration-300 motion-reduce:transition-none',
          shown ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          'fixed top-0 right-0 bottom-0 w-full max-w-[860px] bg-white border-l border-gray-200 shadow-2xl z-50 flex flex-col',
          'transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
          shown ? 'translate-x-0' : 'translate-x-full',
        )}
        role="dialog"
        aria-modal="true"
      >
      {/* Header */}
      <div className="px-6 py-4 bg-white border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">
              {order.po_number}
              {order.china_orderbook_ref && <span className="text-gray-400 font-normal"> — {order.china_orderbook_ref}</span>}
              {order.style_code && <span className="text-gray-400 font-normal"> · {order.style_code}</span>}
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="text-base font-bold text-gray-900 truncate">
                {order.description || order.customer || 'Order detail'}
              </h3>
              <span className={cn(
                'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border border-current/20',
                statusStyle.bg, statusStyle.text
              )}>
                <span className={cn('w-1.5 h-1.5 rounded-full', statusStyle.dot)} />
                {order.status || 'Unknown'}
              </span>
              {order.is_late && (
                <span className="px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded-full text-[10px] font-semibold">
                  LATE
                </span>
              )}
              {order.colour && (
                <span className="text-[11px] text-gray-500">· {order.colour}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Segmented Details/Comments toggle */}
            <div className="inline-flex rounded-md border border-gray-300 bg-gray-50 p-0.5">
              <button
                onClick={() => { setModalTab('details'); modalContentRef.current?.scrollTo(0, 0); }}
                className={cn(
                  'px-3 py-1 text-xs font-semibold rounded transition-colors',
                  modalTab === 'details'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                )}
              >
                Details
              </button>
              <button
                onClick={() => { setModalTab('comments'); modalContentRef.current?.scrollTo(0, 0); }}
                className={cn(
                  'px-3 py-1 text-xs font-semibold rounded transition-colors flex items-center gap-1.5',
                  modalTab === 'comments'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                )}
              >
                <MessageSquare className="w-3 h-3" />
                Comments
                {(order.unread_comment_count || 0) > 0 && (
                  <span className={cn(
                    'px-1 py-0 text-[9px] font-bold rounded-full leading-tight',
                    modalTab === 'comments' ? 'bg-white text-blue-600' : 'bg-red-500 text-white'
                  )}>
                    {order.unread_comment_count}
                  </span>
                )}
              </button>
            </div>
            {/* Page between styles without closing the drawer — the main
                win of the drawer over the old centred modal. */}
            {(onPrev || onNext) && (
              <div className="inline-flex rounded-md border border-gray-300 bg-white overflow-hidden">
                <button
                  onClick={() => onPrev?.()}
                  disabled={!onPrev}
                  title="Previous style (↑)"
                  className="px-1.5 py-1 text-gray-500 hover:text-gray-900 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed border-r border-gray-300"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onNext?.()}
                  disabled={!onNext}
                  title="Next style (↓)"
                  className="px-1.5 py-1 text-gray-500 hover:text-gray-900 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Body — Comments tab keeps its own full-height layout. Details tab uses
          the new hero + sticky pill nav + scroll-of-sections layout. */}
      {modalTab === 'comments' ? (
        <div ref={modalContentRef} className="flex-1 min-h-0 overflow-hidden p-6 flex">
          <div className="flex-1 min-h-0">
            <InlineComments order={order} onCommentCountChange={onCommentCountChange} />
          </div>
        </div>
      ) : (
        <DetailBody
          order={order}
          hasCol={hasCol}
          canEdit={canEdit}
          isSupplier={isSupplier}
          isDesigner={!!isDesigner}
          onSave={onSave}
          modalContentRef={modalContentRef}
          sizes={sizes}
          maxSize={maxSize}
        />
      )}

      {/* Footer */}
      <div className="border-t border-gray-100 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <p className="text-[11px] text-gray-400">
          {(onPrev || onNext) ? '↑ ↓ to move between styles · Esc to close' : 'Esc to close'}
        </p>
        <p className="text-[11px] text-gray-400">
          Updated {timeAgo(order.updated_at)}
        </p>
      </div>
      </div>
    </>
  );
}

// ─── Detail body — new hybrid layout (hero + sticky pill nav + scroll sections) ───

function DetailBody({
  order,
  hasCol,
  canEdit,
  isSupplier,
  isDesigner,
  onSave,
  modalContentRef,
  sizes,
  maxSize,
}: {
  order: Order;
  hasCol: (key: string) => boolean;
  canEdit: (key: string) => boolean;
  isSupplier: boolean;
  isDesigner: boolean;
  onSave?: (orderId: number, field: string, value: any) => void;
  modalContentRef: React.RefObject<HTMLDivElement>;
  sizes: { label: string; value: number }[];
  maxSize: number;
}) {
  const [hasComponents, setHasComponents] = useState(false);
  const [activeSection, setActiveSection] = useState<'product' | 'sampling' | 'shipping' | 'timeline'>('product');

  // Reject-sample modal state — fires when the user picks REJECTED on an
  // order-level sample status (Fit / Strike / Lab / PPS). Mirrors the
  // FactoryV2View pattern so rejections from this page also capture a
  // structured reason + note and bump the attempt counter.
  const [rejectModal, setRejectModal] = useState<{ sampleType: SampleType; currentAttemptNo: number } | null>(null);
  const [orderSubmissions, setOrderSubmissions] = useState<SampleSubmission[]>([]);

  const loadOrderSubmissions = useCallback(async () => {
    try {
      const res = await submissionsApi.getForOrder(order.id);
      setOrderSubmissions(res.submissions);
    } catch {
      // Fine to no-op — attempt counter just defaults to 1.
    }
  }, [order.id]);
  useEffect(() => { loadOrderSubmissions(); }, [loadOrderSubmissions]);

  const orderLevelCurrentAttempt = (sampleType: SampleType): number => {
    const matching = orderSubmissions.filter(s => s.sample_type === sampleType);
    if (matching.length === 0) return 1;
    return Math.max(...matching.map(s => s.attempt_no));
  };

  // Intercept REJECTED on any sample status field — open the modal so the
  // user has to enter a reason. Everything else passes through to onSave.
  const handleSampleStatusSave = (field: string, value: any) => {
    const sampleType = SAMPLE_STATUS_FIELD_TO_TYPE[field];
    if (value === 'REJECTED' && sampleType) {
      setRejectModal({ sampleType, currentAttemptNo: orderLevelCurrentAttempt(sampleType) });
      return;
    }
    onSave?.(order.id, field, value);
  };

  // Refs to each section so the sticky pill nav can scroll-to + we can flip
  // the active pill based on which section is currently in view.
  const productRef = useRef<HTMLElement>(null);
  const samplingRef = useRef<HTMLElement>(null);
  const shippingRef = useRef<HTMLElement>(null);
  const timelineRef = useRef<HTMLElement>(null);

  const sectionRefs = {
    product: productRef,
    sampling: samplingRef,
    shipping: shippingRef,
    timeline: timelineRef,
  } as const;

  // Use getBoundingClientRect rather than offsetTop — sections aren't
  // guaranteed to use the scroller as their offsetParent (it has no
  // explicit position), so offsetTop walks past it and gives garbage.
  const scrollToSection = (key: 'product' | 'sampling' | 'shipping' | 'timeline') => {
    const el = sectionRefs[key].current;
    const scroller = modalContentRef.current;
    if (!el || !scroller) return;
    const elRect = el.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    const top = elRect.top - scrollerRect.top + scroller.scrollTop - 8;
    scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  };

  // Track which section is most-visible. Uses getBoundingClientRect for
  // robust math, plus a bottom-of-scroll snap so the last (timeline)
  // section can still light up — it's short and may never push its top
  // past the threshold by scrolling alone.
  useEffect(() => {
    const scroller = modalContentRef.current;
    if (!scroller) return;
    const onScroll = () => {
      // At the bottom of the scroll → force the last section active.
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) {
        setActiveSection('timeline');
        return;
      }
      const scrollerTop = scroller.getBoundingClientRect().top;
      const threshold = scrollerTop + 60; // 60px into the visible area
      const order: ('product' | 'sampling' | 'shipping' | 'timeline')[] = ['product', 'sampling', 'shipping', 'timeline'];
      let current: typeof order[number] = 'product';
      for (const key of order) {
        const el = sectionRefs[key].current;
        if (el && el.getBoundingClientRect().top <= threshold) current = key;
      }
      setActiveSection(current);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sampling progress badge — count distinct sample types and how many are done.
  // For the hero strip + Sampling pill "N pending" counter.
  // Fit + PPS are always order-level. Strike / Lab / Label live on the
  // components — each component contributes ONE item using its own
  // sample_type. Order-level SO/LD only counts as a fallback when the
  // order has no components at all (legacy shape).
  const sampleProgress = useMemo(() => {
    const items: { label: string; done: boolean }[] = [];
    if (hasCol('fit_sample_status')) {
      const s = (order.fit_sample_status || '').toUpperCase();
      // Fit Required = N also counts as done — the sample won't happen.
      const required = (order.fit_sample_required || '').trim().toUpperCase();
      const done = s === 'APPROVED' || s === 'NOT REQUIRED' || required === 'N';
      items.push({ label: 'Fit', done });
    }
    const components = order.components || [];
    if (components.length > 0) {
      for (const c of components) {
        const t = c.sample_type;
        const status = (t === 'strike_off' ? c.strike_off_status
                      : t === 'lab_dip'   ? c.lab_dip_status
                      : c.label_status) || '';
        const approved = t === 'strike_off' ? c.strike_off_approved
                       : t === 'lab_dip'   ? c.lab_dip_approved
                       : c.label_approved;
        const s = status.trim().toUpperCase();
        const done = s === 'APPROVED' || s === 'NOT REQUIRED' || !!approved;
        const tag = t === 'strike_off' ? 'SO' : t === 'lab_dip' ? 'LD' : 'LB';
        items.push({ label: `${c.name} ${tag}`, done });
      }
    } else {
      // Legacy order-level SO/LD — only when there are no components.
      if (hasCol('strike_off_status')) {
        const s = (order.strike_off_status || '').toUpperCase();
        items.push({ label: 'Strike', done: s === 'APPROVED' || s === 'NOT REQUIRED' });
      }
      if (hasCol('lab_dip_status')) {
        const s = (order.lab_dip_status || '').toUpperCase();
        items.push({ label: 'Lab', done: s === 'APPROVED' || s === 'NOT REQUIRED' });
      }
    }
    if (hasCol('pps_status')) {
      const s = (order.pps_status || '').toUpperCase();
      items.push({ label: 'PPS', done: s === 'APPROVED' || s === 'NOT REQUIRED' });
    }
    return items;
  }, [order, hasCol]);
  const sampleDone = sampleProgress.filter(s => s.done).length;
  const sampleTotal = sampleProgress.length;
  const samplePending = sampleTotal - sampleDone;

  // Days until ex-factory for the hero tile colour.
  const exFacDate = order.factory_confirmed_ex_factory || order.original_po_ex_factory;
  const daysToExFac = useMemo(() => {
    if (!exFacDate) return null;
    try {
      const d = new Date(exFacDate);
      const now = new Date();
      return Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    } catch { return null; }
  }, [exFacDate]);

  const exFacTone = daysToExFac == null
    ? 'border-gray-200 bg-white'
    : daysToExFac < 0
    ? 'border-red-200 bg-red-50/30'
    : daysToExFac < 7
    ? 'border-amber-200 bg-amber-50/30'
    : 'border-gray-200 bg-white';

  const showSamplingTile = sampleTotal > 0;
  const showExFacTile = !!exFacDate;
  const showCostTile = hasCol('trade_price') && !isDesigner && !isSupplier;
  const showValueTile = hasCol('total_order_value') && !isDesigner && !isSupplier;

  return (
    <>
      {/* Hero stat strip — always visible, "what do I need to know at a glance". */}
      <div className="px-6 py-3 bg-gradient-to-b from-gray-50/80 to-white border-b border-gray-100 grid gap-3 flex-shrink-0" style={{ gridTemplateColumns: `repeat(${[true, showCostTile || showValueTile, showExFacTile, hasCol('eta_to_customer'), showSamplingTile].filter(Boolean).length}, minmax(0, 1fr))` }}>
        <HeroTile label="Total Qty" value={formatQty(order.total_quantity)} />
        {showValueTile ? (
          <HeroTile
            label="Order Value"
            value={formatCurrency(order.total_order_value)}
            sub={hasCol('trade_price') ? `${formatCurrency(order.trade_price)} cost` : undefined}
          />
        ) : showCostTile ? (
          <HeroTile label="Cost Price" value={formatCurrency(order.trade_price)} />
        ) : null}
        {showExFacTile && (
          <HeroTile
            label="Ex-Factory"
            value={formatDate(exFacDate)}
            sub={daysToExFac != null ? (daysToExFac < 0 ? `${Math.abs(daysToExFac)}d overdue` : `in ${daysToExFac}d`) : undefined}
            tone={exFacTone}
          />
        )}
        {hasCol('eta_to_customer') && (
          <HeroTile
            label="ETA Customer"
            value={formatDate(order.eta_to_customer)}
            sub={order.vessel_name ? `via ${order.vessel_name}` : undefined}
          />
        )}
        {showSamplingTile && (
          <HeroTile
            label="Sampling"
            value={`${sampleDone} of ${sampleTotal}`}
            sub={samplePending > 0
              ? `${sampleProgress.filter(s => !s.done).map(s => s.label).join(', ')} pending`
              : `${sampleProgress.map(s => s.label).join(', ')} all done`
            }
            tone={samplePending > 0 ? 'border-amber-200 bg-amber-50/30' : 'border-emerald-200 bg-emerald-50/30'}
          />
        )}
      </div>

      {/* Sticky pill nav */}
      <div className="px-6 py-2 border-b border-gray-200 bg-white/95 backdrop-blur flex items-center gap-1.5 flex-shrink-0">
        <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mr-2">Jump to</span>
        <SectionPill active={activeSection === 'product'} label="Product" onClick={() => scrollToSection('product')} />
        <SectionPill
          active={activeSection === 'sampling'}
          label="Sampling"
          badge={samplePending > 0 ? `${samplePending} pending` : undefined}
          badgeTone="amber"
          onClick={() => scrollToSection('sampling')}
        />
        <SectionPill active={activeSection === 'shipping'} label="Shipping" onClick={() => scrollToSection('shipping')} />
        <SectionPill active={activeSection === 'timeline'} label="Timeline" onClick={() => scrollToSection('timeline')} />
      </div>

      {/* Scroll body — all sections rendered, separated by dividers */}
      <BulkScopeProvider
        poNumber={order.po_number}
        currentOrderId={order.id}
        onAfterBulkSave={() => onSave?.(order.id, '__refresh__', null)}
      >
      <div ref={modalContentRef} className="flex-1 overflow-y-auto bg-gray-50/40">

        {/* ─── Product section ─── */}
        <section ref={productRef} className="px-6 pt-6 pb-3">
          <SectionHeader accent="blue" label="Product" />
          <div className="grid grid-cols-2 gap-4">
            {/* Product details card */}
            <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
              {hasCol('description') && <DetailRow label="Description" value={order.description} editable={canEdit('description')} fieldKey="description" onSave={(v) => onSave?.(order.id, 'description', v)} />}
              {hasCol('customer') && <DetailRow label="Customer" value={order.customer} editable={canEdit('customer')} fieldKey="customer" onSave={(v) => onSave?.(order.id, 'customer', v)} />}
              {hasCol('customer_po_number') && <DetailRow label="Customer PO#" value={order.customer_po_number} editable={canEdit('customer_po_number')} fieldKey="customer_po_number" onSave={(v) => onSave?.(order.id, 'customer_po_number', v)} />}
              {hasCol('system_po_number') && !isSupplier && <DetailRow label="System PO#" value={order.system_po_number} editable={canEdit('system_po_number')} fieldKey="system_po_number" onSave={(v) => onSave?.(order.id, 'system_po_number', v)} />}
              {hasCol('china_orderbook_ref') && <DetailRow label="Order Reference" value={order.china_orderbook_ref} editable={canEdit('china_orderbook_ref')} fieldKey="china_orderbook_ref" onSave={(v) => onSave?.(order.id, 'china_orderbook_ref', v)} />}
              {hasCol('colour') && <DetailRow label="Colour" value={order.colour} editable={canEdit('colour')} fieldKey="colour" onSave={(v) => onSave?.(order.id, 'colour', v)} />}
              {hasCol('gender') && <DetailRow label="Gender" value={order.gender} editable={canEdit('gender')} fieldKey="gender" onSave={(v) => onSave?.(order.id, 'gender', v)} extra={<SizeGuideTooltip gender={order.gender} />} />}
              {hasCol('season') && <DetailRow label="Season" value={order.season} editable={canEdit('season')} fieldKey="season" onSave={(v) => onSave?.(order.id, 'season', v)} />}
              {hasCol('factory') && <DetailRow label="Factory" value={order.factory} editable={canEdit('factory')} fieldKey="factory" onSave={(v) => onSave?.(order.id, 'factory', v)} />}
              {hasCol('terms') && <DetailRow label="Terms" value={order.terms} editable={canEdit('terms')} fieldKey="terms" onSave={(v) => onSave?.(order.id, 'terms', v)} />}
              {hasCol('sales_person') && !isSupplier && <DetailRow label="Sales Person" value={order.sales_person} editable={canEdit('sales_person')} fieldKey="sales_person" onSave={(v) => onSave?.(order.id, 'sales_person', v)} />}
              {hasCol('direct_repeat_new') && <DetailRow label="Direct Repeat/New" value={order.direct_repeat_new} editable={canEdit('direct_repeat_new')} fieldKey="direct_repeat_new" onSave={(v) => onSave?.(order.id, 'direct_repeat_new', v)} />}
            </div>
            {/* Size breakdown card */}
            {sizes.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 p-4 self-start">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[11px] font-semibold text-gray-700">Size breakdown</div>
                  <SizeGuideTooltip gender={order.gender} />
                </div>
                <div className="space-y-1.5">
                  {sizes.map(s => (
                    <div key={s.label} className="flex items-center gap-3">
                      <span className="text-[11px] font-medium text-gray-500 w-10 text-right">{s.label}</span>
                      <div className="flex-1 h-5 bg-gray-100 rounded-md overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-400 to-blue-500 rounded-md flex items-center justify-end pr-2"
                          style={{ width: `${Math.max(((s.value || 0) / maxSize) * 100, 8)}%` }}
                        >
                          <span className="text-[10px] font-bold text-white">{s.value}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-gray-100 mt-3 pt-2 flex items-center justify-between text-[11px]">
                  <span className="text-gray-500">Total units</span>
                  <span className="font-semibold text-gray-800">{formatQty(order.total_quantity)}</span>
                </div>
              </div>
            )}
          </div>
        </section>

        <SectionDivider />

        {/* ─── Sampling section ─── */}
        {(hasCol('fit_sample_status') || hasCol('strike_off_status') || hasCol('lab_dip_status') || hasCol('pps_status')) && (
          <>
            <section ref={samplingRef} className="px-6 pt-6 pb-3">
              <SectionHeader
                accent="amber"
                label="Sampling"
                badge={samplePending > 0 ? `${samplePending} pending` : undefined}
                badgeTone="amber"
              />

              {/* Components — Strike Off + Lab Dip per component. Fit lives on the style. */}
              {(hasCol('strike_off_status') || hasCol('lab_dip_status')) && (
                <div className="mb-4">
                  <ComponentsSection orderId={order.id} poNumber={order.po_number} hasCol={hasCol} canEdit={canEdit} onComponentsLoaded={(n) => setHasComponents(n > 0)} />
                </div>
              )}

              {/* Style-level Strike + Lab — only when no components exist (default fallback). */}
              {!hasComponents && (hasCol('strike_off_status') || hasCol('lab_dip_status')) && (
                <>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">Order-level samples</div>
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {(hasCol('strike_off_status') || hasCol('strike_off_received')) && (
                      <SampleCard label="Strike Off">
                        {hasCol('strike_off_status') && <DetailRow label="Status" value={order.strike_off_status} editable={canEdit('strike_off_status')} options={SAMPLE_STATUS_OPTIONS} fieldKey="strike_off_status" onSave={(v) => handleSampleStatusSave('strike_off_status', v)} />}
                        {hasCol('strike_off_received') && <DetailRow label="Received" value={formatDate(order.strike_off_received)} type="date" rawValue={order.strike_off_received} editable={canEdit('strike_off_received')} fieldKey="strike_off_received" onSave={(v) => onSave?.(order.id, 'strike_off_received', v)} />}
                        {hasCol('strike_off_approved') && <DetailRow label="Approved" value={formatDate(order.strike_off_approved)} type="date" rawValue={order.strike_off_approved} editable={canEdit('strike_off_approved')} fieldKey="strike_off_approved" onSave={(v) => onSave?.(order.id, 'strike_off_approved', v)} />}
                      </SampleCard>
                    )}
                    {(hasCol('lab_dip_status') || hasCol('lab_dip_received')) && (
                      <SampleCard label="Lab Dip">
                        {hasCol('lab_dip_status') && <DetailRow label="Status" value={order.lab_dip_status} editable={canEdit('lab_dip_status')} options={SAMPLE_STATUS_OPTIONS} fieldKey="lab_dip_status" onSave={(v) => handleSampleStatusSave('lab_dip_status', v)} />}
                        {hasCol('lab_dip_received') && <DetailRow label="Received" value={formatDate(order.lab_dip_received)} type="date" rawValue={order.lab_dip_received} editable={canEdit('lab_dip_received')} fieldKey="lab_dip_received" onSave={(v) => onSave?.(order.id, 'lab_dip_received', v)} />}
                        {hasCol('lab_dip_approved') && <DetailRow label="Approved" value={formatDate(order.lab_dip_approved)} type="date" rawValue={order.lab_dip_approved} editable={canEdit('lab_dip_approved')} fieldKey="lab_dip_approved" onSave={(v) => onSave?.(order.id, 'lab_dip_approved', v)} />}
                      </SampleCard>
                    )}
                  </div>
                </>
              )}

              {/* Fit Sample — always at order/style level. */}
              {(hasCol('fit_sample_status') || hasCol('fit_sample_received')) && (
                <>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2 mt-4">Fit Sample · order-level</div>
                  <SampleCard label="Fit Sample" highlight>
                    {hasCol('fit_sample_required') && <DetailRow label="Required" value={order.fit_sample_required} editable={canEdit('fit_sample_required')} options={FIT_REQUIRED_OPTIONS} fieldKey="fit_sample_required" onSave={(v) => onSave?.(order.id, 'fit_sample_required', v)} />}
                    {hasCol('fit_sample_status') && <DetailRow label="Status" value={order.fit_sample_status} editable={canEdit('fit_sample_status')} options={FIT_SAMPLE_STATUS_OPTIONS} fieldKey="fit_sample_status" onSave={(v) => handleSampleStatusSave('fit_sample_status', v)} />}
                    {hasCol('fit_sample_received') && <DetailRow label="Received" value={formatDate(order.fit_sample_received)} type="date" rawValue={order.fit_sample_received} editable={canEdit('fit_sample_received')} fieldKey="fit_sample_received" onSave={(v) => onSave?.(order.id, 'fit_sample_received', v)} />}
                    {hasCol('fit_sample_approved') && <DetailRow label="Approved" value={formatDate(order.fit_sample_approved)} type="date" rawValue={order.fit_sample_approved} editable={canEdit('fit_sample_approved')} fieldKey="fit_sample_approved" onSave={(v) => onSave?.(order.id, 'fit_sample_approved', v)} />}
                  </SampleCard>
                </>
              )}

              {/* PPS — always order-level. */}
              {(hasCol('pps_status') || hasCol('pps_received')) && (
                <>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2 mt-4">PPS · order-level</div>
                  <SampleCard label="Pre-Production Sample" highlight>
                    {hasCol('pps_status') && <DetailRow label="Status" value={order.pps_status} editable={canEdit('pps_status')} options={SAMPLE_STATUS_OPTIONS} fieldKey="pps_status" onSave={(v) => handleSampleStatusSave('pps_status', v)} />}
                    {hasCol('pps_received') && <DetailRow label="Received" value={formatDate(order.pps_received)} type="date" rawValue={order.pps_received} editable={canEdit('pps_received')} fieldKey="pps_received" onSave={(v) => onSave?.(order.id, 'pps_received', v)} />}
                    {hasCol('pps_sent_to_customer') && <DetailRow label="Sent to Cust" value={formatDate(order.pps_sent_to_customer)} type="date" rawValue={order.pps_sent_to_customer} editable={canEdit('pps_sent_to_customer')} fieldKey="pps_sent_to_customer" onSave={(v) => onSave?.(order.id, 'pps_sent_to_customer', v)} />}
                    {hasCol('pps_approved') && <DetailRow label="Approved" value={formatDate(order.pps_approved)} type="date" rawValue={order.pps_approved} editable={canEdit('pps_approved')} fieldKey="pps_approved" onSave={(v) => onSave?.(order.id, 'pps_approved', v)} />}
                  </SampleCard>
                </>
              )}

              {/* Other order-level samples — photo / shipment / ex-fac from PP */}
              {(hasCol('photo_sample_received') || hasCol('shipment_sample_received') || hasCol('ex_factory_from_pp_approval')) && (
                <div className="grid grid-cols-3 gap-2 mt-4">
                  {hasCol('photo_sample_received') && (
                    <SampleCard label="Photo Sample">
                      <DetailRow label="Received" value={formatDate(order.photo_sample_received)} type="date" rawValue={order.photo_sample_received} editable={canEdit('photo_sample_received')} fieldKey="photo_sample_received" onSave={(v) => onSave?.(order.id, 'photo_sample_received', v)} />
                    </SampleCard>
                  )}
                  {hasCol('shipment_sample_received') && (
                    <SampleCard label="Shipment Sample">
                      <DetailRow label="Received" value={formatDate(order.shipment_sample_received)} type="date" rawValue={order.shipment_sample_received} editable={canEdit('shipment_sample_received')} fieldKey="shipment_sample_received" onSave={(v) => onSave?.(order.id, 'shipment_sample_received', v)} />
                    </SampleCard>
                  )}
                  {hasCol('ex_factory_from_pp_approval') && (
                    <SampleCard label="Ex-Fac from PP Approval">
                      <DetailRow label="Date" value={formatDate(order.ex_factory_from_pp_approval)} type="date" rawValue={order.ex_factory_from_pp_approval} editable={canEdit('ex_factory_from_pp_approval')} fieldKey="ex_factory_from_pp_approval" onSave={(v) => onSave?.(order.id, 'ex_factory_from_pp_approval', v)} />
                    </SampleCard>
                  )}
                </div>
              )}
            </section>
            <SectionDivider />
          </>
        )}

        {/* ─── Shipping section ─── */}
        <section ref={shippingRef} className="px-6 pt-6 pb-3">
          <SectionHeader accent="teal" label="Shipping" />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">Vessel</div>
              <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
                {hasCol('fcl_lcl') && <DetailRow label="FCL/LCL" value={order.fcl_lcl} editable={canEdit('fcl_lcl')} fieldKey="fcl_lcl" onSave={(v) => onSave?.(order.id, 'fcl_lcl', v)} />}
                {hasCol('vessel_name') && <DetailRow label="Vessel Name" value={order.vessel_name} editable={canEdit('vessel_name')} fieldKey="vessel_name" onSave={(v) => onSave?.(order.id, 'vessel_name', v)} />}
                {hasCol('vessel_etd') && <DetailRow label="Vessel ETD" value={formatDate(order.vessel_etd)} type="date" rawValue={order.vessel_etd} editable={canEdit('vessel_etd')} fieldKey="vessel_etd" onSave={(v) => onSave?.(order.id, 'vessel_etd', v)} />}
                {hasCol('vessel_eta_to_port') && <DetailRow label="Vessel ETA Port" value={formatDate(order.vessel_eta_to_port)} type="date" rawValue={order.vessel_eta_to_port} editable={canEdit('vessel_eta_to_port')} fieldKey="vessel_eta_to_port" onSave={(v) => onSave?.(order.id, 'vessel_eta_to_port', v)} />}
                {hasCol('revised_vessel_eta_to_port') && <DetailRow label="Revised Vessel ETA" value={formatDate(order.revised_vessel_eta_to_port)} type="date" rawValue={order.revised_vessel_eta_to_port} editable={canEdit('revised_vessel_eta_to_port')} fieldKey="revised_vessel_eta_to_port" onSave={(v) => onSave?.(order.id, 'revised_vessel_eta_to_port', v)} />}
                {(order.tracking_reference || hasCol('tracking_reference')) && <DetailRow label="Tracking Ref" value={order.tracking_reference} editable={canEdit('tracking_reference')} fieldKey="tracking_reference" onSave={(v) => onSave?.(order.id, 'tracking_reference', v)} />}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">Delivery</div>
              <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
                {hasCol('original_del_date_to_customer') && <DetailRow label="Customer Requested" value={order.date_notes?.original_del_date_to_customer || formatDate(order.original_del_date_to_customer)} type="date" rawValue={order.date_notes?.original_del_date_to_customer || order.original_del_date_to_customer} editable={canEdit('original_del_date_to_customer')} fieldKey="original_del_date_to_customer" onSave={(v) => onSave?.(order.id, 'original_del_date_to_customer', v)} />}
                {hasCol('eta_to_uk') && <DetailRow label="ETA UK" value={formatDate(order.eta_to_uk)} />}
                {hasCol('eta_to_customer') && <DetailRow label="ETA Customer" value={formatDate(order.eta_to_customer)} />}
                {hasCol('estimated_del_to_customer') && <DetailRow label="Estimated Delivery" value={formatDate(order.estimated_del_to_customer)} />}
                {hasCol('customer_po_open_month') && order.customer_po_open_month && <DetailRow label="Open Month" value={order.customer_po_open_month} />}
                {hasCol('expected_dispatch_arrive_uk_month') && order.expected_dispatch_arrive_uk_month && <DetailRow label="Expected UK Month" value={order.expected_dispatch_arrive_uk_month} />}
              </div>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* ─── Timeline section ─── */}
        <section ref={timelineRef} className="px-6 pt-6 pb-6">
          <SectionHeader accent="violet" label="Timeline" />
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="relative">
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-200" />
              <div className="space-y-0">
                {hasCol('order_received_date') && <TimelineItem label="Order Received" date={order.order_received_date} editable={canEdit('order_received_date')} fieldKey="order_received_date" onSave={(v) => onSave?.(order.id, 'order_received_date', v)} />}
                {hasCol('order_sent_to_factory_date') && <TimelineItem label="Sent to Factory" date={order.order_sent_to_factory_date} editable={canEdit('order_sent_to_factory_date')} fieldKey="order_sent_to_factory_date" onSave={(v) => onSave?.(order.id, 'order_sent_to_factory_date', v)} />}
                {hasCol('tech_packs_sent_to_factory') && <TimelineItem label="Tech Packs Sent" date={order.tech_packs_sent_to_factory} editable={canEdit('tech_packs_sent_to_factory')} fieldKey="tech_packs_sent_to_factory" onSave={(v) => onSave?.(order.id, 'tech_packs_sent_to_factory', v)} />}
                {hasCol('specs_sent_to_factory') && <TimelineItem label="Specs Sent" date={order.specs_sent_to_factory} editable={canEdit('specs_sent_to_factory')} fieldKey="specs_sent_to_factory" onSave={(v) => onSave?.(order.id, 'specs_sent_to_factory', v)} />}
                {hasCol('barcodes_sent_to_factory') && <TimelineItem label="Barcodes Sent" date={order.barcodes_sent_to_factory} editable={canEdit('barcodes_sent_to_factory')} fieldKey="barcodes_sent_to_factory" onSave={(v) => onSave?.(order.id, 'barcodes_sent_to_factory', v)} />}
                {hasCol('original_po_ex_factory') && <TimelineItem label="Requested Ex-Factory" date={order.original_po_ex_factory} note={order.date_notes?.original_po_ex_factory} editable={canEdit('original_po_ex_factory')} fieldKey="original_po_ex_factory" onSave={(v) => onSave?.(order.id, 'original_po_ex_factory', v)} />}
                {hasCol('factory_confirmed_ex_factory') && <TimelineItem label="Factory Confirmed Ex-Fac" date={order.factory_confirmed_ex_factory} note={order.date_notes?.factory_confirmed_ex_factory} highlight editable={canEdit('factory_confirmed_ex_factory')} fieldKey="factory_confirmed_ex_factory" onSave={(v) => onSave?.(order.id, 'factory_confirmed_ex_factory', v)} />}
                {hasCol('revised_po_ex_factory') && <TimelineItem label="Revised Ex-Factory" date={order.revised_po_ex_factory} note={order.date_notes?.revised_po_ex_factory} highlight editable={canEdit('revised_po_ex_factory')} fieldKey="revised_po_ex_factory" onSave={(v) => onSave?.(order.id, 'revised_po_ex_factory', v)} />}
                {hasCol('vessel_etd') && <TimelineItem label="Vessel ETD" date={order.vessel_etd} editable={canEdit('vessel_etd')} fieldKey="vessel_etd" onSave={(v) => onSave?.(order.id, 'vessel_etd', v)} />}
                {hasCol('vessel_eta_to_port') && <TimelineItem label="Vessel ETA Port" date={order.vessel_eta_to_port} editable={canEdit('vessel_eta_to_port')} fieldKey="vessel_eta_to_port" onSave={(v) => onSave?.(order.id, 'vessel_eta_to_port', v)} />}
                {hasCol('revised_vessel_eta_to_port') && <TimelineItem label="Revised Vessel ETA" date={order.revised_vessel_eta_to_port} editable={canEdit('revised_vessel_eta_to_port')} fieldKey="revised_vessel_eta_to_port" onSave={(v) => onSave?.(order.id, 'revised_vessel_eta_to_port', v)} />}
                {hasCol('eta_to_uk') && <TimelineItem label="ETA UK" date={order.eta_to_uk} />}
                {hasCol('eta_to_customer') && <TimelineItem label="ETA Customer" date={order.eta_to_customer} />}
                {hasCol('estimated_del_to_customer') && <TimelineItem label="Est Del to Customer" date={order.estimated_del_to_customer} />}
                {hasCol('original_del_date_to_customer') && <TimelineItem label="Customer Req Delivery" date={order.original_del_date_to_customer} note={order.date_notes?.original_del_date_to_customer} editable={canEdit('original_del_date_to_customer')} fieldKey="original_del_date_to_customer" onSave={(v) => onSave?.(order.id, 'original_del_date_to_customer', v)} />}
              </div>
            </div>
          </div>
        </section>

      </div>
      </BulkScopeProvider>

      {rejectModal && (
        <RejectSampleModal
          orderId={order.id}
          componentId={null}
          componentName={null}
          sampleType={rejectModal.sampleType}
          currentAttemptNo={rejectModal.currentAttemptNo}
          onClose={() => setRejectModal(null)}
          onRejected={() => {
            setRejectModal(null);
            loadOrderSubmissions();
            // Trigger an order refresh so the new OUTSTANDING status reflects
            // in the cells the user just changed. The DetailBody's onSave
            // refetches the order itself; we pass a sentinel field name.
            onSave?.(order.id, '__refresh__', null);
          }}
        />
      )}
    </>
  );
}

// ─── Size Guide ───────────────────────────────────────────

// Size slot keys in positional order (maps to SIZE_GUIDE labels)
const SIZE_SLOT_KEYS: (keyof Order)[] = [
  'size_2xs', 'size_xs', 'size_s', 'size_m', 'size_l', 'size_xl',
  'size_2xl', 'size_3xl', 'size_4xl', 'size_5xl', 'size_11', 'size_12', 'size_13', 'size_14',
];

const DEFAULT_SIZE_LABELS = ['2XS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', 'S11', 'S12', 'S13', 'S14'];

// SIZE_GUIDE used to live as a hardcoded array here. It now comes from the DB
// (admin manages it in /settings → Size Guide) via useSizeGuide(). Callers
// pass the rows in to getSizeBreakdown rather than importing a global const.
import type { SizeGuideRow } from '@/lib/api';

function getSizeBreakdown(order: Order, sizeGuide: SizeGuideRow[]): { label: string; value: number }[] {
  const genderCode = order.gender ? order.gender.split('-')[0]?.trim() : '';
  const guide = sizeGuide.find(g => g.code === genderCode && g.is_active);
  const labels = guide ? guide.sizes : DEFAULT_SIZE_LABELS;

  return SIZE_SLOT_KEYS.map((key, i) => ({
    label: labels[i] || DEFAULT_SIZE_LABELS[i] || `S${i + 1}`,
    value: (order[key] as number) || 0,
  })).filter(s => s.value > 0);
}

function SizeGuideTooltip({ gender }: { gender: string | undefined }) {
  const [show, setShow] = useState(false);
  const matchCode = gender ? gender.split('-')[0]?.trim() : '';
  const { rows: sizeGuideRows } = useSizeGuide();
  const SIZE_GUIDE = sizeGuideRows.filter(r => r.is_active);

  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShow(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [show]);

  return (
    <>
      <button
        onClick={() => setShow(true)}
        className="p-0.5 text-gray-300 hover:text-primary-500 transition-colors"
        title="Size guide"
      >
        <Ruler className="w-3 h-3" />
      </button>
      {show && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-8 bg-black/40 backdrop-blur-sm animate-fade-in"
          onClick={() => setShow(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl overflow-hidden animate-scale-in max-w-[800px] w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-gray-900 to-gray-800">
              <div>
                <h3 className="text-sm font-bold text-white">Size Guide</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {matchCode ? `Current: ${gender}` : 'No gender code set'}
                </p>
              </div>
              <button onClick={() => setShow(false)} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="overflow-auto max-h-[60vh]">
              <table className="text-xs w-full border-collapse">
                <thead className="sticky top-0">
                  <tr className="bg-gray-50">
                    <th className="px-4 py-2.5 text-left font-semibold whitespace-nowrap text-gray-600 border-b border-gray-200">Gender</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-gray-600 border-b border-gray-200" colSpan={15}>Size Range</th>
                  </tr>
                </thead>
                <tbody>
                  {SIZE_GUIDE.map(row => {
                    const isMatch = matchCode && row.code === matchCode;
                    return (
                      <tr
                        key={row.code}
                        className={cn(
                          'border-b border-gray-50 transition-colors',
                          isMatch ? 'bg-primary-50 font-semibold' : 'hover:bg-gray-50'
                        )}
                      >
                        <td className={cn('px-4 py-2 whitespace-nowrap font-medium', isMatch ? 'text-primary-700' : 'text-gray-700')}>
                          {row.code}-{row.label}
                          {isMatch && <span className="ml-2 text-[9px] bg-primary-100 text-primary-600 px-1.5 py-0.5 rounded-full font-bold">CURRENT</span>}
                        </td>
                        {row.sizes.map((s, i) => (
                          <td key={i} className={cn('px-2 py-2 text-center whitespace-nowrap', isMatch ? 'text-primary-700' : 'text-gray-500')}>{s}</td>
                        ))}
                        {Array.from({ length: Math.max(0, 15 - row.sizes.length) }).map((_, i) => (
                          <td key={`pad-${i}`} className="px-2 py-2" />
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Sub-components ────────────────────────────────────────

function DetailRow({ label, value, editable, onSave, options, extra, type, rawValue, fieldKey }: {
  label: string;
  value: string | number | null | undefined;
  editable?: boolean;
  onSave?: (value: string) => void;
  options?: string[];
  extra?: React.ReactNode;
  type?: 'text' | 'date';
  rawValue?: string | null;
  /** When passed, enables the bulk-scope picker for date / dropdown fields. */
  fieldKey?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const bulkCtx = useBulkScope();
  // Mirrors EditableCell's rule: any date OR any dropdown is bulkable.
  const isBulkable = !!fieldKey && bulkCtx && (type === 'date' || !!options);

  const startEdit = () => {
    if (type === 'date' && rawValue) {
      setEditValue(rawValue.split('T')[0]);
    } else {
      setEditValue(String(value || ''));
    }
    setEditing(true);
  };

  const handleSave = (val?: string) => {
    onSave?.(val ?? editValue);
    setEditing(false);
  };

  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-500 flex items-center gap-1 flex-shrink-0">{label}{extra}</span>
      {/* When bulkable, the editor is a floating modal — show the row's value
          underneath while the modal is open so the layout doesn't collapse. */}
      {editing && isBulkable && fieldKey && (
        <InlineBulkScopeEditor
          fieldKey={fieldKey}
          type={type}
          options={options}
          initialValue={editValue}
          fieldLabel={label}
          onSavedSingle={(v) => { handleSave(v); }}
          onCancel={() => setEditing(false)}
        />
      )}
      {editing && !isBulkable ? (
        options ? (
          <StatusDropdown
            value={editValue}
            options={options}
            onSave={(v) => handleSave(v)}
            onCancel={() => setEditing(false)}
            size="sm"
          />
        ) : type === 'date' ? (
          <DatePickerInput
            value={editValue}
            onChange={(v) => handleSave(v)}
            onBlur={() => setEditing(false)}
            autoFocus
            size="sm"
          />
        ) : (
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => handleSave()}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
            autoFocus
            className="text-xs border border-primary-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-500 w-[180px] text-right"
          />
        )
      ) : (
        <span
          className={cn(
            'text-xs font-medium text-gray-800 text-right break-words min-w-0',
            editable && 'cursor-pointer hover:text-primary-600'
          )}
          onClick={() => { if (editable) startEdit(); }}
          title={editable ? `${value || '—'} · click to edit` : (typeof value === 'string' ? value : undefined)}
        >
          {value || '—'}
        </span>
      )}
    </div>
  );
}

function TimelineItem({ label, date, note, highlight, editable, onSave, fieldKey }: {
  label: string;
  date: string | null | undefined;
  /** Free-text override (e.g. "ASAP") — displayed in place of the date
   *  when set. Only relevant for note-eligible fields. */
  note?: string | null;
  highlight?: boolean;
  editable?: boolean;
  onSave?: (value: string) => void;
  fieldKey?: string;
}) {
  const [editing, setEditing] = useState(false);
  const hasDate = !!date || !!note;
  const bulkCtx = useBulkScope();
  const isBulkable = !!fieldKey && !!bulkCtx;

  return (
    <div className="flex items-center gap-3 py-2 relative group rounded-lg hover:bg-gray-100 px-1 -mx-1 transition-colors">
      <div className={cn(
        'w-[15px] h-[15px] rounded-full border-2 flex-shrink-0 z-10',
        hasDate
          ? highlight
            ? 'bg-primary-500 border-primary-500'
            : 'bg-white border-primary-300'
          : 'bg-white border-gray-200'
      )}>
        {hasDate && !highlight && <div className="w-full h-full rounded-full bg-primary-100" />}
      </div>
      <div className="flex-1 flex items-center justify-between min-w-0">
        <span className={cn('text-xs', hasDate ? 'text-gray-700 font-medium' : 'text-gray-400')}>{label}</span>
        {editing && isBulkable && fieldKey ? (
          <InlineBulkScopeEditor
            fieldKey={fieldKey}
            type="date"
            initialValue={date ? date.split('T')[0] : ''}
            onSavedSingle={(v) => { onSave?.(v); setEditing(false); }}
            onCancel={() => setEditing(false)}
          />
        ) : editing ? (
          <DatePickerInput
            value={note || (date ? date.split('T')[0] : '')}
            onChange={(v) => { onSave?.(v); setEditing(false); }}
            onBlur={() => setEditing(false)}
            autoFocus
            size="sm"
          />
        ) : (
          <span
            className={cn(
              'text-xs flex-shrink-0 ml-2',
              hasDate ? 'text-gray-900 font-medium' : 'text-gray-300',
              editable && 'cursor-pointer hover:text-primary-600'
            )}
            onClick={() => editable && setEditing(true)}
            title={editable ? 'Click to edit' : undefined}
          >
            {note || formatDate(date)}
          </span>
        )}
      </div>
    </div>
  );
}
