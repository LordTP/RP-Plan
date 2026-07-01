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
import { useStore } from '@/store/useStore';
import { ordersApi, excelApi, statusesApi, submissionsApi, OrderFilters, type SampleSubmission, type SampleType } from '@/lib/api';
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

      // Use revised or original ex-factory date
      const exFactory = order.revised_po_ex_factory || order.original_po_ex_factory;
      if (exFactory && (!groups[po].latestDate || exFactory > groups[po].latestDate)) {
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

    // Sort by latest update (most recent first)
    return Object.values(groups).sort((a, b) => b.latestUpdate.localeCompare(a.latestUpdate));
  }, [orders, searchQuery, statusFilter]);

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

          {/* Status Chips */}
          <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
            <button
              onClick={() => setStatusFilter('open')}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border',
                statusFilter === 'open'
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              )}
            >
              Open Orders
              <span className="ml-1.5 opacity-70">{statusCounts.open || 0}</span>
            </button>
            {statuses.filter(s => s !== 'Shipped').map(status => {
              const style = getStatusStyle(status);
              const count = statusCounts[status] || 0;
              if (count === 0) return null;
              return (
                <button
                  key={status}
                  onClick={() => setStatusFilter(statusFilter === status ? 'open' : status)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border',
                    statusFilter === status
                      ? `${style.bg} ${style.text} border-current`
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  )}
                >
                  <span className={cn('inline-block w-1.5 h-1.5 rounded-full mr-1.5', style.dot)} />
                  {status}
                  <span className="ml-1.5 opacity-70">{count}</span>
                </button>
              );
            })}
            {(statusCounts.shipped || 0) > 0 && (() => {
              const style = getStatusStyle('Shipped');
              return (
                <button
                  onClick={() => setStatusFilter(statusFilter === 'shipped' ? 'open' : 'shipped')}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border',
                    statusFilter === 'shipped'
                      ? `${style.bg} ${style.text} border-current`
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  )}
                >
                  <span className={cn('inline-block w-1.5 h-1.5 rounded-full mr-1.5', style.dot)} />
                  Shipped
                  <span className="ml-1.5 opacity-70">{statusCounts.shipped}</span>
                </button>
              );
            })()}
          </div>

          {/* Summary Bar */}
          <div className="flex items-center gap-6 mb-4 text-xs text-gray-500">
            <span>{poGroups.length} purchase orders</span>
            <span className="text-gray-300">·</span>
            <span>{orders.length} total lines</span>
            <span className="text-gray-300">·</span>
            <span>{orders.reduce((sum, o) => sum + (o.total_quantity || 0), 0).toLocaleString()} total units</span>
            {!isDesigner && <>
              <span className="text-gray-300">·</span>
              <span>{formatCurrency(orders.reduce((sum, o) => sum + (o.total_order_value || 0), 0))} total value</span>
            </>}
          </div>

          {/* PO List */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
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
                  <p className="text-xs text-gray-400 mt-1">Try adjusting your search or filters</p>
                </div>
              </div>
            ) : (
              poGroups.map(group => (
                <POCard
                  key={group.po_number}
                  group={group}
                  isExpanded={expandedPOs.has(group.po_number)}
                  onToggle={() => togglePO(group.po_number)}
                  onStyleClick={handleStyleClick}
                  onCommentClick={handleCommentClick}
                  selectedStyleId={selectedStyleId}
                  isSupplier={isSupplier}
                  isDesigner={isDesigner}
                />
              ))
            )}
          </div>
        </div>

        {/* ─── Right: Detail Panel ─── */}
        {selectedStyle && (
          <DetailPanel
            order={selectedStyle}
            onClose={() => { setSelectedStyleId(null); setOpenOnComments(false); }}
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

function POCard({
  group,
  isExpanded,
  onToggle,
  onStyleClick,
  onCommentClick,
  selectedStyleId,
  isSupplier,
  isDesigner,
}: {
  group: POGroup;
  isExpanded: boolean;
  onToggle: () => void;
  onStyleClick: (order: Order) => void;
  onCommentClick: (order: Order) => void;
  selectedStyleId: number | null;
  isSupplier: boolean;
  isDesigner?: boolean;
}) {
  const statusStyle = getStatusStyle(group.statusSummary);
  const hasMultipleStatuses = new Set(group.styles.map(s => s.status)).size > 1;

  return (
    <div id={`po-card-${group.po_number}`} className={cn(
      'bg-white rounded-xl transition-all overflow-hidden',
      isExpanded ? 'ring-1 ring-primary-200 shadow-md' : 'ring-1 ring-gray-200/80 hover:ring-gray-300 hover:shadow-md'
    )}>
      {/* PO Header */}
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center gap-5 text-left"
      >
        {/* Left accent */}
        <div className={cn(
          'w-1.5 h-12 rounded-full flex-shrink-0 transition-colors',
          isExpanded ? 'bg-primary-500' : 'bg-gray-200'
        )} />

        {/* PO Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="text-base font-bold text-gray-900">{group.po_number}</span>
            {group.styles[0]?.china_orderbook_ref && (
              <span className="text-xs text-gray-500 font-medium">— {group.styles[0].china_orderbook_ref}</span>
            )}
            <span className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold',
              statusStyle.bg, statusStyle.text
            )}>
              <span className={cn('w-1.5 h-1.5 rounded-full', statusStyle.dot)} />
              {group.statusSummary || 'Unknown'}
            </span>
            {hasMultipleStatuses && (
              <span className="text-[10px] text-gray-400 italic">mixed</span>
            )}
            {group.unreadComments > 0 && (
              <span className="inline-flex items-center gap-1 text-primary-500">
                <MessageSquare className="w-3.5 h-3.5 fill-current" />
                <span className="text-[10px] font-bold">{group.unreadComments}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-medium text-gray-600">{group.customer}</span>
            <span className="text-[10px] text-gray-300">|</span>
            <span className="text-xs text-gray-400">{group.factory}</span>
            <span className="text-[10px] text-gray-300">|</span>
            <span className="text-xs text-gray-400">{group.styles.length} style{group.styles.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Stats pills */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="bg-gray-50 rounded-lg px-3 py-1.5 text-center min-w-[70px]">
            <p className="text-sm font-bold text-gray-900 tabular-nums">{formatQty(group.totalQty)}</p>
            <p className="text-[9px] text-gray-400 uppercase tracking-wider">units</p>
          </div>

          {!isSupplier && !isDesigner && (
            <div className="bg-gray-50 rounded-lg px-3 py-1.5 text-center min-w-[85px]">
              <p className="text-sm font-bold text-gray-900 tabular-nums">{formatCurrency(group.totalValue)}</p>
              <p className="text-[9px] text-gray-400 uppercase tracking-wider">value</p>
            </div>
          )}

          <div className="bg-gray-50 rounded-lg px-3 py-1.5 text-center min-w-[85px]">
            <p className="text-xs font-semibold text-gray-700">{formatDate(group.latestDate)}</p>
            <p className="text-[9px] text-gray-400 uppercase tracking-wider">ex-factory</p>
          </div>
        </div>

        <ChevronRight className={cn(
          'w-4 h-4 text-gray-400 transition-transform flex-shrink-0',
          isExpanded && 'rotate-90'
        )} />
      </button>

      {/* Expanded: Style Cards */}
      {isExpanded && (
        <div className="border-t border-gray-100 p-3 space-y-2 bg-gray-50/40">
          {group.styles.map((style) => {
            const ss = getStatusStyle(style.status);
            const isSelected = style.id === selectedStyleId;
            const exFacDate = style.revised_po_ex_factory || style.original_po_ex_factory;
            return (
              <div
                key={style.id}
                onClick={() => onStyleClick(style)}
                className={cn(
                  'flex items-center gap-4 px-4 py-3 rounded-xl cursor-pointer transition-all',
                  isSelected
                    ? 'bg-primary-50 ring-1 ring-primary-200 shadow-sm'
                    : 'bg-white hover:shadow-md hover:ring-1 hover:ring-gray-200'
                )}
              >
                {/* Colour dot + Style info */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div
                    className="w-3 h-8 rounded-full flex-shrink-0"
                    style={{ backgroundColor: style.colour ? `var(--color-gray-300)` : '#e5e7eb' }}
                    title={style.colour || 'No colour'}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-gray-900 truncate">{style.style_code || '—'}</p>
                      {style.colour && <span className="text-[10px] text-gray-400 font-medium">{style.colour}</span>}
                    </div>
                    <p className="text-xs text-gray-500 truncate">{style.description || '—'}</p>
                  </div>
                </div>

                {/* Qty */}
                <div className="flex-shrink-0 text-center min-w-[60px]">
                  <p className="text-sm font-bold text-gray-900 tabular-nums">{formatQty(style.total_quantity)}</p>
                  <p className="text-[9px] text-gray-400 uppercase tracking-wider">units</p>
                </div>

                {/* Value (admin/internal only) */}
                {!isSupplier && !isDesigner && (
                  <div className="flex-shrink-0 text-center min-w-[80px]">
                    <p className="text-xs font-semibold text-gray-700 tabular-nums">{formatCurrency(style.total_order_value)}</p>
                  </div>
                )}

                {/* Ex-Factory */}
                <div className="flex-shrink-0 text-center min-w-[90px]">
                  <p className="text-xs font-medium text-gray-700">{formatDate(exFacDate)}</p>
                  <p className="text-[9px] text-gray-400">ex-factory</p>
                </div>

                {/* Status */}
                <div className="flex-shrink-0">
                  <span className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold',
                    ss.bg, ss.text
                  )}>
                    <span className={cn('w-1.5 h-1.5 rounded-full', ss.dot)} />
                    {style.status || 'Unknown'}
                  </span>
                </div>

                {/* Comment + Arrow */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {(style.comment_count || 0) > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onCommentClick(style); }}
                      className="relative p-1.5 hover:bg-primary-50 rounded-lg transition-colors"
                    >
                      {(style.unread_comment_count || 0) > 0 ? (
                        <MessageSquare className="w-3.5 h-3.5 text-primary-500 fill-current" />
                      ) : (
                        <MessageSquare className="w-3.5 h-3.5 text-gray-300" />
                      )}
                      {(style.unread_comment_count || 0) > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-0.5 bg-primary-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                          {style.unread_comment_count}
                        </span>
                      )}
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); onStyleClick(style); }}
                    className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
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

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[1200px] h-[88vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-scale-in"
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
      <div className="border-t border-gray-100 px-6 py-3 flex items-center justify-end flex-shrink-0">
        <p className="text-[11px] text-gray-400">
          Updated {timeAgo(order.updated_at)}
        </p>
      </div>
      </div>
    </div>
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
  // For the hero strip; also used to show "1 pending" on the Sampling pill.
  // Fit + PPS are always order-level. Strike + Lab fall back to the order
  // when there are no components; otherwise they're tracked per-component
  // and don't show in this hero count.
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
                {hasCol('original_del_date_to_customer') && <DetailRow label="Customer Requested" value={formatDate(order.original_del_date_to_customer)} type="date" rawValue={order.original_del_date_to_customer} editable={canEdit('original_del_date_to_customer')} fieldKey="original_del_date_to_customer" onSave={(v) => onSave?.(order.id, 'original_del_date_to_customer', v)} />}
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
                {hasCol('original_po_ex_factory') && <TimelineItem label="Requested Ex-Factory" date={order.original_po_ex_factory} editable={canEdit('original_po_ex_factory')} fieldKey="original_po_ex_factory" onSave={(v) => onSave?.(order.id, 'original_po_ex_factory', v)} />}
                {hasCol('factory_confirmed_ex_factory') && <TimelineItem label="Factory Confirmed Ex-Fac" date={order.factory_confirmed_ex_factory} highlight editable={canEdit('factory_confirmed_ex_factory')} fieldKey="factory_confirmed_ex_factory" onSave={(v) => onSave?.(order.id, 'factory_confirmed_ex_factory', v)} />}
                {hasCol('revised_po_ex_factory') && <TimelineItem label="Revised Ex-Factory" date={order.revised_po_ex_factory} highlight editable={canEdit('revised_po_ex_factory')} fieldKey="revised_po_ex_factory" onSave={(v) => onSave?.(order.id, 'revised_po_ex_factory', v)} />}
                {hasCol('vessel_etd') && <TimelineItem label="Vessel ETD" date={order.vessel_etd} editable={canEdit('vessel_etd')} fieldKey="vessel_etd" onSave={(v) => onSave?.(order.id, 'vessel_etd', v)} />}
                {hasCol('vessel_eta_to_port') && <TimelineItem label="Vessel ETA Port" date={order.vessel_eta_to_port} editable={canEdit('vessel_eta_to_port')} fieldKey="vessel_eta_to_port" onSave={(v) => onSave?.(order.id, 'vessel_eta_to_port', v)} />}
                {hasCol('revised_vessel_eta_to_port') && <TimelineItem label="Revised Vessel ETA" date={order.revised_vessel_eta_to_port} editable={canEdit('revised_vessel_eta_to_port')} fieldKey="revised_vessel_eta_to_port" onSave={(v) => onSave?.(order.id, 'revised_vessel_eta_to_port', v)} />}
                {hasCol('eta_to_uk') && <TimelineItem label="ETA UK" date={order.eta_to_uk} />}
                {hasCol('eta_to_customer') && <TimelineItem label="ETA Customer" date={order.eta_to_customer} />}
                {hasCol('estimated_del_to_customer') && <TimelineItem label="Est Del to Customer" date={order.estimated_del_to_customer} />}
                {hasCol('original_del_date_to_customer') && <TimelineItem label="Customer Req Delivery" date={order.original_del_date_to_customer} editable={canEdit('original_del_date_to_customer')} fieldKey="original_del_date_to_customer" onSave={(v) => onSave?.(order.id, 'original_del_date_to_customer', v)} />}
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

function TimelineItem({ label, date, highlight, editable, onSave, fieldKey }: {
  label: string;
  date: string | null | undefined;
  highlight?: boolean;
  editable?: boolean;
  onSave?: (value: string) => void;
  fieldKey?: string;
}) {
  const [editing, setEditing] = useState(false);
  const hasDate = !!date;
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
            value={date ? date.split('T')[0] : ''}
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
            {formatDate(date)}
          </span>
        )}
      </div>
    </div>
  );
}
