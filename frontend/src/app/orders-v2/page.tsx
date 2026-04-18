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
import { useStore } from '@/store/useStore';
import { ordersApi, excelApi, statusesApi, OrderFilters } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Order } from '@/types';
import { COLUMNS, FACTORY_PRODUCT_COLUMNS, FACTORY_SHIPPING_COLUMNS, FIT_SAMPLE_STATUS_OPTIONS, SAMPLE_STATUS_OPTIONS } from '@/types';

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

  // Deep-link params from dashboard warnings centre
  const openStyleParam = searchParams.get('openStyle');
  const expandPOParam = searchParams.get('expandPO');

  // Use local state for factory views, global store for main orders
  const [localOrders, setLocalOrders] = useState<Order[]>([]);
  const [localTotal, setLocalTotal] = useState(0);
  const orders = isFactoryView ? localOrders : storeOrders;
  const totalOrders = isFactoryView ? localTotal : storeTotalOrders;

  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [statuses, setStatuses] = useState<string[]>([]);
  const [expandedPOs, setExpandedPOs] = useState<Set<string>>(new Set());
  const [selectedStyleId, setSelectedStyleId] = useState<number | null>(null);

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
      const response = await ordersApi.getOrders(1, 500, filters || {});
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

  // Handle deep-link from dashboard warnings centre
  useEffect(() => {
    if (!orders.length) return;
    if (openStyleParam) {
      const id = parseInt(openStyleParam, 10);
      const found = orders.find(o => o.id === id);
      if (found) {
        setExpandedPOs(prev => new Set(prev).add(found.po_number));
        setSelectedStyleId(id);
      }
    } else if (expandPOParam) {
      setExpandedPOs(prev => new Set(prev).add(expandPOParam));
      // Scroll to the PO card
      setTimeout(() => {
        const el = document.getElementById(`po-card-${expandPOParam}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 200);
    }
  }, [orders.length, openStyleParam, expandPOParam]);

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
        o.colour?.toLowerCase().includes(q)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
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
    const counts: Record<string, number> = { all: orders.length };
    for (const o of orders) {
      const s = o.status || 'Unknown';
      counts[s] = (counts[s] || 0) + 1;
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
              onClick={() => setStatusFilter('all')}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border',
                statusFilter === 'all'
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              )}
            >
              All Orders
              <span className="ml-1.5 opacity-70">{statusCounts.all || 0}</span>
            </button>
            {statuses.filter(s => s !== 'Shipped').map(status => {
              const style = getStatusStyle(status);
              const count = statusCounts[status] || 0;
              if (count === 0) return null;
              return (
                <button
                  key={status}
                  onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}
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

  const sizes = getSizeBreakdown(order);
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
        className="w-full max-w-[1200px] max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
      {/* Header */}
      <div className="px-6 py-4 bg-gradient-to-r from-gray-900 to-gray-800 text-white flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-bold">{order.po_number}</h3>
              <span className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
                statusStyle.bg, statusStyle.text
              )}>
                <span className={cn('w-1.5 h-1.5 rounded-full', statusStyle.dot)} />
                {order.status || 'Unknown'}
              </span>
              {order.is_late && (
                <span className="px-2 py-0.5 bg-red-500/20 text-red-300 rounded-full text-[10px] font-semibold">
                  LATE
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {order.style_code && <span className="text-gray-300">{order.style_code}</span>}
              {order.colour && <span> · {order.colour}</span>}
              {order.description && <span className="text-gray-400"> · {order.description}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setModalTab(modalTab === 'comments' ? 'details' : 'comments'); modalContentRef.current?.scrollTo(0, 0); }}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5",
                modalTab === 'comments'
                  ? 'text-white bg-white/25'
                  : 'text-white bg-white/10 hover:bg-white/20'
              )}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              {modalTab === 'comments' ? 'Details' : 'Comments'}
              {modalTab !== 'comments' && (order.unread_comment_count || 0) > 0 && (
                <span className="px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full">
                  {order.unread_comment_count}
                </span>
              )}
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              title="Close (Esc)"
            >
              <X className="w-4 h-4 text-gray-300" />
            </button>
          </div>
        </div>
      </div>

      {/* Content - 2 column layout */}
      <div ref={modalContentRef} className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* LEFT COLUMN - 2/5: Product info + Stats (hidden when comments tab active) */}
        <div className={cn('lg:col-span-2 space-y-5', modalTab === 'comments' && 'hidden')}>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-3">
          {hasCol('total_quantity') && (
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-gray-900">{formatQty(order.total_quantity)}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Total Qty</p>
            </div>
          )}
          {hasCol('trade_price') && !isDesigner && (
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-gray-900">{formatCurrency(order.trade_price)}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Cost Price</p>
            </div>
          )}
          {hasCol('total_order_value') && !isDesigner && (
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-gray-900">{formatCurrency(order.total_order_value)}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Order Value</p>
            </div>
          )}
        </div>

        {/* Size Breakdown */}
        {sizes.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Layers className="w-3.5 h-3.5" />
              Size Breakdown
            </h4>
            <div className="space-y-1.5">
              {sizes.map(s => (
                <div key={s.label} className="flex items-center gap-3">
                  <span className="text-xs font-medium text-gray-500 w-8 text-right">{s.label}</span>
                  <div className="flex-1 h-6 bg-gray-100 rounded-md overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary-400 to-primary-500 rounded-md flex items-center justify-end pr-2 transition-all duration-500"
                      style={{ width: `${Math.max(((s.value || 0) / maxSize) * 100, 8)}%` }}
                    >
                      <span className="text-[10px] font-bold text-white">{s.value}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Product Info */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Package className="w-3.5 h-3.5" />
            Product Details
          </h4>
          <div className="space-y-2">
            {hasCol('description') && <DetailRow label="Description" value={order.description} editable={canEdit('description')} onSave={(v) => onSave?.(order.id, 'description', v)} />}
            {hasCol('customer') && <DetailRow label="Customer" value={order.customer} editable={canEdit('customer')} onSave={(v) => onSave?.(order.id, 'customer', v)} />}
            {hasCol('customer_po_number') && <DetailRow label="Customer PO#" value={order.customer_po_number} editable={canEdit('customer_po_number')} onSave={(v) => onSave?.(order.id, 'customer_po_number', v)} />}
            {hasCol('system_po_number') && !isSupplier && <DetailRow label="System PO#" value={order.system_po_number} editable={canEdit('system_po_number')} onSave={(v) => onSave?.(order.id, 'system_po_number', v)} />}
            {hasCol('china_orderbook_ref') && <DetailRow label="China Orderbook Ref" value={order.china_orderbook_ref} editable={canEdit('china_orderbook_ref')} onSave={(v) => onSave?.(order.id, 'china_orderbook_ref', v)} />}
            {hasCol('season') && <DetailRow label="Season" value={order.season} editable={canEdit('season')} onSave={(v) => onSave?.(order.id, 'season', v)} />}
            {hasCol('factory') && <DetailRow label="Factory" value={order.factory} editable={canEdit('factory')} onSave={(v) => onSave?.(order.id, 'factory', v)} />}
            {hasCol('gender') && <DetailRow label="Gender" value={order.gender} editable={canEdit('gender')} onSave={(v) => onSave?.(order.id, 'gender', v)} extra={<SizeGuideTooltip gender={order.gender} />} />}
            {hasCol('terms') && <DetailRow label="Terms" value={order.terms} editable={canEdit('terms')} onSave={(v) => onSave?.(order.id, 'terms', v)} />}
            {hasCol('sales_person') && !isSupplier && <DetailRow label="Sales Person" value={order.sales_person} editable={canEdit('sales_person')} onSave={(v) => onSave?.(order.id, 'sales_person', v)} />}
            {hasCol('direct_repeat_new') && <DetailRow label="Direct Repeat/New" value={order.direct_repeat_new} editable={canEdit('direct_repeat_new')} onSave={(v) => onSave?.(order.id, 'direct_repeat_new', v)} />}
          </div>
        </div>

        {/* Shipping */}
        {(hasCol('vessel_name') || hasCol('fcl_lcl') || order.tracking_reference) && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Truck className="w-3.5 h-3.5" />
              Shipping
            </h4>
            <div className="space-y-2">
              {hasCol('fcl_lcl') && <DetailRow label="FCL/LCL" value={order.fcl_lcl} editable={canEdit('fcl_lcl')} onSave={(v) => onSave?.(order.id, 'fcl_lcl', v)} />}
              {hasCol('vessel_name') && <DetailRow label="Vessel Name" value={order.vessel_name} editable={canEdit('vessel_name')} onSave={(v) => onSave?.(order.id, 'vessel_name', v)} />}
              {order.tracking_reference && <DetailRow label="Tracking Ref" value={order.tracking_reference} editable={canEdit('tracking_reference')} onSave={(v) => onSave?.(order.id, 'tracking_reference', v)} />}
            </div>
          </div>
        )}
        </div>

        {/* RIGHT COLUMN */}
        <div className={cn('flex flex-col gap-5', modalTab === 'comments' ? 'lg:col-span-5' : 'lg:col-span-3')}>

        {modalTab === 'comments' ? (
          <InlineComments order={order} onCommentCountChange={onCommentCountChange} />
        ) : (
        <>
        {/* Timeline / Key Dates */}
        <div className="order-3">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5" />
            Timeline
          </h4>
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-200" />

            <div className="space-y-0">
              {hasCol('order_received_date') && <TimelineItem label="Order Received" date={order.order_received_date} editable={canEdit('order_received_date')} onSave={(v) => onSave?.(order.id, 'order_received_date', v)} />}
              {hasCol('order_sent_to_factory_date') && <TimelineItem label="Sent to Factory" date={order.order_sent_to_factory_date} editable={canEdit('order_sent_to_factory_date')} onSave={(v) => onSave?.(order.id, 'order_sent_to_factory_date', v)} />}
              {hasCol('tech_packs_sent_to_factory') && <TimelineItem label="Tech Packs Sent" date={order.tech_packs_sent_to_factory} editable={canEdit('tech_packs_sent_to_factory')} onSave={(v) => onSave?.(order.id, 'tech_packs_sent_to_factory', v)} />}
              {hasCol('specs_sent_to_factory') && <TimelineItem label="Specs Sent" date={order.specs_sent_to_factory} editable={canEdit('specs_sent_to_factory')} onSave={(v) => onSave?.(order.id, 'specs_sent_to_factory', v)} />}
              {hasCol('barcodes_sent_to_factory') && <TimelineItem label="Barcodes Sent" date={order.barcodes_sent_to_factory} editable={canEdit('barcodes_sent_to_factory')} onSave={(v) => onSave?.(order.id, 'barcodes_sent_to_factory', v)} />}
              {hasCol('original_po_ex_factory') && <TimelineItem label="Requested Ex-Factory" date={order.original_po_ex_factory} editable={canEdit('original_po_ex_factory')} onSave={(v) => onSave?.(order.id, 'original_po_ex_factory', v)} />}
              {hasCol('factory_confirmed_ex_factory') && <TimelineItem label="Factory Confirmed Ex-Fac" date={order.factory_confirmed_ex_factory} highlight editable={canEdit('factory_confirmed_ex_factory')} onSave={(v) => onSave?.(order.id, 'factory_confirmed_ex_factory', v)} />}
              {hasCol('revised_po_ex_factory') && <TimelineItem label="Revised Ex-Factory" date={order.revised_po_ex_factory} highlight editable={canEdit('revised_po_ex_factory')} onSave={(v) => onSave?.(order.id, 'revised_po_ex_factory', v)} />}
              {hasCol('original_del_date_to_customer') && <TimelineItem label="Cust Req Delivery" date={order.original_del_date_to_customer} editable={canEdit('original_del_date_to_customer')} onSave={(v) => onSave?.(order.id, 'original_del_date_to_customer', v)} />}
              {hasCol('eta_to_uk') && <TimelineItem label="ETA UK" date={order.eta_to_uk} />}
              {hasCol('eta_to_customer') && <TimelineItem label="ETA Customer" date={order.eta_to_customer} />}
              {hasCol('vessel_etd') && <TimelineItem label="Vessel ETD" date={order.vessel_etd} editable={canEdit('vessel_etd')} onSave={(v) => onSave?.(order.id, 'vessel_etd', v)} />}
              {hasCol('vessel_eta_to_port') && <TimelineItem label="Vessel ETA Port" date={order.vessel_eta_to_port} editable={canEdit('vessel_eta_to_port')} onSave={(v) => onSave?.(order.id, 'vessel_eta_to_port', v)} />}
              {hasCol('revised_vessel_eta_to_port') && <TimelineItem label="Revised Vessel ETA" date={order.revised_vessel_eta_to_port} editable={canEdit('revised_vessel_eta_to_port')} onSave={(v) => onSave?.(order.id, 'revised_vessel_eta_to_port', v)} />}
              {hasCol('estimated_del_to_customer') && <TimelineItem label="Est Del to Customer" date={order.estimated_del_to_customer} />}
            </div>
          </div>
          {hasCol('customer_po_open_month') && order.customer_po_open_month && (
            <div className="mt-3 flex items-center gap-2 text-xs">
              <span className="text-gray-400">PO Open Month:</span>
              <span className="font-medium text-gray-700">{order.customer_po_open_month}</span>
            </div>
          )}
          {hasCol('expected_dispatch_arrive_uk_month') && order.expected_dispatch_arrive_uk_month && (
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span className="text-gray-400">Expected UK Month:</span>
              <span className="font-medium text-gray-700">{order.expected_dispatch_arrive_uk_month}</span>
            </div>
          )}
        </div>

        {/* Components — shown before samples so component data takes priority */}
        {(hasCol('fit_sample_status') || hasCol('strike_off_status') || hasCol('lab_dip_status')) && (
          <div className="order-1">
            <ComponentsSection orderId={order.id} poNumber={order.po_number} hasCol={hasCol} canEdit={canEdit} onComponentsLoaded={(n) => setHasComponents(n > 0)} />
          </div>
        )}

        {/* Samples — fit/strike off/lab dip rows hidden when components exist */}
        {(hasCol('fit_sample_status') || hasCol('strike_off_status') || hasCol('lab_dip_status') || hasCol('pps_status')) && (
          <div className="order-2">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" />
              Samples
            </h4>
            <div className="grid grid-cols-2 gap-x-6 gap-y-0">
              {/* Fit Sample */}
              {!hasComponents && (hasCol('fit_sample_status') || hasCol('fit_sample_received')) && (
                <div>
                  <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1 mt-3 first:mt-1">Fit Sample</p>
                  {hasCol('fit_sample_required') && <DetailRow label="Required" value={order.fit_sample_required} editable={canEdit('fit_sample_required')} onSave={(v) => onSave?.(order.id, 'fit_sample_required', v)} />}
                  {hasCol('fit_sample_status') && <DetailRow label="Status" value={order.fit_sample_status} editable={canEdit('fit_sample_status')} options={FIT_SAMPLE_STATUS_OPTIONS} onSave={(v) => onSave?.(order.id, 'fit_sample_status', v)} />}
                  {hasCol('fit_sample_received') && <DetailRow label="Received" value={formatDate(order.fit_sample_received)} type="date" rawValue={order.fit_sample_received} editable={canEdit('fit_sample_received')} onSave={(v) => onSave?.(order.id, 'fit_sample_received', v)} />}
                  {hasCol('fit_sample_approved') && <DetailRow label="Approved" value={formatDate(order.fit_sample_approved)} type="date" rawValue={order.fit_sample_approved} editable={canEdit('fit_sample_approved')} onSave={(v) => onSave?.(order.id, 'fit_sample_approved', v)} />}
                </div>
              )}
              {/* Strike Off */}
              {!hasComponents && (hasCol('strike_off_status') || hasCol('strike_off_received')) && (
                <div>
                  <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1 mt-3 first:mt-1">Strike Off</p>
                  {hasCol('strike_off_status') && <DetailRow label="Status" value={order.strike_off_status} editable={canEdit('strike_off_status')} options={SAMPLE_STATUS_OPTIONS} onSave={(v) => onSave?.(order.id, 'strike_off_status', v)} />}
                  {hasCol('strike_off_received') && <DetailRow label="Received" value={formatDate(order.strike_off_received)} type="date" rawValue={order.strike_off_received} editable={canEdit('strike_off_received')} onSave={(v) => onSave?.(order.id, 'strike_off_received', v)} />}
                  {hasCol('strike_off_approved') && <DetailRow label="Approved" value={formatDate(order.strike_off_approved)} type="date" rawValue={order.strike_off_approved} editable={canEdit('strike_off_approved')} onSave={(v) => onSave?.(order.id, 'strike_off_approved', v)} />}
                </div>
              )}
              {/* Lab Dip */}
              {!hasComponents && (hasCol('lab_dip_status') || hasCol('lab_dip_received')) && (
                <div className="pt-6">
                  <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1">Lab Dip</p>
                  {hasCol('lab_dip_status') && <DetailRow label="Status" value={order.lab_dip_status} editable={canEdit('lab_dip_status')} options={SAMPLE_STATUS_OPTIONS} onSave={(v) => onSave?.(order.id, 'lab_dip_status', v)} />}
                  {hasCol('lab_dip_received') && <DetailRow label="Received" value={formatDate(order.lab_dip_received)} type="date" rawValue={order.lab_dip_received} editable={canEdit('lab_dip_received')} onSave={(v) => onSave?.(order.id, 'lab_dip_received', v)} />}
                  {hasCol('lab_dip_approved') && <DetailRow label="Approved" value={formatDate(order.lab_dip_approved)} type="date" rawValue={order.lab_dip_approved} editable={canEdit('lab_dip_approved')} onSave={(v) => onSave?.(order.id, 'lab_dip_approved', v)} />}
                </div>
              )}
              {/* PPS */}
              {(hasCol('pps_status') || hasCol('pps_received')) && (
                <div className="pt-6">
                  <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1">PPS</p>
                  {hasCol('pps_status') && <DetailRow label="Status" value={order.pps_status} editable={canEdit('pps_status')} options={SAMPLE_STATUS_OPTIONS} onSave={(v) => onSave?.(order.id, 'pps_status', v)} />}
                  {hasCol('pps_received') && <DetailRow label="Received" value={formatDate(order.pps_received)} type="date" rawValue={order.pps_received} editable={canEdit('pps_received')} onSave={(v) => onSave?.(order.id, 'pps_received', v)} />}
                  {hasCol('pps_sent_to_customer') && <DetailRow label="Sent to Cust" value={formatDate(order.pps_sent_to_customer)} type="date" rawValue={order.pps_sent_to_customer} editable={canEdit('pps_sent_to_customer')} onSave={(v) => onSave?.(order.id, 'pps_sent_to_customer', v)} />}
                  {hasCol('pps_approved') && <DetailRow label="Approved" value={formatDate(order.pps_approved)} type="date" rawValue={order.pps_approved} editable={canEdit('pps_approved')} onSave={(v) => onSave?.(order.id, 'pps_approved', v)} />}
                </div>
              )}
            </div>
            {/* Other samples */}
            <div className="grid grid-cols-2 gap-x-6 mt-4">
              <div>
                {hasCol('photo_sample_received') && <DetailRow label="Photo Sample Rcvd" value={formatDate(order.photo_sample_received)} type="date" rawValue={order.photo_sample_received} editable={canEdit('photo_sample_received')} onSave={(v) => onSave?.(order.id, 'photo_sample_received', v)} />}
                {hasCol('ex_factory_from_pp_approval') && <DetailRow label="Ex-Fac from PP Appr" value={formatDate(order.ex_factory_from_pp_approval)} type="date" rawValue={order.ex_factory_from_pp_approval} editable={canEdit('ex_factory_from_pp_approval')} onSave={(v) => onSave?.(order.id, 'ex_factory_from_pp_approval', v)} />}
              </div>
              <div>
                {hasCol('shipment_sample_received') && <DetailRow label="Shipment Sample Rcvd" value={formatDate(order.shipment_sample_received)} type="date" rawValue={order.shipment_sample_received} editable={canEdit('shipment_sample_received')} onSave={(v) => onSave?.(order.id, 'shipment_sample_received', v)} />}
              </div>
            </div>
          </div>
        )}
        </>
        )}

        </div>
      </div>

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

// ─── Size Guide ───────────────────────────────────────────

// Size slot keys in positional order (maps to SIZE_GUIDE labels)
const SIZE_SLOT_KEYS: (keyof Order)[] = [
  'size_2xs', 'size_xs', 'size_s', 'size_m', 'size_l', 'size_xl',
  'size_2xl', 'size_3xl', 'size_4xl', 'size_5xl', 'size_11', 'size_12', 'size_13', 'size_14',
];

const DEFAULT_SIZE_LABELS = ['2XS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', 'S11', 'S12', 'S13', 'S14'];

const SIZE_GUIDE = [
  { code: '001', label: 'MENS/ ADULTS', sizes: ['2XS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'] },
  { code: '002', label: 'LADIES', sizes: ['6', '8', '10', '12', '14', '16', '18', '20', '22', '24'] },
  { code: '003', label: 'KIDS LETTER', sizes: ['XSB', 'SB', 'MB', 'LB', 'XLB'] },
  { code: '004', label: 'KIDS', sizes: ['2-3', '4-5', '6-7', '8-9', '10-11', '12-13', '14-15'] },
  { code: '005', label: 'KIDS ALT 1', sizes: ['2-3', '3-4', '5-6', '7-8', '9-10', '11-12', '13'] },
  { code: '006', label: 'LADIES LETTER', sizes: ['2XS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'] },
  { code: '007', label: 'KIDS ALT 2', sizes: ['3-4', '4-5', '6-7', '8-9', '10-11', '12-13'] },
  { code: '008', label: 'BABY', sizes: ['0-3M', '3-6M', '6-9M', '9-12M', '12-18M', '18-24M/ 18-23M'] },
  { code: '009', label: 'ACCESSORIES/ HEADWEAR', sizes: ['ONE SIZE', 'BABY', 'JUNIOR', 'ADULT', '6-12 M', '1-3 YRS', 'INFANT'] },
  { code: '010', label: 'MENS FOOTWEAR', sizes: ['3-6', '7-11', '7-8', '9-10', '11-12'] },
  { code: '011', label: 'KIDS FOOTWEAR', sizes: ['10-11', '12-13', '1-2', '3-4', '5-6'] },
  { code: '012', label: 'DOG', sizes: ['XS', 'S', 'M', 'L', 'XL', 'S/M', 'M/L'] },
  { code: '013', label: 'LADIES DUAL', sizes: ['8-10', '12-14', '16-18', '20-22'] },
  { code: '014', label: 'KIDS DRY ROBE', sizes: ['5-9 YRS', '10-13YRS'] },
  { code: '015', label: 'KIDS 3-15', sizes: ['3/4', '4/5', '5/6', '6/7', '7/8', '8/9', '9/10', '10/11', '11/12', '12/13', '13/14', '14/15'] },
];

function getSizeBreakdown(order: Order): { label: string; value: number }[] {
  const genderCode = order.gender ? order.gender.split('-')[0]?.trim() : '';
  const guide = SIZE_GUIDE.find(g => g.code === genderCode);
  const labels = guide ? guide.sizes : DEFAULT_SIZE_LABELS;

  return SIZE_SLOT_KEYS.map((key, i) => ({
    label: labels[i] || DEFAULT_SIZE_LABELS[i] || `S${i + 1}`,
    value: (order[key] as number) || 0,
  })).filter(s => s.value > 0);
}

function SizeGuideTooltip({ gender }: { gender: string | undefined }) {
  const [show, setShow] = useState(false);
  const matchCode = gender ? gender.split('-')[0]?.trim() : '';

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
    <div className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400 flex items-center gap-1">{label}{extra}</span>
      {editing ? (
        options ? (
          <StatusDropdown
            value={editValue}
            options={options}
            onSave={(v) => handleSave(v)}
            onCancel={() => setEditing(false)}
            size="sm"
          />
        ) : (
          <input
            type={type === 'date' ? 'date' : 'text'}
            value={editValue}
            onChange={(e) => { setEditValue(e.target.value); if (type === 'date') handleSave(e.target.value); }}
            onBlur={() => { if (type !== 'date') handleSave(); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
            autoFocus
            className="text-xs border border-primary-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-500 w-[160px] text-right"
          />
        )
      ) : (
        <span
          className={cn(
            'text-xs font-medium text-gray-700 text-right max-w-[200px] truncate',
            editable && 'cursor-pointer hover:text-primary-600'
          )}
          onClick={() => { if (editable) startEdit(); }}
          title={editable ? 'Click to edit' : undefined}
        >
          {value || '—'}
        </span>
      )}
    </div>
  );
}

function TimelineItem({ label, date, highlight, editable, onSave }: {
  label: string;
  date: string | null | undefined;
  highlight?: boolean;
  editable?: boolean;
  onSave?: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const hasDate = !!date;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onSave?.(val);
    setEditing(false);
  };

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
          <input
            type="date"
            defaultValue={date ? date.split('T')[0] : ''}
            onChange={handleChange}
            onBlur={() => setEditing(false)}
            autoFocus
            className="text-xs border border-primary-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-500 w-[130px]"
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
