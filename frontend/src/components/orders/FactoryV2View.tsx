'use client';

import { useEffect, useState, useCallback, useMemo, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  RefreshCw,
  X,
  ChevronRight,
  ChevronDown,
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
} from 'lucide-react';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { AppShell } from '@/components/layout/AppShell';
import { CommentSidebar } from '@/components/orders/CommentSidebar';
import { useStore } from '@/store/useStore';
import { ordersApi, statusesApi, settingsApi, componentsApi, OrderFilters } from '@/lib/api';
import { StatusDropdown } from '@/components/orders/StatusDropdown';
import { InlineComments } from '@/components/orders/InlineComments';
import { cn } from '@/lib/utils';
import type { Order, OrderComponent } from '@/types';
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
  const tableRoute = isProductView ? '/factory-product' : '/factory-shipping';

  // Always local state — never touches global store
  const [orders, setOrders] = useState<Order[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);

  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [statuses, setStatuses] = useState<string[]>([]);
  const [expandedPOs, setExpandedPOs] = useState<Set<string>>(new Set());
  const [selectedStyleId, setSelectedStyleId] = useState<number | null>(null);
  const [supplierColumnSettings, setSupplierColumnSettings] = useState<{ column_key: string; is_visible: boolean; is_editable: boolean }[]>([]);

  // Reason modal state for supplier date edits
  const [reasonModal, setReasonModal] = useState<{ orderId: number; field: string; value: string } | null>(null);
  const [changeReason, setChangeReason] = useState('');
  const [isSavingReason, setIsSavingReason] = useState(false);

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
      const response = await ordersApi.getOrders(1, 500, filters || {});
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

    if (statusFilter !== 'all') {
      filtered = filtered.filter(o => o.status === statusFilter);
    }

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
      if (exFactory && (!groups[po].latestDate || exFactory > groups[po].latestDate)) {
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

    return Object.values(groups).sort((a, b) => b.latestUpdate.localeCompare(a.latestUpdate));
  }, [orders, searchQuery, statusFilter]);

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

  const handleRefresh = () => {
    loadOrders();
    toast.success('Orders refreshed');
  };

  const handleDetailSave = async (orderId: number, field: string, value: any) => {
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

  // Load styles on PO when reason modal opens
  useEffect(() => {
    if (reasonModal) {
      const order = orders.find(o => o.id === reasonModal.orderId);
      if (order?.po_number) {
        setLoadingReasonStyles(true);
        ordersApi.getStylesOnPO(order.po_number)
          .then(res => setReasonStylesOnPO(res.orders))
          .catch(console.error)
          .finally(() => setLoadingReasonStyles(false));
      }
    }
  }, [reasonModal, orders]);

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
                <input
                  type="date"
                  value={reasonModal.value?.split('T')[0] || ''}
                  onChange={(e) => setReasonModal({ ...reasonModal, value: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
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
                        {reasonStylesOnPO
                          .filter(s => s.id !== reasonModal.orderId)
                          .map((style) => (
                            <label key={style.id} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={reasonSelectedIds.includes(style.id)}
                                onChange={(e) => {
                                  setReasonSelectedIds(prev =>
                                    e.target.checked
                                      ? [...prev, style.id]
                                      : prev.filter(id => id !== style.id)
                                  );
                                }}
                                className="w-3.5 h-3.5 text-primary-600 focus:ring-primary-500 rounded"
                              />
                              <span className="text-xs text-gray-600">
                                {style.style_code} · {style.colour} — {style.description}
                              </span>
                            </label>
                          ))}
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
              onClick={() => router.push(tableRoute)}
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
            viewType={viewType}
            onSave={handleDetailSave}
            supplierColumnSettings={supplierColumnSettings}
            onCommentCountChange={(orderId, commentCount, unreadCount) => {
              setOrders(prev => prev.map(o => o.id === orderId ? { ...o, comment_count: commentCount, unread_comment_count: unreadCount } : o));
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

        <div className="text-right flex-shrink-0 w-20">
          <p className="text-sm font-semibold text-gray-900">{formatQty(group.totalQty)}</p>
          <p className="text-[11px] text-gray-400">units</p>
        </div>

        {!isSupplier && (
          <div className="text-right flex-shrink-0 w-24">
            <p className="text-sm font-semibold text-gray-900">{formatCurrency(group.totalValue)}</p>
            <p className="text-[11px] text-gray-400">value</p>
          </div>
        )}

        <div className="text-right flex-shrink-0 w-24">
          <p className="text-xs font-medium text-gray-700">{formatDate(group.latestDate)}</p>
          <p className="text-[11px] text-gray-400">ex-factory</p>
        </div>

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

// ─── Size Guide ───────────────────────────────────────────

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
}: {
  order: Order;
  onClose: () => void;
  onCommentClick: () => void;
  isSupplier: boolean;
  viewType: FactoryViewType;
  onSave?: (orderId: number, field: string, value: any) => void;
  supplierColumnSettings: { column_key: string; is_visible: boolean; is_editable: boolean }[];
  onCommentCountChange?: (orderId: number, commentCount: number, unreadCount: number) => void;
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
        {/* LEFT COLUMN */}
        <div className={cn('lg:col-span-2 space-y-5', modalTab === 'comments' && 'hidden')}>

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
            {hasCol('china_orderbook_ref') && <DetailRow label="China Orderbook Ref" value={order.china_orderbook_ref} />}
            {hasCol('season') && <DetailRow label="Season" value={order.season} />}
            {hasCol('factory') && <DetailRow label="Factory" value={order.factory} />}
            {hasCol('gender') && <DetailRow label="Gender" value={order.gender} extra={<SizeGuideTooltip gender={order.gender} />} />}
            {hasCol('terms') && <DetailRow label="Terms" value={order.terms} />}
            {hasCol('direct_repeat_new') && <DetailRow label="Direct Repeat/New" value={order.direct_repeat_new} />}
          </div>
        </div>
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

        {/* Samples — fit/strike off/lab dip rows hidden when components exist (data lives in components instead) */}
        {(hasCol('fit_sample_status') || hasCol('strike_off_status') || hasCol('lab_dip_status') || hasCol('pps_status')) && (
          <div className="order-2">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" />
              Samples
            </h4>
            <div className="grid grid-cols-2 gap-x-6 gap-y-0">
              {!hasComponents && (hasCol('fit_sample_status') || hasCol('fit_sample_received')) && (
                <div>
                  <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1 mt-3 first:mt-1">Fit Sample</p>
                  {hasCol('fit_sample_required') && <DetailRow label="Required" value={order.fit_sample_required} />}
                  {hasCol('fit_sample_status') && <DetailRow label="Status" value={order.fit_sample_status} editable={canEdit('fit_sample_status')} options={FIT_SAMPLE_STATUS_OPTIONS} onSave={(v) => onSave?.(order.id, 'fit_sample_status', v)} />}
                  {hasCol('fit_sample_received') && <DetailRow label="Received" value={formatDate(order.fit_sample_received)} />}
                  {hasCol('fit_sample_approved') && <DetailRow label="Approved" value={formatDate(order.fit_sample_approved)} />}
                </div>
              )}
              {!hasComponents && (hasCol('strike_off_status') || hasCol('strike_off_received')) && (
                <div>
                  <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1 mt-3 first:mt-1">Strike Off</p>
                  {hasCol('strike_off_status') && <DetailRow label="Status" value={order.strike_off_status} editable={canEdit('strike_off_status')} options={SAMPLE_STATUS_OPTIONS} onSave={(v) => onSave?.(order.id, 'strike_off_status', v)} />}
                  {hasCol('strike_off_received') && <DetailRow label="Received" value={formatDate(order.strike_off_received)} />}
                  {hasCol('strike_off_approved') && <DetailRow label="Approved" value={formatDate(order.strike_off_approved)} />}
                </div>
              )}
              {!hasComponents && (hasCol('lab_dip_status') || hasCol('lab_dip_received')) && (
                <div>
                  <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1 mt-3 first:mt-1">Lab Dip</p>
                  {hasCol('lab_dip_status') && <DetailRow label="Status" value={order.lab_dip_status} editable={canEdit('lab_dip_status')} options={SAMPLE_STATUS_OPTIONS} onSave={(v) => onSave?.(order.id, 'lab_dip_status', v)} />}
                  {hasCol('lab_dip_received') && <DetailRow label="Received" value={formatDate(order.lab_dip_received)} />}
                  {hasCol('lab_dip_approved') && <DetailRow label="Approved" value={formatDate(order.lab_dip_approved)} />}
                </div>
              )}
              {(hasCol('pps_status') || hasCol('pps_received')) && (
                <div>
                  <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1 mt-3 first:mt-1">PPS</p>
                  {hasCol('pps_status') && <DetailRow label="Status" value={order.pps_status} editable={canEdit('pps_status')} options={SAMPLE_STATUS_OPTIONS} onSave={(v) => onSave?.(order.id, 'pps_status', v)} />}
                  {hasCol('pps_received') && <DetailRow label="Received" value={formatDate(order.pps_received)} />}
                  {hasCol('pps_sent_to_customer') && <DetailRow label="Sent to Cust" value={formatDate(order.pps_sent_to_customer)} />}
                  {hasCol('pps_approved') && <DetailRow label="Approved" value={formatDate(order.pps_approved)} />}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-6 mt-1">
              <div>
                {hasCol('photo_sample_received') && <DetailRow label="Photo Sample Rcvd" value={formatDate(order.photo_sample_received)} />}
                {hasCol('ex_factory_from_pp_approval') && <DetailRow label="Ex-Fac from PP Appr" value={formatDate(order.ex_factory_from_pp_approval)} />}
              </div>
              <div>
                {hasCol('shipment_sample_received') && <DetailRow label="Shipment Sample Rcvd" value={formatDate(order.shipment_sample_received)} />}
              </div>
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
              {hasCol('fcl_lcl') && <DetailRow label="FCL/LCL" value={order.fcl_lcl} editable={canEdit('fcl_lcl')} onSave={(v) => onSave?.(order.id, 'fcl_lcl', v)} />}
              {hasCol('vessel_name') && <DetailRow label="Vessel Name" value={order.vessel_name} editable={canEdit('vessel_name')} onSave={(v) => onSave?.(order.id, 'vessel_name', v)} />}
              {order.tracking_reference && <DetailRow label="Tracking Ref" value={order.tracking_reference} />}
            </div>
          </div>
        )}

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

// ─── Components Section ───────────────────────────────────

const COMPONENT_SAMPLE_FIELDS: { key: string; label: string; type: string; colKey: string; options?: string[] }[] = [
  { key: 'fit_sample_status', label: 'Fit Status', type: 'text', colKey: 'fit_sample_status', options: FIT_SAMPLE_STATUS_OPTIONS },
  { key: 'fit_sample_received', label: 'Fit Rcvd', type: 'date', colKey: 'fit_sample_received' },
  { key: 'fit_sample_approved', label: 'Fit Appr', type: 'date', colKey: 'fit_sample_approved' },
  { key: 'strike_off_status', label: 'Strike Off Status', type: 'text', colKey: 'strike_off_status', options: SAMPLE_STATUS_OPTIONS },
  { key: 'strike_off_received', label: 'Strike Off Rcvd', type: 'date', colKey: 'strike_off_received' },
  { key: 'strike_off_approved', label: 'Strike Off Appr', type: 'date', colKey: 'strike_off_approved' },
  { key: 'lab_dip_status', label: 'Lab Dip Status', type: 'text', colKey: 'lab_dip_status', options: SAMPLE_STATUS_OPTIONS },
  { key: 'lab_dip_received', label: 'Lab Dip Rcvd', type: 'date', colKey: 'lab_dip_received' },
  { key: 'lab_dip_approved', label: 'Lab Dip Appr', type: 'date', colKey: 'lab_dip_approved' },
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
  const [components, setComponents] = useState<OrderComponent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [addMode, setAddMode] = useState<'single' | 'all' | 'selected'>('single');
  const [isAdding, setIsAdding] = useState(false);
  const [stylesOnPO, setStylesOnPO] = useState<{ id: number; style_code: string; description: string; colour: string }[]>([]);
  const [selectedStyleIds, setSelectedStyleIds] = useState<Set<number>>(new Set());

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

  useEffect(() => {
    loadComponents();
  }, [loadComponents]);

  // Load styles on PO when add form opens
  useEffect(() => {
    if (showAddForm && stylesOnPO.length === 0) {
      ordersApi.getStylesOnPO(poNumber)
        .then(res => setStylesOnPO(res.orders))
        .catch(console.error);
    }
  }, [showAddForm, poNumber]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setIsAdding(true);
    try {
      if (addMode === 'all') {
        const result = await componentsApi.bulkAddComponent(orderId, { name: newName.trim() });
        toast.success(`Component added to ${result.components_created} styles`);
      } else if (addMode === 'selected' && selectedStyleIds.size > 0) {
        const result = await componentsApi.bulkAddComponent(orderId, { name: newName.trim(), order_ids: Array.from(selectedStyleIds) });
        toast.success(`Component added to ${result.components_created} styles`);
      } else {
        await componentsApi.createComponent(orderId, { name: newName.trim() });
        toast.success('Component added');
      }
      setNewName('');
      setShowAddForm(false);
      setAddMode('single');
      setSelectedStyleIds(new Set());
      loadComponents();
    } catch (err) {
      toast.error('Failed to add component');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await componentsApi.deleteComponent(id);
      toast.success('Component removed');
      setComponents(prev => prev.filter(c => c.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (err) {
      toast.error('Failed to delete component');
    }
  };

  const handleFieldSave = async (component: OrderComponent, fieldKey: string, value: string, applyToPO: boolean, selectedIds?: number[]) => {
    const update: Record<string, any> = {};
    update[fieldKey] = value || null;

    try {
      if (applyToPO || (selectedIds && selectedIds.length > 0)) {
        const payload: any = { ...update };
        if (selectedIds && selectedIds.length > 0) payload.order_ids = selectedIds;
        const result = await componentsApi.applyFieldToPO(component.id, payload);
        toast.success(`Updated ${result.components_updated} styles`);
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
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          title="Add component"
        >
          <Plus className="w-3.5 h-3.5 text-gray-400" />
        </button>
      </h4>

      {/* Add Form */}
      {showAddForm && (
        <div className="mb-3 p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && addMode === 'single') handleAdd(); if (e.key === 'Escape') setShowAddForm(false); }}
            placeholder="Component name (e.g. Main Fabric)"
            autoFocus
            className="w-full text-xs border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-[11px] text-gray-500 cursor-pointer">
              <input type="radio" name="addMode" checked={addMode === 'single'} onChange={() => setAddMode('single')} className="text-primary-600 focus:ring-primary-500" />
              This style only
            </label>
            <label className="flex items-center gap-2 text-[11px] text-gray-500 cursor-pointer">
              <input type="radio" name="addMode" checked={addMode === 'all'} onChange={() => setAddMode('all')} className="text-primary-600 focus:ring-primary-500" />
              All styles on PO {poNumber}
            </label>
            <label className="flex items-center gap-2 text-[11px] text-gray-500 cursor-pointer">
              <input type="radio" name="addMode" checked={addMode === 'selected'} onChange={() => setAddMode('selected')} className="text-primary-600 focus:ring-primary-500" />
              Selected styles
            </label>
          </div>
          {addMode === 'selected' && (
            <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-lg bg-white">
              {stylesOnPO.map(style => (
                <label key={style.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0">
                  <input
                    type="checkbox"
                    checked={selectedStyleIds.has(style.id)}
                    onChange={(e) => {
                      const next = new Set(selectedStyleIds);
                      if (e.target.checked) next.add(style.id); else next.delete(style.id);
                      setSelectedStyleIds(next);
                    }}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-[11px] text-gray-700 truncate">
                    {style.style_code} · {style.colour} — {style.description}
                  </span>
                </label>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={!newName.trim() || isAdding || (addMode === 'selected' && selectedStyleIds.size === 0)}
              className="flex-1 text-xs px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              {isAdding ? 'Adding...' : 'Add'}
            </button>
            <button
              onClick={() => { setShowAddForm(false); setNewName(''); setAddMode('single'); setSelectedStyleIds(new Set()); }}
              className="text-xs px-3 py-1.5 bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Component List */}
      {components.length === 0 && !showAddForm ? (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full text-xs text-gray-500 text-center py-4 bg-gray-50 rounded-xl border border-dashed border-gray-300 hover:bg-gray-100 hover:border-gray-400 transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Component (e.g. Main Fabric, Lining, Trim)
        </button>
      ) : (
        <div className="space-y-2">
          {components.map(comp => (
            <div key={comp.id} className="border border-gray-200 rounded-xl overflow-hidden">
              {/* Component Header */}
              <button
                onClick={() => setExpandedId(expandedId === comp.id ? null : comp.id)}
                className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <ChevronRight className={cn('w-3.5 h-3.5 text-gray-400 transition-transform', expandedId === comp.id && 'rotate-90')} />
                  <span className="text-xs font-semibold text-gray-700">{comp.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  {/* Quick status summary */}
                  {(comp.fit_sample_status || comp.fit_sample_approved) && (() => {
                    const s = (comp.fit_sample_status || '').toUpperCase();
                    const done = s === 'APPROVED' || s === 'NOT REQUIRED' || !!comp.fit_sample_approved;
                    return <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-semibold', done ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700')}>{done ? '✓' : ''} Fit</span>;
                  })()}
                  {(comp.strike_off_status || comp.strike_off_approved) && (() => {
                    const s = (comp.strike_off_status || '').toUpperCase();
                    const done = s === 'APPROVED' || s === 'NOT REQUIRED' || !!comp.strike_off_approved;
                    return <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-semibold', done ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700')}>{done ? '✓' : ''} SO</span>;
                  })()}
                  {(comp.lab_dip_status || comp.lab_dip_approved) && (() => {
                    const s = (comp.lab_dip_status || '').toUpperCase();
                    const done = s === 'APPROVED' || s === 'NOT REQUIRED' || !!comp.lab_dip_approved;
                    return <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-semibold', done ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700')}>{done ? '✓' : ''} LD</span>;
                  })()}
                </div>
              </button>

              {/* Expanded Content */}
              {expandedId === comp.id && (
                <div className="px-3 py-2 border-t border-gray-100">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0">
                    {/* Fit Sample */}
                    {visibleFields.some(f => f.key.startsWith('fit_')) && (
                      <div>
                        <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1 mt-1">Fit Sample</p>
                        {visibleFields.filter(f => f.key.startsWith('fit_')).map(field => (
                          <ComponentFieldRow key={field.key} label={field.label.replace('Fit ', '')} value={(comp as any)[field.key]} type={field.type} editable={true} onSave={(val, applyAll, selectedIds) => handleFieldSave(comp, field.key, val, applyAll, selectedIds)} poNumber={poNumber} componentName={comp.name} options={field.options} />
                        ))}
                      </div>
                    )}
                    {/* Strike Off */}
                    {visibleFields.some(f => f.key.startsWith('strike_off_')) && (
                      <div>
                        <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1 mt-1">Strike Off</p>
                        {visibleFields.filter(f => f.key.startsWith('strike_off_')).map(field => (
                          <ComponentFieldRow key={field.key} label={field.label.replace('Strike Off ', '')} value={(comp as any)[field.key]} type={field.type} editable={true} onSave={(val, applyAll, selectedIds) => handleFieldSave(comp, field.key, val, applyAll, selectedIds)} poNumber={poNumber} componentName={comp.name} options={field.options} />
                        ))}
                      </div>
                    )}
                    {/* Lab Dip */}
                    {visibleFields.some(f => f.key.startsWith('lab_dip_')) && (
                      <div className="pt-3">
                        <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1">Lab Dip</p>
                        {visibleFields.filter(f => f.key.startsWith('lab_dip_')).map(field => (
                          <ComponentFieldRow key={field.key} label={field.label.replace('Lab Dip ', '')} value={(comp as any)[field.key]} type={field.type} editable={true} onSave={(val, applyAll, selectedIds) => handleFieldSave(comp, field.key, val, applyAll, selectedIds)} poNumber={poNumber} componentName={comp.name} options={field.options} />
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="pt-2 border-t border-gray-100 flex justify-end">
                    <button
                      onClick={() => handleDelete(comp.id)}
                      className="text-[10px] text-red-500 hover:text-red-700 flex items-center gap-1 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
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
        <div className="flex items-center gap-1">
          {options ? (
            <StatusDropdown
              value={editValue}
              options={options}
              onSave={(v) => { setEditValue(v); setShowApplyMenu(true); }}
              onCancel={() => setEditing(false)}
              size="sm"
            />
          ) : (
          <input
            type={type === 'date' ? 'date' : 'text'}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setEditing(false); setShowApplyMenu(false); setShowStylePicker(false); } if (e.key === 'Enter') handleSave(false); }}
            autoFocus
            className="text-[11px] border border-primary-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-500 w-[120px]"
          />
          )}
          <div className="relative">
            <button
              onClick={() => { setShowApplyMenu(!showApplyMenu); setShowStylePicker(false); }}
              className="text-[10px] px-2 py-0.5 bg-primary-600 text-white rounded hover:bg-primary-700"
            >
              Save
            </button>
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

function DetailRow({ label, value, editable, onSave, options, extra }: {
  label: string;
  value: string | number | null | undefined;
  editable?: boolean;
  onSave?: (value: string) => void;
  options?: string[];
  extra?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(value || ''));

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
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => handleSave()}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
            autoFocus
            className="text-xs border border-primary-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary-500 w-[160px] text-right"
          />
        )
      ) : (
        <span
          className={cn(
            'text-xs font-medium text-gray-700 text-right max-w-[200px] truncate',
            editable && 'cursor-pointer hover:text-primary-600 bg-green-50 px-1.5 py-0.5 rounded border border-green-200/60'
          )}
          onClick={() => editable && setEditing(true)}
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
