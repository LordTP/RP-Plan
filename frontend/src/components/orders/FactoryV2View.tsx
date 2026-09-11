'use client';

import { useEffect, useState, useCallback, useMemo, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  RefreshCw,
  X,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Package,
  MessageSquare,
  Calendar,
  Truck,
  Clock,
  Eye,
  Layers,
  Grid3X3,
  Plus,
  Trash2,
  Copy,
  Ruler,
  Download,
} from 'lucide-react';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { AppShell } from '@/components/layout/AppShell';
import { CommentSidebar } from '@/components/orders/CommentSidebar';
import { useStore } from '@/store/useStore';
import { ordersApi, statusesApi, settingsApi, componentsApi, excelApi, OrderFilters } from '@/lib/api';
import { LibraryFirstAddModal } from '@/components/orders/LibraryFirstAddModal';
import { ExportOrdersModal } from '@/components/orders/ExportOrdersModal';
import { StatusDropdown } from '@/components/orders/StatusDropdown';
import { InlineComments } from '@/components/orders/InlineComments';
import { cn } from '@/lib/utils';
import type { Order, OrderComponent } from '@/types';
import { COLUMNS, FACTORY_PRODUCT_COLUMNS, FACTORY_SHIPPING_COLUMNS, FIT_SAMPLE_STATUS_OPTIONS, FIT_REQUIRED_OPTIONS, SAMPLE_STATUS_OPTIONS, SAMPLE_STATUS_FIELD_TO_TYPE, SHOW_COSTING } from '@/types';
import { RejectSampleModal } from '@/components/samples/RejectSampleModal';
import { DatePickerInput } from '@/components/ui/DatePickerInput';
import { HeroTile, SectionPill, SectionHeader, SectionDivider, SampleCard } from '@/components/orders/v2-detail-helpers';
import { StatusTile, Chip, Opt, TogglePill, Segmented, StatusBar, BulkBar } from '@/components/orders/v2-list-primitives';
import {
  OrderTableV2,
  sortGroups,
  compareStyles,
  effectiveExFactory,
  matchesExFacWindow,
  statusDotHex,
  getStatusStyle,
  timeAgo,
  formatDate,
  formatCurrency,
  formatQty,
  EXFAC_WINDOW_LABEL,
  type POGroup,
  type SortKey,
  type ExFacWindow,
} from '@/components/orders/v2-list-shared';
import { AttemptBadge } from '@/components/samples/AttemptBadge';
import { RejectionContextBanner } from '@/components/samples/RejectionContextBanner';
import { AttemptHistory } from '@/components/samples/AttemptHistory';
import { submissionsApi, type SampleSubmission, type SampleType } from '@/lib/api';
import { SupplierChangeTracker } from '@/components/supplier/SupplierChangeTracker';

// ─── Helpers ───────────────────────────────────────────────







// ─── Types ─────────────────────────────────────────────────


// ─── Public Props ──────────────────────────────────────────

export type FactoryViewType = 'factory-product' | 'factory-shipping';

interface FactoryV2ViewProps {
  viewType: FactoryViewType;
}

// ─── Main Export ───────────────────────────────────────────

export function FactoryV2View({ viewType }: FactoryV2ViewProps) {
  return (
    <Suspense fallback={<FactoryLoading viewType={viewType} />}>
      <FactoryV2Content viewType={viewType} />
    </Suspense>
  );
}

function FactoryLoading({ viewType }: { viewType: FactoryViewType }) {
  const title = viewType === 'factory-product' ? 'Factory Product' : 'Factory Shipping';
  return (
    <AppShell title={title} subtitle="v2">
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Loading orders...</p>
        </div>
      </div>
    </AppShell>
  );
}

// ─── Content ───────────────────────────────────────────────

