'use client';

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
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
} from 'lucide-react';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/layout/AuthProvider';
import { CommentSidebar } from '@/components/orders/CommentSidebar';
import { ComponentsSection } from '@/components/orders/FactoryV2View';
import { useStore } from '@/store/useStore';
import { ordersApi, excelApi, statusesApi, OrderFilters } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Order } from '@/types';
import { COLUMNS, FACTORY_PRODUCT_COLUMNS, FACTORY_SHIPPING_COLUMNS } from '@/types';

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

  const handleCommentClick = (order: Order) => {
    setSelectedOrder(order);
    setSidebarOpen(true);
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

        {/* ─── Left: Order List ─── */}
        <div className={cn(
          'flex flex-col min-w-0 transition-all duration-300',
          selectedStyle ? 'flex-1' : 'w-full'
        )}>

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
            <span>{formatCurrency(orders.reduce((sum, o) => sum + (o.total_order_value || 0), 0))} total value</span>
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
                />
              ))
            )}
          </div>
        </div>

        {/* ─── Right: Detail Panel ─── */}
        {selectedStyle && (
          <DetailPanel
            order={selectedStyle}
            onClose={() => setSelectedStyleId(null)}
            onCommentClick={() => handleCommentClick(selectedStyle)}
            isSupplier={isSupplier}
            view={viewParam}
            onSave={handleDetailSave}
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
}: {
  group: POGroup;
  isExpanded: boolean;
  onToggle: () => void;
  onStyleClick: (order: Order) => void;
  onCommentClick: (order: Order) => void;
  selectedStyleId: number | null;
  isSupplier: boolean;
}) {
  const statusStyle = getStatusStyle(group.statusSummary);
  const hasMultipleStatuses = new Set(group.styles.map(s => s.status)).size > 1;

  return (
    <div className={cn(
      'bg-white rounded-xl border transition-all',
      isExpanded ? 'border-primary-200 shadow-sm' : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
    )}>
      {/* PO Header */}
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center gap-4 text-left"
      >
        <ChevronRight className={cn(
          'w-4 h-4 text-gray-400 transition-transform flex-shrink-0',
          isExpanded && 'rotate-90'
        )} />

        {/* PO Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-gray-900">{group.po_number}</span>
            <span className="text-xs text-gray-400">·</span>
            <span className="text-xs text-gray-500 truncate">{group.customer}</span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-gray-400">{group.factory}</span>
            <span className="text-xs text-gray-300">·</span>
            <span className="text-xs text-gray-400">{group.styles.length} style{group.styles.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Qty */}
        <div className="text-right flex-shrink-0 w-20">
          <p className="text-sm font-semibold text-gray-900">{formatQty(group.totalQty)}</p>
          <p className="text-[11px] text-gray-400">units</p>
        </div>

        {/* Value */}
        {!isSupplier && (
          <div className="text-right flex-shrink-0 w-24">
            <p className="text-sm font-semibold text-gray-900">{formatCurrency(group.totalValue)}</p>
            <p className="text-[11px] text-gray-400">value</p>
          </div>
        )}

        {/* Ex-Factory Date */}
        <div className="text-right flex-shrink-0 w-24">
          <p className="text-xs font-medium text-gray-700">{formatDate(group.latestDate)}</p>
          <p className="text-[11px] text-gray-400">ex-factory</p>
        </div>

        {/* Status */}
        <div className="flex-shrink-0 w-32 text-right">
          <span className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
            statusStyle.bg, statusStyle.text
          )}>
            <span className={cn('w-1.5 h-1.5 rounded-full', statusStyle.dot)} />
            {group.statusSummary || 'Unknown'}
          </span>
          {hasMultipleStatuses && (
            <p className="text-[10px] text-gray-400 mt-0.5">mixed</p>
          )}
        </div>

        {/* Unread comments */}
        {group.unreadComments > 0 && (
          <div className="flex-shrink-0 w-8 flex items-center justify-center">
            <div className="relative">
              <MessageSquare className="w-4 h-4 text-primary-400" />
              <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                {group.unreadComments > 9 ? '9+' : group.unreadComments}
              </span>
            </div>
          </div>
        )}
      </button>

      {/* Expanded: Style List */}
      {isExpanded && (
        <div className="border-t border-gray-100">
          {/* Style Header */}
          <div className="grid grid-cols-12 gap-2 px-5 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50/60">
            <div className="col-span-2">Style</div>
            <div className="col-span-2">Description</div>
            <div className="col-span-1">Colour</div>
            <div className="col-span-1 text-right">Qty</div>
            {!isSupplier && <div className="col-span-1 text-right">Value</div>}
            <div className={cn('text-right', isSupplier ? 'col-span-2' : 'col-span-1')}>Ex-Factory</div>
            <div className="col-span-2">Status</div>
            <div className={cn('text-right', isSupplier ? 'col-span-2' : 'col-span-2')} />
          </div>

          {/* Style Rows */}
          {group.styles.map((style) => {
            const ss = getStatusStyle(style.status);
            const isSelected = style.id === selectedStyleId;
            return (
              <div
                key={style.id}
                onClick={() => onStyleClick(style)}
                className={cn(
                  'grid grid-cols-12 gap-2 px-5 py-3 items-center cursor-pointer transition-colors border-t border-gray-50',
                  isSelected ? 'bg-primary-50/60' : 'hover:bg-gray-50/60'
                )}
              >
                <div className="col-span-2">
                  <p className="text-sm font-medium text-gray-900 truncate">{style.style_code || '—'}</p>
                  {style.customer_style_code && (
                    <p className="text-[11px] text-gray-400 truncate">{style.customer_style_code}</p>
                  )}
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-gray-600 truncate">{style.description || '—'}</p>
                </div>
                <div className="col-span-1">
                  <p className="text-sm text-gray-600 truncate">{style.colour || '—'}</p>
                </div>
                <div className="col-span-1 text-right">
                  <p className="text-sm font-medium text-gray-900">{formatQty(style.total_quantity)}</p>
                </div>
                {!isSupplier && (
                  <div className="col-span-1 text-right">
                    <p className="text-xs text-gray-500">{formatCurrency(style.total_order_value)}</p>
                  </div>
                )}
                <div className={cn('text-right', isSupplier ? 'col-span-2' : 'col-span-1')}>
                  <p className="text-xs text-gray-600">
                    {formatDate(style.revised_po_ex_factory || style.original_po_ex_factory)}
                  </p>
                </div>
                <div className="col-span-2">
                  <span className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold',
                    ss.bg, ss.text
                  )}>
                    <span className={cn('w-1 h-1 rounded-full', ss.dot)} />
                    {style.status || 'Unknown'}
                  </span>
                </div>
                <div className={cn('flex items-center justify-end gap-2', isSupplier ? 'col-span-2' : 'col-span-2')}>
                  {(style.comment_count || 0) > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onCommentClick(style); }}
                      className="relative p-1.5 hover:bg-primary-50 rounded-lg transition-colors"
                    >
                      {(style.unread_comment_count || 0) > 0 ? (
                        <MessageSquare className="w-3.5 h-3.5 text-primary-500 fill-current" />
                      ) : (
                        <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
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
  view,
  onSave,
}: {
  order: Order;
  onClose: () => void;
  onCommentClick: () => void;
  isSupplier: boolean;
  view: string | null;
  onSave?: (orderId: number, field: string, value: any) => void;
}) {
  const isProductView = view === 'factory-product';
  const isShippingView = view === 'factory-shipping';
  const allowedCols = isProductView ? new Set(FACTORY_PRODUCT_COLUMNS)
    : isShippingView ? new Set(FACTORY_SHIPPING_COLUMNS)
    : null;
  const hasCol = (key: string) => !allowedCols || allowedCols.has(key);

  // Check editability from COLUMNS definitions — same source of truth as the table
  const canEdit = (key: string) => {
    if (isSupplier) {
      const col = COLUMNS.find(c => c.key === key);
      return col?.supplierEditable ?? false;
    }
    const col = COLUMNS.find(c => c.key === key);
    return col?.editable ?? false;
  };

  const [hasComponents, setHasComponents] = useState(false);
  const statusStyle = getStatusStyle(order.status);

  const sizes = [
    { label: '2XS', value: order.size_2xs },
    { label: 'XS', value: order.size_xs },
    { label: 'S', value: order.size_s },
    { label: 'M', value: order.size_m },
    { label: 'L', value: order.size_l },
    { label: 'XL', value: order.size_xl },
    { label: '2XL', value: order.size_2xl },
    { label: '3XL', value: order.size_3xl },
    { label: '4XL', value: order.size_4xl },
    { label: '5XL', value: order.size_5xl },
    { label: 'S11', value: order.size_11 },
    { label: 'S12', value: order.size_12 },
    { label: 'S13', value: order.size_13 },
    { label: 'S14', value: order.size_14 },
  ].filter(s => s.value && s.value > 0);

  const maxSize = Math.max(...sizes.map(s => s.value || 0), 1);

  return (
    <div className="w-[420px] flex-shrink-0 bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-5 py-4 bg-gradient-to-r from-gray-900 to-gray-800 text-white">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-base font-bold">{order.po_number}</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {order.style_code && <span className="text-gray-300">{order.style_code}</span>}
              {order.colour && <span> · {order.colour}</span>}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
        <div className="flex items-center gap-2">
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
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-3">
          {hasCol('total_quantity') && (
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-gray-900">{formatQty(order.total_quantity)}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Total Qty</p>
            </div>
          )}
          {hasCol('trade_price') && (
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-gray-900">{formatCurrency(order.trade_price)}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Cost Price</p>
            </div>
          )}
          {hasCol('total_order_value') && (
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
            {hasCol('description') && <DetailRow label="Description" value={order.description} />}
            {hasCol('customer') && <DetailRow label="Customer" value={order.customer} />}
            {hasCol('customer_po_number') && <DetailRow label="Customer PO#" value={order.customer_po_number} />}
            {hasCol('system_po_number') && !isSupplier && <DetailRow label="System PO#" value={order.system_po_number} />}
            {hasCol('china_orderbook_ref') && <DetailRow label="China Orderbook Ref" value={order.china_orderbook_ref} />}
            {hasCol('season') && <DetailRow label="Season" value={order.season} />}
            {hasCol('factory') && <DetailRow label="Factory" value={order.factory} />}
            {hasCol('gender') && <DetailRow label="Gender" value={order.gender} />}
            {hasCol('terms') && <DetailRow label="Terms" value={order.terms} />}
            {hasCol('sales_person') && !isSupplier && <DetailRow label="Sales Person" value={order.sales_person} />}
            {hasCol('direct_repeat_new') && <DetailRow label="Direct Repeat/New" value={order.direct_repeat_new} />}
          </div>
        </div>

        {/* Timeline / Key Dates */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5" />
            Timeline
          </h4>
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-200" />

            <div className="space-y-0">
              {hasCol('order_received_date') && <TimelineItem label="Order Received" date={order.order_received_date} />}
              {hasCol('order_sent_to_factory_date') && <TimelineItem label="Sent to Factory" date={order.order_sent_to_factory_date} />}
              {hasCol('tech_packs_sent_to_factory') && <TimelineItem label="Tech Packs Sent" date={order.tech_packs_sent_to_factory} />}
              {hasCol('specs_sent_to_factory') && <TimelineItem label="Specs Sent" date={order.specs_sent_to_factory} />}
              {hasCol('barcodes_sent_to_factory') && <TimelineItem label="Barcodes Sent" date={order.barcodes_sent_to_factory} />}
              {hasCol('original_po_ex_factory') && <TimelineItem label="Requested Ex-Factory" date={order.original_po_ex_factory} />}
              {hasCol('factory_confirmed_ex_factory') && <TimelineItem label="Factory Confirmed Ex-Fac" date={order.factory_confirmed_ex_factory} highlight editable={canEdit('factory_confirmed_ex_factory')} onSave={(v) => onSave?.(order.id, 'factory_confirmed_ex_factory', v)} />}
              {hasCol('revised_po_ex_factory') && <TimelineItem label="Revised Ex-Factory" date={order.revised_po_ex_factory} highlight editable={canEdit('revised_po_ex_factory')} onSave={(v) => onSave?.(order.id, 'revised_po_ex_factory', v)} />}
              {hasCol('original_del_date_to_customer') && <TimelineItem label="Cust Req Delivery" date={order.original_del_date_to_customer} />}
              {hasCol('eta_to_uk') && <TimelineItem label="ETA UK" date={order.eta_to_uk} />}
              {hasCol('eta_to_customer') && <TimelineItem label="ETA Customer" date={order.eta_to_customer} />}
              {hasCol('vessel_etd') && <TimelineItem label="Vessel ETD" date={order.vessel_etd} />}
              {hasCol('vessel_eta_to_port') && <TimelineItem label="Vessel ETA Port" date={order.vessel_eta_to_port} />}
              {hasCol('revised_vessel_eta_to_port') && <TimelineItem label="Revised Vessel ETA" date={order.revised_vessel_eta_to_port} />}
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
          <ComponentsSection orderId={order.id} poNumber={order.po_number} hasCol={hasCol} canEdit={canEdit} onComponentsLoaded={(n) => setHasComponents(n > 0)} />
        )}

        {/* Samples — fit/strike off/lab dip rows hidden when components exist */}
        {(hasCol('fit_sample_status') || hasCol('strike_off_status') || hasCol('lab_dip_status') || hasCol('pps_status')) && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" />
              Samples
            </h4>
            <div className="space-y-2">
              {!hasComponents && hasCol('fit_sample_required') && <DetailRow label="Fit Sample Req" value={order.fit_sample_required} />}
              {!hasComponents && hasCol('fit_sample_status') && <DetailRow label="Fit Sample Status" value={order.fit_sample_status} />}
              {!hasComponents && hasCol('fit_sample_received') && <DetailRow label="Fit Sample Rcvd" value={formatDate(order.fit_sample_received)} />}
              {!hasComponents && hasCol('fit_sample_approved') && <DetailRow label="Fit Sample Appr" value={formatDate(order.fit_sample_approved)} />}
              {!hasComponents && hasCol('strike_off_status') && <DetailRow label="Strike Off Status" value={order.strike_off_status} />}
              {!hasComponents && hasCol('strike_off_received') && <DetailRow label="Strike Off Rcvd" value={formatDate(order.strike_off_received)} />}
              {!hasComponents && hasCol('strike_off_approved') && <DetailRow label="Strike Off Appr" value={formatDate(order.strike_off_approved)} />}
              {!hasComponents && hasCol('lab_dip_status') && <DetailRow label="Lab Dip Status" value={order.lab_dip_status} />}
              {!hasComponents && hasCol('lab_dip_received') && <DetailRow label="Lab Dip Rcvd" value={formatDate(order.lab_dip_received)} />}
              {!hasComponents && hasCol('lab_dip_approved') && <DetailRow label="Lab Dip Appr" value={formatDate(order.lab_dip_approved)} />}
              {hasCol('pps_status') && <DetailRow label="PPS Status" value={order.pps_status} />}
              {hasCol('pps_received') && <DetailRow label="PPS Received" value={formatDate(order.pps_received)} />}
              {hasCol('pps_sent_to_customer') && <DetailRow label="PPS Sent to Cust" value={formatDate(order.pps_sent_to_customer)} />}
              {hasCol('pps_approved') && <DetailRow label="PPS Approved" value={formatDate(order.pps_approved)} />}
              {hasCol('photo_sample_received') && <DetailRow label="Photo Sample Rcvd" value={formatDate(order.photo_sample_received)} />}
              {hasCol('ex_factory_from_pp_approval') && <DetailRow label="Ex-Fac from PP Appr" value={formatDate(order.ex_factory_from_pp_approval)} />}
              {hasCol('shipment_sample_received') && <DetailRow label="Shipment Sample Rcvd" value={formatDate(order.shipment_sample_received)} />}
            </div>
          </div>
        )}

        {/* Shipping */}
        {hasCol('vessel_name') && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Truck className="w-3.5 h-3.5" />
              Shipping
            </h4>
            <div className="space-y-2">
              {hasCol('fcl_lcl') && <DetailRow label="FCL/LCL" value={order.fcl_lcl} />}
              {hasCol('vessel_name') && <DetailRow label="Vessel Name" value={order.vessel_name} />}
              {order.tracking_reference && <DetailRow label="Tracking Ref" value={order.tracking_reference} />}
            </div>
          </div>
        )}

        {/* Tracking only (when no vessel columns) */}
        {!hasCol('vessel_name') && order.tracking_reference && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
              <Truck className="w-3.5 h-3.5" />
              Shipping
            </h4>
            <div className="bg-blue-50 rounded-xl px-4 py-3 text-sm font-medium text-blue-700">
              {order.tracking_reference}
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="border-t border-gray-100 px-5 py-3 flex items-center gap-2">
        <button
          onClick={onCommentClick}
          className="flex-1 px-4 py-2 text-sm font-medium text-primary-700 bg-primary-50 rounded-xl hover:bg-primary-100 transition-colors flex items-center justify-center gap-2"
        >
          <MessageSquare className="w-4 h-4" />
          Comments
          {(order.unread_comment_count || 0) > 0 && (
            <span className="px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full">
              {order.unread_comment_count}
            </span>
          )}
        </button>
        <p className="text-[11px] text-gray-400">
          Updated {timeAgo(order.updated_at)}
        </p>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-xs font-medium text-gray-700 text-right max-w-[200px] truncate">{value || '—'}</span>
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
    <div className="flex items-center gap-3 py-2 relative">
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
              editable && 'cursor-pointer hover:text-primary-600 bg-green-50 px-1.5 py-0.5 rounded border border-green-200/60'
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