function FactoryV2Content({ viewType }: { viewType: FactoryViewType }) {
  const router = useRouter();
  const { user, setSelectedOrder, setSidebarOpen } = useStore();

  const isProductView = viewType === 'factory-product';
  const viewTitle = isProductView ? 'Factory Product' : 'Factory Shipping';
  // ?view=table tells /factory-product's PageGuard to show the legacy table
  // instead of bouncing suppliers back to V2.
  const tableRoute = isProductView ? '/factory-product?view=table' : '/factory-shipping';

  // Always local state — never touches global store
  const [orders, setOrders] = useState<Order[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);

  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [statuses, setStatuses] = useState<string[]>([]);
  const [expandedPOs, setExpandedPOs] = useState<Set<string>>(new Set());
  const [selectedStyleId, setSelectedStyleId] = useState<number | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [supplierColumnSettings, setSupplierColumnSettings] = useState<{ column_key: string; is_visible: boolean; is_editable: boolean }[]>([]);

  // Reason modal state for supplier date edits (existing inline-edit flow)
  const [reasonModal, setReasonModal] = useState<{ orderId: number; field: string; value: string } | null>(null);
  const [changeReason, setChangeReason] = useState('');
  const [isSavingReason, setIsSavingReason] = useState(false);

  // Supplier-only "Request date change" modal — opened by the orange calendar
  // button on each style row. Lets the supplier pick which date field to
  // change, the new value, reason, and scope (this style / all on PO /
  // selected). Reuses the same submit handler (handleReasonSubmit) by
  // populating the existing reasonModal state on submit.
  const [dateReqModal, setDateReqModal] = useState<{ orderId: number } | null>(null);
  const [dateReqField, setDateReqField] = useState<string>('revised_po_ex_factory');
  const [dateReqValue, setDateReqValue] = useState<string>('');

  // ─── List rework state (Sep 2026) ───────────────────────────────────
  // Mirrors /orders-v2. Factory keeps its own copy rather than sharing a
  // hook because the surrounding data flow differs (local state, no
  // global store) — the shared parts are the table + model, not this.
  const [customerF, setCustomerF] = useState<string | null>(null);
  const [exFacWindow, setExFacWindow] = useState<ExFacWindow>('');
  const [lateOnly, setLateOnly] = useState(false);
  const [missingDatesOnly, setMissingDatesOnly] = useState(false);
  const [groupByPO, setGroupByPO] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('exfac');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const lastClickedId = useRef<number | null>(null);

  const toggleSort = useCallback((key: string) => {
    const k = key as SortKey;
    setSortKey((prev) => {
      if (prev === k) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDir(k === 'qty' || k === 'value' ? 'desc' : 'asc');
      return k;
    });
  }, []);
  // Bumped after every successful date request, to nudge SupplierChangeTracker
  // to re-fetch and show the new pending entry.
  const [trackerRefreshKey, setTrackerRefreshKey] = useState(0);

  const isSupplier = user?.role === 'supplier';

  // Load statuses + supplier settings
  useEffect(() => {
    statusesApi.getStatuses().then(res => setStatuses(res.statuses)).catch(console.error);
    if (isSupplier) {
      settingsApi.getRoleColumns('supplier')
        .then(res => setSupplierColumnSettings(res.columns))
        .catch(console.error);
    }
  }, [isSupplier]);

  // Load orders
  const loadOrders = useCallback(async (filters?: OrderFilters) => {
    setIsLoading(true);
    try {
      // Same reason as /orders-v2 — client-side grouping + search need the
      // full working set so cross-book search always finds a matching PO.
      const response = await ordersApi.getOrders(1, 5000, filters || {});
      setOrders(response.orders);
      setTotalOrders(response.total);
    } catch (error) {
      console.error('Failed to load orders:', error);
      toast.error('Failed to load orders');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, []);

  // Group orders by PO number
  const poGroups = useMemo(() => {
    let filtered = orders;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(o =>
        o.po_number?.toLowerCase().includes(q) ||
        o.customer?.toLowerCase().includes(q) ||
        o.style_code?.toLowerCase().includes(q) ||
        o.factory?.toLowerCase().includes(q) ||
        o.description?.toLowerCase().includes(q) ||
        o.colour?.toLowerCase().includes(q)
      );
    }

    // 'open' = anything not shipped/done, so mixed POs still surface via
    // their non-shipped lines. 'shipped' isolates shipped only.
    const TERMINAL_STATUSES = new Set(['Shipped', 'Delivered', 'Complete', 'Completed', 'Cancelled']);
    if (statusFilter === 'open') {
      filtered = filtered.filter(o => !TERMINAL_STATUSES.has(o.status || ''));
    } else if (statusFilter === 'shipped') {
      filtered = filtered.filter(o => o.status === 'Shipped');
    } else if (statusFilter !== 'all') {
      filtered = filtered.filter(o => o.status === statusFilter);
    }

    // Chip filters — line-level, so a mixed PO survives if any of its
    // styles match. No factory chip here: a supplier only ever sees their
    // own factory, so it would be a one-option dropdown.
    if (customerF) filtered = filtered.filter(o => (o.customer || '') === customerF);
    if (exFacWindow) filtered = filtered.filter(o => matchesExFacWindow(o, exFacWindow));
    if (lateOnly) filtered = filtered.filter(o => !!o.is_late);
    if (missingDatesOnly) filtered = filtered.filter(o => !effectiveExFactory(o));

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
      const exFactory = order.revised_po_ex_factory || order.original_po_ex_factory;
      // Track EARLIEST ex-factory across the PO's styles so the sort
      // surfaces the most urgent PO first. Field name kept as latestDate
      // to minimise churn; semantically it's now "earliest".
      if (exFactory && (!groups[po].latestDate || exFactory < groups[po].latestDate)) {
        groups[po].latestDate = exFactory;
      }
    }

    for (const group of Object.values(groups)) {
      const statusCounts: Record<string, number> = {};
      for (const s of group.styles) {
        const st = s.status || 'Unknown';
        statusCounts[st] = (statusCounts[st] || 0) + 1;
      }
      const entries = Object.entries(statusCounts).sort((a, b) => b[1] - a[1]);
      if (entries.length >= 1) {
        group.statusSummary = entries[0][0];
      }
    }

    // Earliest ex-factory first, no-ex-factory at bottom, tie-break by
    // most recent update.
    return Object.values(groups).sort((a, b) => {
      if (a.latestDate && b.latestDate) return a.latestDate.localeCompare(b.latestDate);
      if (a.latestDate && !b.latestDate) return -1;
      if (!a.latestDate && b.latestDate) return 1;
      return b.latestUpdate.localeCompare(a.latestUpdate);
    });
  }, [orders, searchQuery, statusFilter, customerF, exFacWindow, lateOnly, missingDatesOnly]);

  const statusCounts = useMemo(() => {
    // Line-level counts (this view aggregates by line, not PO).
    const TERMINAL_STATUSES = new Set(['Shipped', 'Delivered', 'Complete', 'Completed', 'Cancelled']);
    const counts: Record<string, number> = { all: orders.length, open: 0, shipped: 0 };
    for (const o of orders) {
      const s = o.status || 'Unknown';
      counts[s] = (counts[s] || 0) + 1;
      if (!TERMINAL_STATUSES.has(o.status || '')) counts.open += 1;
      if (o.status === 'Shipped') counts.shipped += 1;
    }
    return counts;
  }, [orders]);

  // ─── Tiles, chips, sorting, selection ───────────────────────────────
  // Tile counts are PO-level (unlike statusCounts above, which this view
  // keeps line-level for its existing chips) and come off the UNFILTERED
  // set so the row keeps showing the whole picture while drilled in.
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
    for (const o of orders) {
      if (!o.is_late) continue;
      pos.add(o.po_number);
      units += o.total_quantity || 0;
    }
    return { poCount: pos.size, units };
  }, [orders]);

  const openPoCount = useMemo(() => {
    const TERMINAL = new Set(['Shipped', 'Delivered', 'Complete', 'Completed', 'Cancelled']);
    const pos = new Set<string>();
    for (const o of orders) if (!TERMINAL.has(o.status || '')) pos.add(o.po_number);
    return pos.size;
  }, [orders]);

  const allPoCount = useMemo(() => new Set(orders.map(o => o.po_number)).size, [orders]);

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

  const anyFilter = !!(customerF || exFacWindow || lateOnly || missingDatesOnly || searchQuery.trim());

  const clearFilters = () => {
    setCustomerF(null);
    setExFacWindow('');
    setLateOnly(false);
    setMissingDatesOnly(false);
    setSearchQuery('');
  };

  const visibleTotals = useMemo(() => {
    let styles = 0, units = 0, value = 0;
    for (const g of poGroups) {
      styles += g.styles.length;
      units += g.totalQty;
      value += g.totalValue;
    }
    return { pos: poGroups.length, styles, units, value };
  }, [poGroups]);

  const sortedGroups = useMemo(() => sortGroups(poGroups, sortKey, sortDir), [poGroups, sortKey, sortDir]);

  const flatRows = useMemo(
    () => poGroups.flatMap(g => g.styles).sort((a, b) => compareStyles(a, b, sortKey, sortDir)),
    [poGroups, sortKey, sortDir],
  );

  const selectableRows = useMemo(() => {
    if (!groupByPO) return flatRows;
    return sortedGroups.flatMap(g => expandedPOs.has(g.po_number) ? g.styles : []);
  }, [groupByPO, flatRows, sortedGroups, expandedPOs]);

  const toggleRow = useCallback((order: Order, shiftKey: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const anchor = lastClickedId.current;
      if (shiftKey && anchor != null && anchor !== order.id) {
        const ids = selectableRows.map(r => r.id);
        const from = ids.indexOf(anchor);
        const to = ids.indexOf(order.id);
        if (from !== -1 && to !== -1) {
          const [lo, hi] = from < to ? [from, to] : [to, from];
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

  // Drop selection that's been filtered out from under the user so a bulk
  // action can't hit rows they can no longer see.
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(allVisibleIds);
      let changed = false;
      const next = new Set<number>();
      Array.from(prev).forEach((id) => {
        if (visible.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [allVisibleIds]);

  const togglePO = (po: string) => {
    setExpandedPOs(prev => {
      const next = new Set(prev);
      if (next.has(po)) next.delete(po);
      else next.add(po);
      return next;
    });
  };

  const handleStyleClick = (order: Order) => {
    // Suppliers now get a supplier-safe detail panel — pricing rows and
    // the internal-only value column are already hidden inside DetailPanel
    // via its isSupplier prop. Editing dates still routes through the
    // change-request modal because sample lifecycle stays Source Lab's.
    setSelectedStyleId(order.id);
  };

  const openDateRequest = (order: Order) => {
    setDateReqModal({ orderId: order.id });
    // Default to the most common editable field; supplier can change it
    // inside the modal if more than one is allowed.
    setDateReqField('revised_po_ex_factory');
    setDateReqValue('');
    setChangeReason('');
    setReasonApplyMode('single');
    setReasonSelectedIds([]);
  };

  // Compute which date fields the supplier is allowed to edit, based on the
  // settings loaded from the backend. Cross-reference with COLUMNS to find
  // the labels and ensure they're date-typed.
  const supplierEditableDateFields = useMemo(() => {
    const editable = supplierColumnSettings.filter(s => s.is_editable).map(s => s.column_key);
    // If no settings loaded yet, fall back to the backend default
    const fallback = ['revised_po_ex_factory', 'factory_confirmed_ex_factory'];
    const keys = editable.length > 0 ? editable : fallback;
    return keys
      .map(k => COLUMNS.find(c => c.key === k))
      .filter((c): c is NonNullable<typeof c> => !!c && c.type === 'date');
  }, [supplierColumnSettings]);

  const handleCommentClick = (order: Order) => {
    setSelectedOrder(order);
    setSidebarOpen(true);
    if (order.unread_comment_count && order.unread_comment_count > 0) {
      const updated = { ...order, unread_comment_count: 0 };
      setOrders(prev => prev.map(o => o.id === order.id ? updated : o));
    }
    ordersApi.markCommentsRead(order.id).catch(console.error);
  };

  const selectedStyle = useMemo(() => {
    if (!selectedStyleId) return null;
    return orders.find(o => o.id === selectedStyleId) || null;
  }, [selectedStyleId, orders]);

  // Drawer stays mounted through its slide-out so the transition plays.
  // Must match the duration on the drawer's transition-transform class.
  const DRAWER_ANIM_MS = 300;
  const [drawerClosing, setDrawerClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const closeDrawer = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setDrawerClosing(true);
    closeTimer.current = setTimeout(() => {
      setSelectedStyleId(null);
      setDrawerClosing(false);
      closeTimer.current = null;
    }, DRAWER_ANIM_MS);
  }, []);

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  // Prev/next follow the rendered order under the current filters, not
  // raw id order.
  const flatStyles = useMemo(() => sortedGroups.flatMap(g => g.styles), [sortedGroups]);

  const { prevStyle, nextStyle } = useMemo(() => {
    if (selectedStyleId == null) return { prevStyle: null, nextStyle: null };
    const i = flatStyles.findIndex(s => s.id === selectedStyleId);
    if (i === -1) return { prevStyle: null, nextStyle: null };
    return {
      prevStyle: i > 0 ? flatStyles[i - 1] : null,
      nextStyle: i < flatStyles.length - 1 ? flatStyles[i + 1] : null,
    };
  }, [flatStyles, selectedStyleId]);

  const [isExportingSelection, setIsExportingSelection] = useState(false);

  /** Export exactly the ticked styles rather than every style on their
   *  POs — a chase list should stay a chase list. */
  const exportSelection = async () => {
    if (selectedIds.size === 0) return;
    setIsExportingSelection(true);
    try {
      const blob = await excelApi.exportExcel({ order_ids: Array.from(selectedIds) });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `factory_selection_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Exported ${selectedIds.size} style${selectedIds.size === 1 ? '' : 's'}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Export failed');
    } finally {
      setIsExportingSelection(false);
    }
  };

  const handleRefresh = () => {
    loadOrders();
    toast.success('Orders refreshed');
  };

  const handleDetailSave = async (orderId: number, field: string, value: any) => {
    // Sentinel used by child components (e.g. rejection flow) to force a refresh
    // of the order row after an out-of-band mutation — no actual field change.
    if (field === '__refresh__') {
      try {
        const fresh = await ordersApi.getOrder(orderId);
        setOrders(prev => prev.map(o => o.id === fresh.id ? fresh : o));
      } catch {
        // Silent — a failed refresh doesn't break the UI, just leaves stale state.
      }
      return;
    }

    // For supplier date edits, show the reason modal instead of saving directly
    const col = COLUMNS.find(c => c.key === field);
    if (isSupplier && col?.type === 'date') {
      setReasonModal({ orderId, field, value });
      setChangeReason('');
      return;
    }

    try {
      const result = await ordersApi.updateOrder(orderId, { [field]: value });
      if (result && typeof result === 'object' && 'pending_approval' in result && result.pending_approval) {
        toast.success(result.message || 'Date change submitted for approval');
      } else {
        const updatedOrder = result as Order;
        setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
        toast.success('Updated successfully');
      }
    } catch (error: any) {
      const msg = error?.response?.data?.detail || 'Failed to update';
      toast.error(msg);
    }
  };

  // Submit handler for the reason modal (supplier date edits)
  const handleReasonSubmit = async () => {
    if (!reasonModal || !changeReason.trim()) return;
    setIsSavingReason(true);
    try {
      if (reasonApplyMode !== 'single' && reasonModal.orderId) {
        // Find the order to get its PO number
        const order = orders.find(o => o.id === reasonModal.orderId);
        if (!order) return;
        const orderIdsToUpdate = reasonApplyMode === 'all'
          ? [] // Empty = all on PO
          : reasonSelectedIds;
        const result = await ordersApi.bulkUpdateDate(
          order.po_number,
          reasonModal.field,
          reasonModal.value,
          orderIdsToUpdate,
          changeReason
        );
        if (result.pending_approval) {
          toast.success(result.message || 'Date change submitted for approval');
        } else {
          toast.success(`Updated ${result.orders_updated} styles`);
        }
        // Refresh to pick up changes
        loadOrders();
      } else {
        const result = await ordersApi.updateOrder(reasonModal.orderId, {
          [reasonModal.field]: reasonModal.value,
          change_reason: changeReason,
        });
        if (result && typeof result === 'object' && 'pending_approval' in result && result.pending_approval) {
          toast.success(result.message || 'Date change submitted for approval');
        } else {
          const updatedOrder = result as Order;
          setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
          toast.success('Updated successfully');
        }
      }
      setReasonModal(null);
      setChangeReason('');
      setReasonApplyMode('single');
      setReasonSelectedIds([]);
      setReasonStylesOnPO([]);
    } catch (error: any) {
      const msg = error?.response?.data?.detail || 'Failed to update';
      toast.error(msg);
    } finally {
      setIsSavingReason(false);
    }
  };

  // Bulk apply state for reason modal
  const [reasonApplyMode, setReasonApplyMode] = useState<'single' | 'all' | 'selected'>('single');
  const [reasonSelectedIds, setReasonSelectedIds] = useState<number[]>([]);
  const [reasonStylesOnPO, setReasonStylesOnPO] = useState<{ id: number; style_code: string; description: string; colour: string }[]>([]);
  const [loadingReasonStyles, setLoadingReasonStyles] = useState(false);

  // Load styles on PO when reason modal OR date request modal opens
  useEffect(() => {
    const openOrderId = reasonModal?.orderId ?? dateReqModal?.orderId;
    if (openOrderId) {
      const order = orders.find(o => o.id === openOrderId);
      if (order?.po_number) {
        setLoadingReasonStyles(true);
        ordersApi.getStylesOnPO(order.po_number)
          .then(res => setReasonStylesOnPO(res.orders))
          .catch(console.error)
          .finally(() => setLoadingReasonStyles(false));
      }
    }
  }, [reasonModal, dateReqModal, orders]);

  return (
    <AppShell title={viewTitle} subtitle="v2">

      {/* Reason Modal for supplier date edits */}
      {reasonModal && (() => {
        const modalOrder = orders.find(o => o.id === reasonModal.orderId);
        const fieldCol = COLUMNS.find(c => c.key === reasonModal.field);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-xl shadow-xl w-[440px] max-h-[80vh] overflow-y-auto p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Edit {fieldCol?.label || reasonModal.field}
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                {modalOrder?.po_number} · {modalOrder?.style_code}
              </p>

              {/* Date value */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">New Date</label>
                <DatePickerInput
                  value={reasonModal.value?.split('T')[0] || ''}
                  onChange={(v) => setReasonModal({ ...reasonModal, value: v })}
                  variant="block"
                  size="md"
                />
              </div>

              {/* Reason */}
              <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <label className="block text-sm font-medium text-orange-800 mb-2">
                  Reason for date change <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-orange-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm resize-none"
                  placeholder="e.g., Factory delay due to material shortage"
                />
                <p className="text-xs text-orange-600 mt-1">
                  This change will require approval from Sourcelab
                </p>
              </div>

              {/* Bulk apply options */}
              {reasonStylesOnPO.length > 1 && (
                <div className="mb-4 border-t pt-4">
                  <p className="text-sm font-medium text-gray-700 mb-3">Apply to:</p>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="reasonApplyMode"
                        value="single"
                        checked={reasonApplyMode === 'single'}
                        onChange={() => setReasonApplyMode('single')}
                        className="w-4 h-4 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-700">
                        This style only ({modalOrder?.style_code})
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="reasonApplyMode"
                        value="all"
                        checked={reasonApplyMode === 'all'}
                        onChange={() => setReasonApplyMode('all')}
                        className="w-4 h-4 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-700">
                        All styles on this PO ({reasonStylesOnPO.length} styles)
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="reasonApplyMode"
                        value="selected"
                        checked={reasonApplyMode === 'selected'}
                        onChange={() => setReasonApplyMode('selected')}
                        className="w-4 h-4 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-700">Selected styles</span>
                    </label>

                    {reasonApplyMode === 'selected' && (
                      <div className="ml-6 space-y-1.5 max-h-40 overflow-y-auto">
                        {reasonStylesOnPO.map((style) => {
                          const isCurrent = style.id === reasonModal.orderId;
                          return (
                            <label key={style.id} className={cn('flex items-center gap-2', isCurrent ? 'cursor-default' : 'cursor-pointer')}>
                              <input
                                type="checkbox"
                                checked={isCurrent || reasonSelectedIds.includes(style.id)}
                                disabled={isCurrent}
                                onChange={(e) => {
                                  if (isCurrent) return;
                                  setReasonSelectedIds(prev =>
                                    e.target.checked
                                      ? [...prev, style.id]
                                      : prev.filter(id => id !== style.id)
                                  );
                                }}
                                className="w-3.5 h-3.5 text-primary-600 focus:ring-primary-500 rounded disabled:opacity-60"
                              />
                              <span className={cn('text-xs', isCurrent ? 'text-gray-500' : 'text-gray-600')}>
                                {style.style_code} · {style.colour} — {style.description}
                              </span>
                              {isCurrent && <span className="text-[10px] font-semibold text-primary-700 bg-primary-50 px-1.5 py-0.5 rounded">this style</span>}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setReasonModal(null);
                    setChangeReason('');
                    setReasonApplyMode('single');
                    setReasonSelectedIds([]);
                  }}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  disabled={isSavingReason}
                >
                  Cancel
                </button>
                <button
                  onClick={handleReasonSubmit}
                  disabled={isSavingReason || !changeReason.trim() || (reasonApplyMode === 'selected' && reasonSelectedIds.length === 0)}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSavingReason ? 'Saving...' : reasonApplyMode === 'all'
                    ? `Submit (${reasonStylesOnPO.length} styles)`
                    : reasonApplyMode === 'selected'
                      ? `Submit (${reasonSelectedIds.length + 1} styles)`
                      : 'Submit for Approval'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Supplier Date Request Modal — opened by the orange calendar button.
          Lets the supplier pick which date field to change + new value +
          reason + scope, and submits via bulkUpdateDate (which creates
          PendingDateChange rows for Source Lab to approve). */}
      {dateReqModal && (() => {
        const modalOrder = orders.find(o => o.id === dateReqModal.orderId);
        if (!modalOrder) return null;
        // Suppliers always request a change to Revised Ex-Factory only —
        // no field picker. Other date fields are admin/internal-only.
        const REVISED_EX_FAC_FIELD = 'revised_po_ex_factory';
        const REVISED_EX_FAC_LABEL = 'Revised Ex-Factory';
        const currentValue = modalOrder.revised_po_ex_factory;
        const submit = async () => {
          if (!changeReason.trim() || !dateReqValue) return;
          setIsSavingReason(true);
          try {
            const orderIdsToUpdate = reasonApplyMode === 'single'
              ? [modalOrder.id]
              : reasonApplyMode === 'all'
                ? [] // empty = all on PO
                : [modalOrder.id, ...reasonSelectedIds];
            const res = await ordersApi.bulkUpdateDate(
              modalOrder.po_number,
              REVISED_EX_FAC_FIELD,
              dateReqValue,
              orderIdsToUpdate,
              changeReason,
            );
            toast.success(res.message || 'Date change submitted for approval');
            loadOrders();
            setTrackerRefreshKey(k => k + 1);
            setDateReqModal(null);
            setChangeReason('');
            setDateReqValue('');
            setReasonApplyMode('single');
            setReasonSelectedIds([]);
          } catch (err: any) {
            toast.error(err?.response?.data?.detail || 'Failed to submit date change');
          } finally {
            setIsSavingReason(false);
          }
        };
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-xl shadow-xl w-[480px] max-h-[85vh] overflow-y-auto p-6">
              {/* Header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-5 h-5 text-orange-600" strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Request {REVISED_EX_FAC_LABEL} change</h3>
                  <p className="text-xs text-gray-500">{modalOrder.po_number} · {modalOrder.style_code}</p>
                </div>
              </div>

              {/* Approval warning */}
              <div className="mb-4 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg flex items-start gap-2 text-[12px] text-orange-800">
                <Clock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>This change requires approval from Source Lab. They'll be notified once you submit.</span>
              </div>

              {/* Current value (read-only context) */}
              <div className="mb-3 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-between text-[12px]">
                <span className="text-gray-500">Current {REVISED_EX_FAC_LABEL}</span>
                <span className="font-semibold text-gray-900">{formatDate(currentValue)}</span>
              </div>

              {/* New date */}
              <div className="mb-3">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">New date</label>
                <DatePickerInput
                  value={dateReqValue}
                  onChange={(v) => setDateReqValue(v || '')}
                  variant="block"
                />
              </div>

              {/* Reason */}
              <div className="mb-4">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">
                  Reason <span className="text-red-500 normal-case">*</span>
                </label>
                <textarea
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  rows={3}
                  placeholder="e.g. Fabric mill delay — knitting starts 1 week late"
                  className="w-full px-3 py-2 text-sm border-2 border-orange-200 rounded-lg focus:outline-none focus:border-orange-400 placeholder:text-gray-400"
                />
              </div>

              {/* Scope */}
              <div className="mb-5">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Apply to</label>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                    <input
                      type="radio"
                      checked={reasonApplyMode === 'single'}
                      onChange={() => setReasonApplyMode('single')}
                      className="text-orange-600 focus:ring-orange-500"
                    />
                    This style only
                  </label>
                  <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                    <input
                      type="radio"
                      checked={reasonApplyMode === 'all'}
                      onChange={() => setReasonApplyMode('all')}
                      className="text-orange-600 focus:ring-orange-500"
                    />
                    All styles on {modalOrder.po_number}
                  </label>
                  <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                    <input
                      type="radio"
                      checked={reasonApplyMode === 'selected'}
                      onChange={() => setReasonApplyMode('selected')}
                      className="text-orange-600 focus:ring-orange-500"
                    />
                    Specific styles
                  </label>
                  {reasonApplyMode === 'selected' && (
                    <div className="ml-6 mt-2 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-1">
                      {reasonStylesOnPO.map(s => {
                        const isCurrent = s.id === modalOrder.id;
                        return (
                          <label key={s.id} className={cn('flex items-center gap-2 text-[12px] px-2 py-1 rounded', isCurrent ? 'cursor-default' : 'cursor-pointer hover:bg-gray-50')}>
                            <input
                              type="checkbox"
                              checked={isCurrent || reasonSelectedIds.includes(s.id)}
                              disabled={isCurrent}
                              onChange={() => {
                                if (isCurrent) return;
                                setReasonSelectedIds(prev =>
                                  prev.includes(s.id) ? prev.filter(id => id !== s.id) : [...prev, s.id]
                                );
                              }}
                              className="text-orange-600 focus:ring-orange-500 disabled:opacity-60"
                            />
                            <span className={cn('font-medium', isCurrent && 'text-gray-500')}>{s.style_code}</span>
                            <span className="text-gray-500">{s.colour}</span>
                            {isCurrent && <span className="ml-auto text-[10px] font-semibold text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded">this style</span>}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setDateReqModal(null);
                    setChangeReason('');
                    setDateReqValue('');
                    setReasonApplyMode('single');
                    setReasonSelectedIds([]);
                  }}
                  disabled={isSavingReason}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={submit}
                  disabled={
                    isSavingReason ||
                    !changeReason.trim() ||
                    !dateReqValue ||
                    (reasonApplyMode === 'selected' && reasonSelectedIds.length === 0)
                  }
                  className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-orange-600 rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSavingReason ? 'Submitting...' : 'Submit for approval'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="flex gap-6 overflow-hidden" style={{ height: 'calc(100vh - 116px)' }}>

        {/* ─── Order List ─── */}
        <div className="flex flex-col min-w-0 w-full">

          {/* Supplier date-change tracker — three columns (pending / approved /
              rejected). Bumps refreshKey after each successful date request so
              the supplier sees their submission appear immediately. */}
          {isSupplier && <SupplierChangeTracker refreshKey={trackerRefreshKey} />}

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

            <button
              onClick={() => router.push(tableRoute)}
              className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <Grid3X3 className="w-4 h-4" />
              Table View
            </button>
          </div>

          {/* Status tiles — KPI cards that double as the status filter. */}
          <div
            className="grid gap-2 mb-3 shrink-0"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}
          >
            <StatusTile
              label="Open orders"
              count={openPoCount}
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
                  isSupplier
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
                secondary={`${lateTile.units.toLocaleString()} units`}
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

          {/* Order table */}
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
                rowExtra={isSupplier ? (style) => (
                  <button
                    onClick={(e) => { e.stopPropagation(); openDateRequest(style); }}
                    className="p-1 hover:bg-amber-50 rounded transition-colors"
                    title="Request a date change"
                  >
                    <Calendar className="w-3.5 h-3.5 text-amber-500" />
                  </button>
                ) : undefined}
              />
            )}
          </div>

          <StatusBar
            segments={[
              `${visibleTotals.pos} of ${allPoCount} POs`,
              `${visibleTotals.styles} styles · ${visibleTotals.units.toLocaleString()} units`,
              isSupplier ? null : formatCurrency(visibleTotals.value),
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
            viewType={viewType}
            onSave={handleDetailSave}
            supplierColumnSettings={supplierColumnSettings}
            onCommentCountChange={(orderId, commentCount, unreadCount) => {
              setOrders(prev => prev.map(o => o.id === orderId ? { ...o, comment_count: commentCount, unread_comment_count: unreadCount } : o));
            }}
          />
        )}
      </div>

      {/* Floating bulk bar. Suppliers get Export only — every date they
          can touch goes through the approval queue, and that flow needs a
          per-field reason, which the existing Request-date-change modal
          already handles properly (including its own scope picker). A
          second, shallower path to the same thing would just be a way to
          submit worse requests. */}
      <div
        className={cn(
          'fixed left-1/2 -translate-x-1/2 bottom-6 z-40 transition-all duration-200',
          selectedIds.size > 0 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none',
        )}
      >
        <BulkBar
          count={selectedIds.size}
          onClear={() => { setSelectedIds(new Set()); lastClickedId.current = null; }}
        >
          <button
            onClick={exportSelection}
            disabled={isExportingSelection}
            className="px-2.5 py-1 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 whitespace-nowrap transition-colors disabled:opacity-40"
            title="Export exactly these styles to Excel"
          >
            {isExportingSelection ? 'Exporting…' : 'Export'}
          </button>
        </BulkBar>
      </div>

      <CommentSidebar />

      <ExportOrdersModal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        filenamePrefix={viewType === 'factory-shipping' ? 'factory-shipping' : 'factory-product'}
      />
    </AppShell>
  );
}

// ─── PO Card ───────────────────────────────────────────────


// ─── Size Guide ───────────────────────────────────────────

const SIZE_SLOT_KEYS: (keyof Order)[] = [
  'size_2xs', 'size_xs', 'size_s', 'size_m', 'size_l', 'size_xl',
  'size_2xl', 'size_3xl', 'size_4xl', 'size_5xl', 'size_11', 'size_12', 'size_13', 'size_14',
];
const DEFAULT_SIZE_LABELS = ['2XS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', 'S11', 'S12', 'S13', 'S14'];

// SIZE_GUIDE comes from the DB (admin manages in /settings → Size Guide).
// Callers pass the rows in to getSizeBreakdown instead of using a global.
import type { SizeGuideRow } from '@/lib/api';
import { useSizeGuide } from '@/lib/useSizeGuide';

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

// ─── Detail Panel ──────────────────────────────────────────

function DetailPanel({
  order,
  onClose,
  onCommentClick,
  isSupplier,
  viewType,
  onSave,
  supplierColumnSettings,
  onCommentCountChange,
  closing = false,
  onPrev,
  onNext,
}: {
  order: Order;
  onClose: () => void;
  onCommentClick: () => void;
  isSupplier: boolean;
  viewType: FactoryViewType;
  onSave?: (orderId: number, field: string, value: any) => void;
  supplierColumnSettings: { column_key: string; is_visible: boolean; is_editable: boolean }[];
  onCommentCountChange?: (orderId: number, commentCount: number, unreadCount: number) => void;
  /** Parent is animating the drawer out — it stays mounted for the slide. */
  closing?: boolean;
  /** Page to the previous/next style in the visible list. Null at either end. */
  onPrev?: (() => void) | null;
  onNext?: (() => void) | null;
}) {
  const allowedCols = viewType === 'factory-product'
    ? new Set(FACTORY_PRODUCT_COLUMNS)
    : new Set(FACTORY_SHIPPING_COLUMNS);
  const hasCol = (key: string) => allowedCols.has(key);

  const orderSentToFactory = !!(order.order_sent_to_factory_date && order.tech_packs_sent_to_factory && order.specs_sent_to_factory);

  const canEdit = (key: string) => {
    if (isSupplier) {
      if (!orderSentToFactory) return false;
      if (supplierColumnSettings.length > 0) {
        const setting = supplierColumnSettings.find(s => s.column_key === key);
        return setting?.is_editable ?? false;
      }
      const col = COLUMNS.find(c => c.key === key);
      return col?.supplierEditable ?? false;
    }
    const col = COLUMNS.find(c => c.key === key);
    return col?.editable ?? false;
  };

  const [hasComponents, setHasComponents] = useState(false);
  const [modalTab, setModalTab] = useState<'details' | 'comments'>('details');
  const modalContentRef = useRef<HTMLDivElement>(null);

  // Section refs + active-section state powering the sticky pill nav.
  const productRef = useRef<HTMLElement>(null);
  const samplingRef = useRef<HTMLElement>(null);
  const shippingRef = useRef<HTMLElement>(null);
  const timelineRef = useRef<HTMLElement>(null);
  const [activeSection, setActiveSection] = useState<'product' | 'sampling' | 'shipping' | 'timeline'>('product');
  const sectionRefs = { product: productRef, sampling: samplingRef, shipping: shippingRef, timeline: timelineRef } as const;

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
      const threshold = scrollerTop + 60;
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
  }, [modalTab]);

  // Order-level submissions (component_id IS NULL). We only care about these for the
  // rejection flow on PPS (always order-level) and on fit/strike/lab for orders without components.
  const [orderSubmissions, setOrderSubmissions] = useState<SampleSubmission[]>([]);
  const [rejectModal, setRejectModal] = useState<{ sampleType: SampleType; currentAttemptNo: number } | null>(null);

  const loadOrderSubmissions = useCallback(async () => {
    try {
      const res = await submissionsApi.getForOrder(order.id);
      setOrderSubmissions(res.submissions.filter(s => s.component_id === null));
    } catch {
      // Silent — dormant until first rejection.
    }
  }, [order.id]);

  useEffect(() => { loadOrderSubmissions(); }, [loadOrderSubmissions]);

  const orderLevelCurrentAttempt = (sampleType: SampleType): number => {
    const matching = orderSubmissions.filter(s => s.sample_type === sampleType);
    if (matching.length === 0) return 1;
    return Math.max(...matching.map(s => s.attempt_no));
  };

  const handleSampleStatusSave = (field: string, value: any) => {
    const sampleType = SAMPLE_STATUS_FIELD_TO_TYPE[field];
    if (value === 'REJECTED' && sampleType) {
      setRejectModal({ sampleType, currentAttemptNo: orderLevelCurrentAttempt(sampleType) });
      return;
    }
    onSave?.(order.id, field, value);
  };

  const statusStyle = getStatusStyle(order.status);

  const { rows: sizeGuideRows } = useSizeGuide();
  const sizes = getSizeBreakdown(order, sizeGuideRows);
  const maxSize = Math.max(...sizes.map(s => s.value || 0), 1);

  // Hero strip computations (sampling progress + ex-fac countdown).
  // Fit is always order-level; Strike + Lab roll up from components when those
  // exist, otherwise read directly from the order.
  const sampleProgress = useMemo(() => {
    const items: { label: string; done: boolean }[] = [];
    if (hasCol('fit_sample_status')) {
      const s = (order.fit_sample_status || '').toUpperCase();
      items.push({ label: 'Fit', done: s === 'APPROVED' || s === 'NOT REQUIRED' });
    }
    if (!hasComponents) {
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
  }, [order, hasCol, hasComponents]);
  const sampleDone = sampleProgress.filter(s => s.done).length;
  const sampleTotal = sampleProgress.length;
  const samplePending = sampleTotal - sampleDone;

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
    : daysToExFac < 0 ? 'border-red-200 bg-red-50/30'
    : daysToExFac < 7 ? 'border-amber-200 bg-amber-50/30'
    : 'border-gray-200 bg-white';

  // Drive the slide-in. Mounting with translate-x-full then flipping on
  // the next frame is what makes the transition play — setting the final
  // transform in the mount paint would just snap.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const shown = entered && !closing;

  // Escape closes; arrow keys page between styles. Ignored while typing so
  // inline edits aren't hijacked.
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
    // Scrim wraps the drawer (same nesting the modal had, so the closing
    // tags are untouched) — click the scrim to close, drawer stops
    // propagation. Lighter than the old overlay and no blur: the list
    // stays readable behind it, which is the point of a drawer.
    <div
      className={cn(
        'fixed inset-0 z-50 transition-colors duration-300 motion-reduce:transition-none',
        shown ? 'bg-gray-900/30' : 'bg-transparent pointer-events-none',
      )}
      onClick={onClose}
    >
      <div
        className={cn(
          'absolute top-0 right-0 bottom-0 w-full max-w-[860px] bg-white border-l border-gray-200 shadow-2xl flex flex-col',
          'transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
          shown ? 'translate-x-0' : 'translate-x-full',
        )}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
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
                'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border',
                statusStyle.bg, statusStyle.text, 'border-current/20'
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
            <button
              onClick={() => { setModalTab(modalTab === 'comments' ? 'details' : 'comments'); modalContentRef.current?.scrollTo(0, 0); }}
              className={cn(
                'px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 border',
                modalTab === 'comments'
                  ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              )}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              {modalTab === 'comments' ? 'Details' : 'Comments'}
              {modalTab !== 'comments' && (order.unread_comment_count || 0) > 0 && (
                <span className="px-1.5 py-0 bg-red-500 text-white text-[10px] font-bold rounded-full">
                  {order.unread_comment_count}
                </span>
              )}
            </button>
            {/* Page between styles without closing — the main win of the
                drawer over the old centred modal. */}
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
        <>
          {/* Hero stat strip */}
          <div className="px-6 py-3 bg-gradient-to-b from-gray-50/80 to-white border-b border-gray-100 grid gap-3 flex-shrink-0" style={{ gridTemplateColumns: `repeat(${[true, SHOW_COSTING && (hasCol('trade_price') || hasCol('total_order_value')), !!exFacDate, hasCol('eta_to_customer'), sampleTotal > 0].filter(Boolean).length}, minmax(0, 1fr))` }}>
            <HeroTile label="Total Qty" value={formatQty(order.total_quantity)} />
            {SHOW_COSTING && hasCol('total_order_value') ? (
              <HeroTile
                label="Order Value"
                value={formatCurrency(order.total_order_value)}
                sub={hasCol('trade_price') ? `${formatCurrency(order.trade_price)} cost` : undefined}
              />
            ) : SHOW_COSTING && hasCol('trade_price') ? (
              <HeroTile label="Cost Price" value={formatCurrency(order.trade_price)} />
            ) : null}
            {exFacDate && (
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
            {sampleTotal > 0 && (
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

          {/* Scroll body */}
          <div ref={modalContentRef} className="flex-1 overflow-y-auto bg-gray-50/40">

            {/* Product */}
            <section ref={productRef} className="px-6 pt-6 pb-3">
              <SectionHeader accent="blue" label="Product" />
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
                  {hasCol('description') && <DetailRow label="Description" value={order.description} />}
                  {hasCol('customer') && <DetailRow label="Customer" value={order.customer} />}
                  {hasCol('china_orderbook_ref') && <DetailRow label="Order Reference" value={order.china_orderbook_ref} />}
                  {hasCol('colour') && <DetailRow label="Colour" value={order.colour} />}
                  {hasCol('gender') && <DetailRow label="Gender" value={order.gender} extra={<SizeGuideTooltip gender={order.gender} />} />}
                  {hasCol('season') && <DetailRow label="Season" value={order.season} />}
                  {hasCol('factory') && <DetailRow label="Factory" value={order.factory} />}
                  {hasCol('terms') && <DetailRow label="Terms" value={order.terms} />}
                  {hasCol('direct_repeat_new') && <DetailRow label="Direct Repeat/New" value={order.direct_repeat_new} />}
                </div>
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

            {/* Sampling */}
            {(hasCol('fit_sample_status') || hasCol('strike_off_status') || hasCol('lab_dip_status') || hasCol('pps_status')) && (
              <>
                <section ref={samplingRef} className="px-6 pt-6 pb-3">
                  <SectionHeader accent="amber" label="Sampling" badge={samplePending > 0 ? `${samplePending} pending` : undefined} badgeTone="amber" />

                  {/* Components section — Strike Off + Lab Dip per component (Fit lives on the style now). */}
                  {(hasCol('strike_off_status') || hasCol('lab_dip_status')) && (
                    <div className="mb-4">
                      <ComponentsSection orderId={order.id} poNumber={order.po_number} hasCol={hasCol} canEdit={canEdit} onComponentsLoaded={(n) => setHasComponents(n > 0)} />
                    </div>
                  )}

                  {/* Style-level Strike + Lab — only shown when no components exist (default-fallback). */}
                  {!hasComponents && (hasCol('strike_off_status') || hasCol('lab_dip_status')) && (
                    <>
                      <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">Order-level samples</div>
                      <div className="grid grid-cols-2 gap-2 mb-4">
                        {(hasCol('strike_off_status') || hasCol('strike_off_received')) && (
                          <SampleCard label="Strike Off">
                            <RejectionContextBanner rejection={order.strike_off_last_rejection} attemptNo={order.strike_off_attempt_no} sampleAreaLabel="Strike Off" size="sm" />
                            {hasCol('strike_off_status') && <DetailRow label="Status" value={order.strike_off_status} editable={canEdit('strike_off_status')} options={SAMPLE_STATUS_OPTIONS} onSave={(v) => handleSampleStatusSave('strike_off_status', v)} extra={<AttemptBadge attemptNo={order.strike_off_attempt_no} rejectionCount={order.strike_off_rejection_count} size="xs" />} />}
                            {hasCol('strike_off_received') && <DetailRow label="Received" value={formatDate(order.strike_off_received)} />}
                            {hasCol('strike_off_approved') && <DetailRow label="Approved" value={formatDate(order.strike_off_approved)} />}
                            <AttemptHistory submissions={orderSubmissions} componentId={null} sampleType="strike" size="sm" />
                          </SampleCard>
                        )}
                        {(hasCol('lab_dip_status') || hasCol('lab_dip_received')) && (
                          <SampleCard label="Lab Dip">
                            <RejectionContextBanner rejection={order.lab_dip_last_rejection} attemptNo={order.lab_dip_attempt_no} sampleAreaLabel="Lab Dip" size="sm" />
                            {hasCol('lab_dip_status') && <DetailRow label="Status" value={order.lab_dip_status} editable={canEdit('lab_dip_status')} options={SAMPLE_STATUS_OPTIONS} onSave={(v) => handleSampleStatusSave('lab_dip_status', v)} extra={<AttemptBadge attemptNo={order.lab_dip_attempt_no} rejectionCount={order.lab_dip_rejection_count} size="xs" />} />}
                            {hasCol('lab_dip_received') && <DetailRow label="Received" value={formatDate(order.lab_dip_received)} />}
                            {hasCol('lab_dip_approved') && <DetailRow label="Approved" value={formatDate(order.lab_dip_approved)} />}
                            <AttemptHistory submissions={orderSubmissions} componentId={null} sampleType="lab" size="sm" />
                          </SampleCard>
                        )}
                      </div>
                    </>
                  )}

                  {/* Fit Sample — always at order level, regardless of components. */}
                  {(hasCol('fit_sample_status') || hasCol('fit_sample_received')) && (
                    <>
                      <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2 mt-4">Fit Sample · order-level</div>
                      <SampleCard label="Fit Sample" highlight>
                        <RejectionContextBanner rejection={order.fit_sample_last_rejection} attemptNo={order.fit_sample_attempt_no} sampleAreaLabel="Fit Sample" size="sm" />
                        {hasCol('fit_sample_required') && <DetailRow label="Required" value={order.fit_sample_required} editable={canEdit('fit_sample_required')} options={FIT_REQUIRED_OPTIONS} onSave={(v) => onSave?.(order.id, 'fit_sample_required', v)} />}
                        {hasCol('fit_sample_status') && <DetailRow label="Status" value={order.fit_sample_status} editable={canEdit('fit_sample_status')} options={FIT_SAMPLE_STATUS_OPTIONS} onSave={(v) => handleSampleStatusSave('fit_sample_status', v)} extra={<AttemptBadge attemptNo={order.fit_sample_attempt_no} rejectionCount={order.fit_sample_rejection_count} size="xs" />} />}
                        {hasCol('fit_sample_received') && <DetailRow label="Received" value={formatDate(order.fit_sample_received)} />}
                        {hasCol('fit_sample_approved') && <DetailRow label="Approved" value={formatDate(order.fit_sample_approved)} />}
                        <AttemptHistory submissions={orderSubmissions} componentId={null} sampleType="fit" size="sm" />
                      </SampleCard>
                    </>
                  )}

                  {(hasCol('pps_status') || hasCol('pps_received')) && (
                    <>
                      <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2 mt-4">PPS · order-level</div>
                      <SampleCard label="Pre-Production Sample" highlight>
                        <RejectionContextBanner rejection={order.pps_last_rejection} attemptNo={order.pps_attempt_no} sampleAreaLabel="PPS" size="sm" />
                        {hasCol('pps_status') && <DetailRow label="Status" value={order.pps_status} editable={canEdit('pps_status')} options={SAMPLE_STATUS_OPTIONS} onSave={(v) => handleSampleStatusSave('pps_status', v)} extra={<AttemptBadge attemptNo={order.pps_attempt_no} rejectionCount={order.pps_rejection_count} size="xs" />} />}
                        {hasCol('pps_received') && <DetailRow label="Received" value={formatDate(order.pps_received)} />}
                        {hasCol('pps_sent_to_customer') && <DetailRow label="Sent to Cust" value={formatDate(order.pps_sent_to_customer)} />}
                        {hasCol('pps_approved') && <DetailRow label="Approved" value={formatDate(order.pps_approved)} />}
                        <AttemptHistory submissions={orderSubmissions} componentId={null} sampleType="pps" size="sm" />
                      </SampleCard>
                    </>
                  )}

                  {(hasCol('photo_sample_received') || hasCol('shipment_sample_received') || hasCol('ex_factory_from_pp_approval')) && (
                    <div className="grid grid-cols-3 gap-2 mt-4">
                      {hasCol('photo_sample_received') && (
                        <SampleCard label="Photo Sample">
                          <DetailRow label="Received" value={formatDate(order.photo_sample_received)} />
                        </SampleCard>
                      )}
                      {hasCol('shipment_sample_received') && (
                        <SampleCard label="Shipment Sample">
                          <DetailRow label="Received" value={formatDate(order.shipment_sample_received)} />
                        </SampleCard>
                      )}
                      {hasCol('ex_factory_from_pp_approval') && (
                        <SampleCard label="Ex-Fac from PP Approval">
                          <DetailRow label="Date" value={formatDate(order.ex_factory_from_pp_approval)} />
                        </SampleCard>
                      )}
                    </div>
                  )}
                </section>
                <SectionDivider />
              </>
            )}

            {/* Shipping */}
            <section ref={shippingRef} className="px-6 pt-6 pb-3">
              <SectionHeader accent="teal" label="Shipping" />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">Vessel</div>
                  <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
                    {hasCol('fcl_lcl') && <DetailRow label="FCL/LCL" value={order.fcl_lcl} editable={canEdit('fcl_lcl')} onSave={(v) => onSave?.(order.id, 'fcl_lcl', v)} />}
                    {hasCol('vessel_name') && <DetailRow label="Vessel Name" value={order.vessel_name} editable={canEdit('vessel_name')} onSave={(v) => onSave?.(order.id, 'vessel_name', v)} />}
                    {hasCol('vessel_etd') && <DetailRow label="Vessel ETD" value={formatDate(order.vessel_etd)} type="date" rawValue={order.vessel_etd} editable={canEdit('vessel_etd')} onSave={(v) => onSave?.(order.id, 'vessel_etd', v)} />}
                    {hasCol('vessel_eta_to_port') && <DetailRow label="Vessel ETA Port" value={formatDate(order.vessel_eta_to_port)} type="date" rawValue={order.vessel_eta_to_port} editable={canEdit('vessel_eta_to_port')} onSave={(v) => onSave?.(order.id, 'vessel_eta_to_port', v)} />}
                    {hasCol('revised_vessel_eta_to_port') && <DetailRow label="Revised Vessel ETA" value={formatDate(order.revised_vessel_eta_to_port)} type="date" rawValue={order.revised_vessel_eta_to_port} editable={canEdit('revised_vessel_eta_to_port')} onSave={(v) => onSave?.(order.id, 'revised_vessel_eta_to_port', v)} />}
                    {order.tracking_reference && <DetailRow label="Tracking Ref" value={order.tracking_reference} />}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">Delivery</div>
                  <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
                    {hasCol('original_del_date_to_customer') && <DetailRow label="Customer Requested" value={order.date_notes?.original_del_date_to_customer || formatDate(order.original_del_date_to_customer)} />}
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

            {/* Timeline */}
            <section ref={timelineRef} className="px-6 pt-6 pb-6">
              <SectionHeader accent="violet" label="Timeline" />
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="relative">
                  <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-200" />
                  <div className="space-y-0">
                    {hasCol('order_received_date') && <TimelineItem label="Order Received" date={order.order_received_date} />}
                    {hasCol('order_sent_to_factory_date') && <TimelineItem label="Sent to Factory" date={order.order_sent_to_factory_date} />}
                    {hasCol('tech_packs_sent_to_factory') && <TimelineItem label="Tech Packs Sent" date={order.tech_packs_sent_to_factory} />}
                    {hasCol('specs_sent_to_factory') && <TimelineItem label="Specs Sent" date={order.specs_sent_to_factory} />}
                    {hasCol('barcodes_sent_to_factory') && <TimelineItem label="Barcodes Sent" date={order.barcodes_sent_to_factory} />}
                    {hasCol('original_po_ex_factory') && <TimelineItem label="Requested Ex-Factory" date={order.original_po_ex_factory} note={order.date_notes?.original_po_ex_factory} />}
                    {hasCol('factory_confirmed_ex_factory') && <TimelineItem label="Factory Confirmed Ex-Fac" date={order.factory_confirmed_ex_factory} note={order.date_notes?.factory_confirmed_ex_factory} highlight editable={canEdit('factory_confirmed_ex_factory')} onSave={(v) => onSave?.(order.id, 'factory_confirmed_ex_factory', v)} />}
                    {hasCol('revised_po_ex_factory') && <TimelineItem label="Revised Ex-Factory" date={order.revised_po_ex_factory} note={order.date_notes?.revised_po_ex_factory} highlight editable={canEdit('revised_po_ex_factory')} onSave={(v) => onSave?.(order.id, 'revised_po_ex_factory', v)} />}
                    {hasCol('vessel_etd') && <TimelineItem label="Vessel ETD" date={order.vessel_etd} editable={canEdit('vessel_etd')} onSave={(v) => onSave?.(order.id, 'vessel_etd', v)} />}
                    {hasCol('vessel_eta_to_port') && <TimelineItem label="Vessel ETA Port" date={order.vessel_eta_to_port} editable={canEdit('vessel_eta_to_port')} onSave={(v) => onSave?.(order.id, 'vessel_eta_to_port', v)} />}
                    {hasCol('revised_vessel_eta_to_port') && <TimelineItem label="Revised Vessel ETA" date={order.revised_vessel_eta_to_port} editable={canEdit('revised_vessel_eta_to_port')} onSave={(v) => onSave?.(order.id, 'revised_vessel_eta_to_port', v)} />}
                    {hasCol('eta_to_uk') && <TimelineItem label="ETA UK" date={order.eta_to_uk} />}
                    {hasCol('eta_to_customer') && <TimelineItem label="ETA Customer" date={order.eta_to_customer} />}
                    {hasCol('estimated_del_to_customer') && <TimelineItem label="Est Del to Customer" date={order.estimated_del_to_customer} />}
                    {hasCol('original_del_date_to_customer') && <TimelineItem label="Customer Req Delivery" date={order.original_del_date_to_customer} note={order.date_notes?.original_del_date_to_customer} />}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </>
      )}

      {/* Footer */}
      <div className="border-t border-gray-100 px-6 py-3 flex items-center justify-end flex-shrink-0">
        <p className="text-[11px] text-gray-400">
          Updated {timeAgo(order.updated_at)}
        </p>
      </div>
      </div>

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
            // Trigger a refresh of the order itself so the new OUTSTANDING status shows.
            onSave?.(order.id, '__refresh__', null);
          }}
        />
      )}
    </div>
  );
}

// ─── Components Section ───────────────────────────────────

// Components carry Strike Off, Lab Dip, or Label — Fit Sample is a whole-
// garment concern and lives on the style/order itself. Label fields use
// the strike_off column key for hasCol() gating so admins don't need to
// separately toggle a "label_*" column on/off; they behave as sample
// fields for visibility purposes.
const COMPONENT_SAMPLE_FIELDS: { key: string; label: string; type: string; colKey: string; options?: string[] }[] = [
  { key: 'strike_off_status', label: 'Strike Off Status', type: 'text', colKey: 'strike_off_status', options: SAMPLE_STATUS_OPTIONS },
  { key: 'strike_off_received', label: 'Strike Off Rcvd', type: 'date', colKey: 'strike_off_received' },
  { key: 'strike_off_approved', label: 'Strike Off Appr', type: 'date', colKey: 'strike_off_approved' },
  { key: 'lab_dip_status', label: 'Lab Dip Status', type: 'text', colKey: 'lab_dip_status', options: SAMPLE_STATUS_OPTIONS },
  { key: 'lab_dip_received', label: 'Lab Dip Rcvd', type: 'date', colKey: 'lab_dip_received' },
  { key: 'lab_dip_approved', label: 'Lab Dip Appr', type: 'date', colKey: 'lab_dip_approved' },
  { key: 'label_status', label: 'Label Status', type: 'text', colKey: 'strike_off_status', options: SAMPLE_STATUS_OPTIONS },
  { key: 'label_received', label: 'Label Rcvd', type: 'date', colKey: 'strike_off_status' },
  { key: 'label_approved', label: 'Label Appr', type: 'date', colKey: 'strike_off_status' },
];

export function ComponentsSection({
  orderId,
  poNumber,
  hasCol,
  canEdit,
  onComponentsLoaded,
}: {
  orderId: number;
  poNumber: string;
  hasCol: (key: string) => boolean;
  canEdit: (key: string) => boolean;
  onComponentsLoaded?: (count: number) => void;
}) {
  // Suppliers manage the component catalogue (add / delete) but never write
  // sample-lifecycle fields — that's Source Lab's call. We read the role
  // direct from the store so this stays correct without threading another
  // prop from every call site.
  const { user: currentUser } = useStore();
  const isSupplierUser = currentUser?.role === 'supplier';
  const router = useRouter();
  const [components, setComponents] = useState<OrderComponent[]>([]);
  const [submissions, setSubmissions] = useState<SampleSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  // Add-component popup — replaces the previous inline expand-in-place
  // form. Reuses the /design-components modal so the UX matches. We pull
  // the full orders pool lazily so the modal can attach a component to
  // any style across any PO (components are a cross-PO concept).
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addModalOrders, setAddModalOrders] = useState<Order[]>([]);
  const openAddModal = async () => {
    setAddModalOpen(true);
    if (addModalOrders.length > 0) return;
    try {
      const res = await ordersApi.getOrders(1, 5000, {});
      setAddModalOrders(res.orders);
    } catch {
      toast.error('Failed to load styles for add-component');
    }
  };
  // Reject modal state — populated when a user picks REJECTED from a sample status dropdown.
  const [rejectModal, setRejectModal] = useState<{
    componentId: number;
    componentName: string;
    sampleType: SampleType;
    currentAttemptNo: number;
  } | null>(null);

  const loadComponents = useCallback(async () => {
    try {
      const data = await componentsApi.getComponents(orderId);
      setComponents(data);
      onComponentsLoaded?.(data.length);
    } catch (err) {
      console.error('Failed to load components:', err);
    } finally {
      setIsLoading(false);
    }
  }, [orderId, onComponentsLoaded]);

  const loadSubmissions = useCallback(async () => {
    try {
      const res = await submissionsApi.getForOrder(orderId);
      setSubmissions(res.submissions);
    } catch {
      // Silent — submissions are additive context, don't break component loading if this fails.
    }
  }, [orderId]);

  useEffect(() => {
    loadComponents();
    loadSubmissions();
  }, [loadComponents, loadSubmissions]);

  // Current (highest) attempt number for a given (component, sample_type). Returns
  // 1 when nothing's been rejected yet — that's the implicit v1 from legacy columns.
  const currentAttempt = (componentId: number | null, sampleType: SampleType): number => {
    const matching = submissions.filter(s => s.component_id === componentId && s.sample_type === sampleType);
    if (matching.length === 0) return 1;
    return Math.max(...matching.map(s => s.attempt_no));
  };

  // Two-step confirm. This deletes the instance AND cascades its sample
  // submissions — the whole attempt history for that sample goes with it —
  // and the button previously fired on a single click with no prompt at
  // all. Holds the pending id rather than using window.confirm so the
  // affordance matches the rest of the app.
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const handleDelete = async (id: number) => {
    try {
      await componentsApi.deleteComponent(id);
      toast.success('Component removed');
      setComponents(prev => prev.filter(c => c.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (err) {
      toast.error('Failed to delete component');
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const handleFieldSave = async (component: OrderComponent, fieldKey: string, value: string, applyToPO: boolean, selectedIds?: number[]) => {
    // Intercept REJECTED on a sample status field — open the reject modal so we
    // can capture a reason/note and kick off a v+1 attempt via the submissions API.
    const sampleType = SAMPLE_STATUS_FIELD_TO_TYPE[fieldKey];
    if (value === 'REJECTED' && sampleType) {
      setRejectModal({
        componentId: component.id,
        componentName: component.name,
        sampleType,
        currentAttemptNo: currentAttempt(component.id, sampleType),
      });
      return;
    }

    const update: Record<string, any> = {};
    update[fieldKey] = value || null;

    try {
      if (applyToPO || (selectedIds && selectedIds.length > 0)) {
        const payload: any = { ...update };
        if (selectedIds && selectedIds.length > 0) payload.order_ids = selectedIds;
        const result = await componentsApi.applyFieldToPO(component.id, payload);
        toast.success(`Updated "${component.name}" on ${result.components_updated} ${result.components_updated === 1 ? 'style' : 'styles'}`);
      } else {
        await componentsApi.updateComponent(component.id, update);
        toast.success('Updated');
      }
      loadComponents();
    } catch (err) {
      toast.error('Failed to update');
    }
  };

  const visibleFields = COMPONENT_SAMPLE_FIELDS.filter(f => hasCol(f.colKey));

  if (isLoading) {
    return (
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Layers className="w-3.5 h-3.5" />
          Components
        </h4>
        <div className="text-xs text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5" />
          Components
          {components.length > 0 && (
            <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full text-[10px] font-bold">{components.length}</span>
          )}
        </span>
        {/* Adding mints a canonical and can apply it to any style on any PO
            — cross-factory reach a supplier shouldn't have from here. */}
        {!isSupplierUser && (
          <button
            onClick={openAddModal}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
            title="Add component"
          >
            <Plus className="w-3.5 h-3.5 text-gray-400" />
          </button>
        )}
      </h4>

      {/* Component List */}
      {components.length === 0 ? (
        isSupplierUser ? (
          <div className="w-full text-xs text-gray-400 text-center py-4 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            No components on this style yet.
          </div>
        ) : (
          <button
            onClick={openAddModal}
            className="w-full text-xs text-gray-500 text-center py-4 bg-gray-50 rounded-xl border border-dashed border-gray-300 hover:bg-gray-100 hover:border-gray-400 transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Component (e.g. Main Fabric, Lining, Trim)
          </button>
        )
      ) : (
        <div className="space-y-2">
          {components.map(comp => (
            <div key={comp.id} className="border border-gray-200 rounded-xl">
              {/* Component Header */}
              <button
                onClick={() => setExpandedId(expandedId === comp.id ? null : comp.id)}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left rounded-t-xl',
                  expandedId !== comp.id && 'rounded-b-xl'
                )}
              >
                <div className="flex items-center gap-2">
                  <ChevronRight className={cn('w-3.5 h-3.5 text-gray-400 transition-transform', expandedId === comp.id && 'rotate-90')} />
                  <span className="text-xs font-semibold text-gray-700">{comp.name}</span>
                  <span
                    className={cn(
                      'text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded',
                      comp.sample_type === 'strike_off' ? 'bg-amber-100 text-amber-800'
                        : comp.sample_type === 'lab_dip' ? 'bg-cyan-100 text-cyan-800'
                        : 'bg-fuchsia-100 text-fuchsia-800',
                    )}
                  >
                    {comp.sample_type === 'strike_off' ? 'SO' : comp.sample_type === 'lab_dip' ? 'LD' : 'LB'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {/* Quick status summary — only the component's chosen
                      sample type renders a chip. */}
                  {comp.sample_type === 'strike_off' && (
                    <SampleAreaChip label="SO" done={(comp.strike_off_status || '').toUpperCase() === 'APPROVED' || (comp.strike_off_status || '').toUpperCase() === 'NOT REQUIRED' || !!comp.strike_off_approved} submissions={submissions} componentId={comp.id} sampleType="strike" />
                  )}
                  {comp.sample_type === 'lab_dip' && (
                    <SampleAreaChip label="LD" done={(comp.lab_dip_status || '').toUpperCase() === 'APPROVED' || (comp.lab_dip_status || '').toUpperCase() === 'NOT REQUIRED' || !!comp.lab_dip_approved} submissions={submissions} componentId={comp.id} sampleType="lab" />
                  )}
                  {comp.sample_type === 'label' && (
                    <SampleAreaChip label="LB" done={(comp.label_status || '').toUpperCase() === 'APPROVED' || (comp.label_status || '').toUpperCase() === 'NOT REQUIRED' || !!comp.label_approved} submissions={submissions} componentId={comp.id} sampleType="label" />
                  )}
                </div>
              </button>

              {/* Expanded Content */}
              {expandedId === comp.id && (
                <div className="px-3 py-2 border-t border-gray-100 space-y-2">
                  <div>
                    {/* Strike Off — only when this component IS a strike-off
                        type. The other section is intentionally hidden. */}
                    {comp.sample_type === 'strike_off' && visibleFields.some(f => f.key.startsWith('strike_off_')) && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1 mt-1 flex items-center gap-1.5">
                          Strike Off
                          <AttemptBadge attemptNo={comp.strike_off_attempt_no} rejectionCount={comp.strike_off_rejection_count} size="xs" />
                        </p>
                        <RejectionContextBanner rejection={comp.strike_off_last_rejection} attemptNo={comp.strike_off_attempt_no} sampleAreaLabel="Strike Off" size="sm" />
                        {visibleFields.filter(f => f.key.startsWith('strike_off_')).map(field => (
                          <ComponentFieldRow key={field.key} label={field.label.replace('Strike Off ', '')} value={(comp as any)[field.key]} type={field.type} editable={!isSupplierUser} onSave={(val, applyAll, selectedIds) => handleFieldSave(comp, field.key, val, applyAll, selectedIds)} poNumber={poNumber} componentName={comp.name} options={field.options} />
                        ))}
                        <AttemptHistory submissions={submissions} componentId={comp.id} sampleType="strike" size="sm" />
                      </div>
                    )}
                    {comp.sample_type === 'lab_dip' && visibleFields.some(f => f.key.startsWith('lab_dip_')) && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                          Lab Dip
                          <AttemptBadge attemptNo={comp.lab_dip_attempt_no} rejectionCount={comp.lab_dip_rejection_count} size="xs" />
                        </p>
                        <RejectionContextBanner rejection={comp.lab_dip_last_rejection} attemptNo={comp.lab_dip_attempt_no} sampleAreaLabel="Lab Dip" size="sm" />
                        {visibleFields.filter(f => f.key.startsWith('lab_dip_')).map(field => (
                          <ComponentFieldRow key={field.key} label={field.label.replace('Lab Dip ', '')} value={(comp as any)[field.key]} type={field.type} editable={!isSupplierUser} onSave={(val, applyAll, selectedIds) => handleFieldSave(comp, field.key, val, applyAll, selectedIds)} poNumber={poNumber} componentName={comp.name} options={field.options} />
                        ))}
                        <AttemptHistory submissions={submissions} componentId={comp.id} sampleType="lab" size="sm" />
                      </div>
                    )}
                    {comp.sample_type === 'label' && visibleFields.some(f => f.key.startsWith('label_')) && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                          Label
                          <AttemptBadge attemptNo={comp.label_attempt_no} rejectionCount={comp.label_rejection_count} size="xs" />
                        </p>
                        <RejectionContextBanner rejection={comp.label_last_rejection} attemptNo={comp.label_attempt_no} sampleAreaLabel="Label" size="sm" />
                        {visibleFields.filter(f => f.key.startsWith('label_')).map(field => (
                          <ComponentFieldRow key={field.key} label={field.label.replace('Label ', '')} value={(comp as any)[field.key]} type={field.type} editable={!isSupplierUser} onSave={(val, applyAll, selectedIds) => handleFieldSave(comp, field.key, val, applyAll, selectedIds)} poNumber={poNumber} componentName={comp.name} options={field.options} />
                        ))}
                        <AttemptHistory submissions={submissions} componentId={comp.id} sampleType="label" size="sm" />
                      </div>
                    )}
                  </div>
                  {!isSupplierUser && (
                    <div className="pt-2 border-t border-gray-100 flex justify-end items-center gap-2">
                      {confirmDeleteId === comp.id ? (
                        <>
                          <span className="text-[10px] text-red-700">
                            Remove <b>{comp.name}</b> and its sample history from this style?
                          </span>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-[10px] text-gray-500 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-100"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleDelete(comp.id)}
                            className="text-[10px] font-semibold text-white bg-red-600 hover:bg-red-700 px-2 py-1 rounded"
                          >
                            Remove
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(comp.id)}
                          className="text-[10px] text-red-500 hover:text-red-700 flex items-center gap-1 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                          Remove
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {rejectModal && (
        <RejectSampleModal
          orderId={orderId}
          componentId={rejectModal.componentId}
          componentName={rejectModal.componentName}
          sampleType={rejectModal.sampleType}
          currentAttemptNo={rejectModal.currentAttemptNo}
          onClose={() => setRejectModal(null)}
          onRejected={() => {
            setRejectModal(null);
            loadComponents();
            loadSubmissions();
          }}
        />
      )}

      <LibraryFirstAddModal
        open={addModalOpen}
        orders={addModalOrders}
        isSupplier={isSupplierUser}
        onClose={() => setAddModalOpen(false)}
        onDone={(_name, _count, canonicalId) => {
          setAddModalOpen(false);
          loadComponents();
          // Land in the library on the fresh entry — so the user can see what
          // they just created and which styles now link to it.
          router.push(`/components?open=${canonicalId}`);
        }}
      />
    </div>
  );
}

function ComponentFieldRow({
  label,
  value,
  type,
  editable,
  onSave,
  poNumber,
  componentName,
  options,
}: {
  label: string;
  value: string | null | undefined;
  type: string;
  editable?: boolean;
  onSave: (value: string, applyToPO: boolean, selectedIds?: number[]) => void;
  poNumber: string;
  componentName: string;
  options?: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value || '');
  const [showApplyMenu, setShowApplyMenu] = useState(false);
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [stylesWithComp, setStylesWithComp] = useState<{ id: number; style_code: string; description: string; colour: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loadingStyles, setLoadingStyles] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  const displayValue = type === 'date' && value
    ? formatDate(value)
    : value || '—';

  const handleSave = (applyAll: boolean, ids?: number[]) => {
    onSave(editValue, applyAll, ids);
    setEditing(false);
    setShowApplyMenu(false);
    setShowStylePicker(false);
    setSelectedIds(new Set());
  };

  const handleShowStylePicker = async () => {
    setLoadingStyles(true);
    try {
      const res = await componentsApi.getStylesWithComponent(poNumber, componentName);
      setStylesWithComp(res.styles);
      setShowStylePicker(true);
    } catch {
      toast.error('Failed to load styles');
    } finally {
      setLoadingStyles(false);
    }
  };

  return (
    <div className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
      <span className="text-[11px] text-gray-400">{label}</span>
      {editing ? (
        <div ref={editorRef} className="flex items-center gap-1">
          {options ? (
            <StatusDropdown
              value={editValue}
              options={options}
              onSave={(v) => { setEditValue(v); setShowApplyMenu(true); }}
              onCancel={() => setEditing(false)}
              size="sm"
              containerRef={editorRef}
            />
          ) : type === 'date' ? (
            <DatePickerInput
              value={editValue}
              onChange={(v) => { setEditValue(v); if (v) setShowApplyMenu(true); }}
              autoFocus
              size="sm"
            />
          ) : (
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setEditing(false); setShowApplyMenu(false); setShowStylePicker(false); } if (e.key === 'Enter') handleSave(false); }}
              autoFocus
              className="text-[11px] border border-primary-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-500 w-[120px]"
            />
          )}
          <div className="relative">
            {!options && (
              <button
                onClick={() => { setShowApplyMenu(!showApplyMenu); setShowStylePicker(false); }}
                className="text-[10px] px-2 py-0.5 bg-primary-600 text-white rounded hover:bg-primary-700"
              >
                Save
              </button>
            )}
            {showApplyMenu && !showStylePicker && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 w-56">
                <button
                  onClick={() => handleSave(false)}
                  className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-gray-50"
                >
                  This style only
                </button>
                <button
                  onClick={() => handleSave(true)}
                  className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-gray-50 flex items-center gap-1.5"
                >
                  <Copy className="w-3 h-3 text-gray-400" />
                  All styles on {poNumber} with this component
                </button>
                <button
                  onClick={handleShowStylePicker}
                  disabled={loadingStyles}
                  className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-gray-50 flex items-center gap-1.5"
                >
                  <Eye className="w-3 h-3 text-gray-400" />
                  {loadingStyles ? 'Loading...' : 'Select styles...'}
                </button>
              </div>
            )}
            {showStylePicker && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 w-64">
                <div className="px-3 py-2 border-b border-gray-100 text-[11px] font-semibold text-gray-500">
                  Styles with &quot;{componentName}&quot;
                </div>
                <div className="max-h-40 overflow-y-auto">
                  {stylesWithComp.map(style => (
                    <label key={style.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(style.id)}
                        onChange={(e) => {
                          const next = new Set(selectedIds);
                          if (e.target.checked) next.add(style.id); else next.delete(style.id);
                          setSelectedIds(next);
                        }}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-[11px] text-gray-700 truncate">
                        {style.style_code} · {style.colour}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="px-3 py-2 border-t border-gray-100 flex gap-2">
                  <button
                    onClick={() => handleSave(false, Array.from(selectedIds))}
                    disabled={selectedIds.size === 0}
                    className="flex-1 text-[10px] px-2 py-1 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
                  >
                    Apply to {selectedIds.size} style{selectedIds.size !== 1 ? 's' : ''}
                  </button>
                  <button
                    onClick={() => { setShowStylePicker(false); setShowApplyMenu(true); }}
                    className="text-[10px] px-2 py-1 bg-gray-200 text-gray-600 rounded hover:bg-gray-300"
                  >
                    Back
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <span
          className={cn(
            'text-[11px] font-medium text-gray-700',
            editable && 'cursor-pointer hover:text-primary-600 bg-green-50 px-1.5 py-0.5 rounded border border-green-200/60'
          )}
          onClick={() => {
            if (editable) {
              setEditValue(type === 'date' && value ? value.split('T')[0] : (value || ''));
              setEditing(true);
            }
          }}
        >
          {displayValue}
        </span>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────

function DetailRow({ label, value, editable, onSave, options, extra, type, rawValue }: {
  label: string;
  value: string | number | null | undefined;
  editable?: boolean;
  onSave?: (value: string) => void;
  options?: string[];
  extra?: React.ReactNode;
  type?: 'text' | 'date';
  rawValue?: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

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
      {editing ? (
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

function TimelineItem({ label, date, note, highlight, editable, onSave }: {
  label: string;
  date: string | null | undefined;
  /** Free-text override (e.g. "ASAP") — displayed in place of the date
   *  when set. Only relevant for note-eligible fields. */
  note?: string | null;
  highlight?: boolean;
  editable?: boolean;
  onSave?: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const hasDate = !!date || !!note;

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
        {editing ? (
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
              editable && 'cursor-pointer hover:text-primary-600 bg-green-50 px-1.5 py-0.5 rounded border border-green-200/60'
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

// Small at-a-glance chip showing the current state of a sample area on a component
// — tick for approved, amber for in-progress, and a v2/v3 badge + prior-rejection
// count when the area has been rejected at least once.
function SampleAreaChip({
  label,
  done,
  submissions,
  componentId,
  sampleType,
}: {
  label: string;
  done: boolean;
  submissions: SampleSubmission[];
  componentId: number | null;
  sampleType: SampleType;
}) {
  const matching = submissions.filter(s => s.component_id === componentId && s.sample_type === sampleType);
  const attemptNo = matching.length === 0 ? 1 : Math.max(...matching.map(s => s.attempt_no));
  const rejections = matching.filter(s => s.outcome === 'REJECTED').length;
  const stuck = rejections >= 2;
  const inRework = attemptNo > 1 && !done;

  let classes = 'bg-green-100 text-green-700';
  if (!done && inRework && stuck) classes = 'bg-red-100 text-red-700 ring-1 ring-red-400';
  else if (!done && inRework)      classes = 'bg-amber-100 text-amber-800 ring-1 ring-amber-400';
  else if (!done)                  classes = 'bg-amber-100 text-amber-700';

  return (
    <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-semibold inline-flex items-center gap-0.5', classes)}>
      {done && '✓'} {label}
      {attemptNo > 1 && <span className="font-bold">v{attemptNo}</span>}
      {rejections > 0 && <span className="text-red-600">·{rejections}</span>}
    </span>
  );
}
