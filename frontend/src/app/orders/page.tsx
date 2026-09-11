'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Search,
  Filter,
  RefreshCw,
  X,
  Download,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/layout/AuthProvider';
import { OrderTable } from '@/components/orders/OrderTable';
import { CommentSidebar } from '@/components/orders/CommentSidebar';
import { TrackingRefModal } from '@/components/orders/TrackingRefModal';
import { useStore } from '@/store/useStore';
import { ordersApi, OrderFilters } from '@/lib/api';
import { ExportOrdersModal } from '@/components/orders/ExportOrdersModal';
import { ActiveColumnFiltersBar } from '@/components/orders/ActiveColumnFiltersBar';
import { wsClient } from '@/lib/websocket';
import { cn } from '@/lib/utils';
import type { Order } from '@/types';

export default function OrdersPage() {
  return (
    <AuthProvider>
      <Suspense fallback={<OrdersLoading />}>
        <OrdersGuard />
      </Suspense>
    </AuthProvider>
  );
}

function OrdersGuard() {
  return <OrdersContent />;
}

function OrdersLoading() {
  return (
    <AppShell title="Orders">
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Loading orders...</p>
        </div>
      </div>
    </AppShell>
  );
}

function OrdersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    orders,
    setOrders,
    appendOrders,
    totalOrders,
    currentPage,
    pageSize,
    setPage,
    updateOrderInList,
    user,
  } = useStore();

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  // Tab state (internal/admin only) — Orders = tracking_reference IS NULL,
  // Shipped = tracking_reference IS NOT NULL. Backend honours the `tab`
  // query param for both.
  const [activeTab, setActiveTab] = useState<'orders' | 'shipped'>('orders');

  // Tracking reference modal state
  const [trackingModalOpen, setTrackingModalOpen] = useState(false);
  const [trackingModalOrder, setTrackingModalOrder] = useState<Order | null>(null);

  const isInternal = user?.role === 'internal' || user?.role === 'admin';

  // Highlight changes state
  const [highlightChanges, setHighlightChanges] = useState(false);
  const [changedFields, setChangedFields] = useState<Record<string, string[]>>({});
  const [changesSince, setChangesSince] = useState<string | null>(null);

  // Filter state
  const [filters, setFilters] = useState<OrderFilters>({
    search: '',
    po_number: searchParams.get('po_number') || '',
    style_code: searchParams.get('style_code') || '',
    factory: searchParams.get('factory') || '',
    customer: searchParams.get('customer') || '',
    status: searchParams.get('status') || '',
  });

  // Excel-style per-column header dropdowns. Kept separate from the
  // top-of-page text filters so the dropdown UI can manage just its slice
  // of state without colliding with the URL-param-backed search bar.
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});

  // Check if any filters are active
  const hasActiveFilters = filters.po_number || filters.style_code || filters.factory || filters.customer || filters.status || Object.keys(columnFilters).length > 0;

  const hasMore = orders.length < totalOrders;

  const buildCleanFilters = useCallback((
    currentFilters: OrderFilters,
    currentColumnFilters: Record<string, string[]> = {},
    tab?: 'orders' | 'shipped',
  ) => {
    const cleanFilters: OrderFilters = {};
    if (currentFilters.search) cleanFilters.search = currentFilters.search;
    if (currentFilters.po_number) cleanFilters.po_number = currentFilters.po_number;
    if (currentFilters.style_code) cleanFilters.style_code = currentFilters.style_code;
    if (currentFilters.factory) cleanFilters.factory = currentFilters.factory;
    if (currentFilters.customer) cleanFilters.customer = currentFilters.customer;
    if (currentFilters.status) cleanFilters.status = currentFilters.status;
    // Only set the tab param for internal/admin — suppliers don't see the
    // shipped/active distinction and the backend would filter them away.
    const resolvedTab = tab ?? activeTab;
    if (isInternal) {
      cleanFilters.tab = resolvedTab;
    }
    // Strip out columns whose selection is empty so we don't send useless
    // filter entries that the backend would just ignore anyway.
    const nonEmpty = Object.fromEntries(
      Object.entries(currentColumnFilters).filter(([, v]) => v.length > 0),
    );
    if (Object.keys(nonEmpty).length > 0) cleanFilters.column_filter = nonEmpty;
    return cleanFilters;
  }, [activeTab, isInternal]);

  const loadOrders = useCallback(async (
    page: number = 1,
    currentFilters: OrderFilters = filters,
    currentColumnFilters: Record<string, string[]> = columnFilters,
    tab?: 'orders' | 'shipped',
    options: { silent?: boolean } = {},
  ) => {
    // `silent` skips the isLoading flip so the table (which is conditionally
    // rendered on !isLoading) doesn't unmount and remount — preserving scroll
    // position, expanded rows, and any transient in-component state. Use it
    // for post-action refreshes (bulk save, WS-driven updates). Don't use it
    // for initial loads or filter changes where the "loading…" affordance
    // helps the user understand something's happening.
    if (!options.silent) setIsLoading(true);
    try {
      const cleanFilters = buildCleanFilters(currentFilters, currentColumnFilters, tab);
      const response = await ordersApi.getOrders(page, pageSize, cleanFilters);
      setOrders(response.orders, response.total);
      setPage(1);
    } catch (error) {
      console.error('Failed to load orders:', error);
      toast.error('Failed to load orders. Please check your connection and try refreshing the page.');
    } finally {
      if (!options.silent) setIsLoading(false);
    }
  }, [pageSize, setOrders, setPage, buildCleanFilters, columnFilters, filters]);

  // Post-bulk-save refresh — pulls back EVERYTHING currently loaded in
  // one shot (pageSize * currentPage) and swaps it into the store
  // atomically. This exists (instead of just calling loadOrders(1, silent))
  // because loadOrders resets currentPage to 1 and drops all
  // infinite-scroll-loaded pages — so a user on page 3 would see the
  // store shrink to 50 rows, scrollTop snap to the end of that short
  // list, then the intersection observer would re-load pages 2 and 3
  // sequentially. Visible symptom: "table moved about a bit up and down
  // then came back" (reported Sep 11 2026). Fetching the full loaded
  // range and NOT touching currentPage keeps the sentinel and store in
  // sync, so nothing shifts.
  const refreshAfterBulkSave = useCallback(async () => {
    try {
      const cleanFilters = buildCleanFilters(filters, columnFilters);
      const loadedRows = pageSize * Math.max(currentPage, 1);
      const response = await ordersApi.getOrders(1, loadedRows, cleanFilters);
      setOrders(response.orders, response.total);
      // Deliberately no setPage call — currentPage stays where the user
      // scrolled to. hasMore recomputes naturally against the new total.
    } catch (error) {
      console.error('Silent refresh after bulk save failed:', error);
      // Silent by design: bulk save's own toast already covered the success
      // message; a background-refresh failure shouldn't disrupt the user.
    }
  }, [buildCleanFilters, filters, columnFilters, pageSize, currentPage, setOrders]);

  const loadMoreOrders = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const nextPage = currentPage + 1;
      const cleanFilters = buildCleanFilters(filters, columnFilters);
      const response = await ordersApi.getOrders(nextPage, pageSize, cleanFilters);
      appendOrders(response.orders, response.total);
      setPage(nextPage);
    } catch (error) {
      console.error('Failed to load more orders:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, currentPage, pageSize, filters, columnFilters, appendOrders, setPage, buildCleanFilters]);

  // Switching tabs re-fetches from page 1. Column filters stay active so
  // e.g. "customer=ABC" + tab=shipped narrows to ABC's shipped orders.
  const handleTabChange = useCallback((tab: 'orders' | 'shipped') => {
    setActiveTab(tab);
    setPage(1);
    loadOrders(1, filters, columnFilters, tab);
  }, [setPage, loadOrders, filters, columnFilters]);

  // Excel-style header dropdown picked a new value set — apply or clear
  // depending on whether the array is empty.
  const handleColumnFilterChange = useCallback((column: string, values: string[]) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (values.length === 0) {
        delete next[column];
      } else {
        next[column] = values;
      }
      // Re-fetch from page 1 with the new column filter set in effect.
      loadOrders(1, filters, next);
      return next;
    });
  }, [filters, loadOrders]);

  // Clears every column-header dropdown filter in one go. Doesn't touch
  // the top-of-page text filters — those are a separate UI surface.
  const handleClearAllColumnFilters = useCallback(() => {
    setColumnFilters({});
    loadOrders(1, filters, {});
  }, [filters, loadOrders]);

  // Initial load
  useEffect(() => {
    loadOrders(1, filters);
  }, []);

  // Initialize from URL params
  useEffect(() => {
    const poNumber = searchParams.get('po_number');
    const styleCode = searchParams.get('style_code');
    const factory = searchParams.get('factory');
    const customer = searchParams.get('customer');
    const status = searchParams.get('status');
    const shouldHighlight = searchParams.get('highlight_changes') === 'true';

    if (poNumber || styleCode || factory || customer || status) {
      const urlFilters: OrderFilters = {
        po_number: poNumber || '',
        style_code: styleCode || '',
        factory: factory || '',
        customer: customer || '',
        status: status || '',
      };
      setFilters(urlFilters);
      setShowFilters(true);
      loadOrders(1, urlFilters);

      // If highlight_changes is set, fetch recent changes
      if (shouldHighlight && poNumber) {
        setHighlightChanges(true);
        const highlightSince = searchParams.get('highlight_since') || undefined;
        ordersApi.getRecentChanges(poNumber, highlightSince).then((result) => {
          setChangedFields(result.changes);
          setChangesSince(result.since);
        }).catch(console.error);
      }
    }
  }, [searchParams]);

  useEffect(() => {
    // Subscribe to WebSocket updates
    const unsubscribe = wsClient.subscribe((data) => {
      if (data.type === 'order_update' && data.order) {
        updateOrderInList(data.order);
      }
    });

    return () => unsubscribe();
  }, [updateOrderInList]);

  // Infinite scroll is handled inside OrderTable now (its observer is
  // rooted on its inner scroll container so the sentinel actually fires).

  const handleRefresh = () => {
    loadOrders(1, filters);
    toast.success('Orders refreshed');
  };

  const handleOrderUpdate = (order: Order) => {
    updateOrderInList(order);
  };

  const handleFilterChange = (key: keyof OrderFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleApplyFilters = () => {
    setPage(1);
    loadOrders(1, filters);

    // Update URL with filters
    const params = new URLSearchParams();
    if (filters.po_number) params.set('po_number', filters.po_number);
    if (filters.style_code) params.set('style_code', filters.style_code);
    if (filters.factory) params.set('factory', filters.factory);
    if (filters.customer) params.set('customer', filters.customer);
    if (filters.status) params.set('status', filters.status);

    const newUrl = params.toString() ? `/orders?${params.toString()}` : '/orders';
    router.push(newUrl, { scroll: false });
  };

  const handleClearFilters = () => {
    setFilters({
      search: '',
      po_number: '',
      style_code: '',
      factory: '',
      customer: '',
      status: '',
    });
    setPage(1);
    loadOrders(1, {});
    router.push('/orders', { scroll: false });
  };

  const handleRemoveFilter = (key: keyof OrderFilters) => {
    const newFilters = { ...filters, [key]: '' };
    setFilters(newFilters);
    setPage(1);
    loadOrders(1, newFilters);

    // Update URL
    const params = new URLSearchParams();
    if (key !== 'po_number' && newFilters.po_number) params.set('po_number', newFilters.po_number);
    if (key !== 'style_code' && newFilters.style_code) params.set('style_code', newFilters.style_code);
    if (key !== 'factory' && newFilters.factory) params.set('factory', newFilters.factory);
    if (key !== 'customer' && newFilters.customer) params.set('customer', newFilters.customer);
    if (key !== 'status' && newFilters.status) params.set('status', newFilters.status);

    const newUrl = params.toString() ? `/orders?${params.toString()}` : '/orders';
    router.push(newUrl, { scroll: false });
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleApplyFilters();
    }
  };

  const handleDismissHighlight = () => {
    setHighlightChanges(false);
    setChangedFields({});
    setChangesSince(null);
    // Remove highlight_changes from URL
    const params = new URLSearchParams(searchParams.toString());
    params.delete('highlight_changes');
    const newUrl = params.toString() ? `/orders?${params.toString()}` : '/orders';
    router.push(newUrl, { scroll: false });
  };

  const handleShippedStatusRequest = (order: Order) => {
    setTrackingModalOrder(order);
    setTrackingModalOpen(true);
  };

  const handleTrackingRefConfirm = async (trackingRef: string, applyMode: 'single' | 'all' | 'selected', selectedOrderIds: number[]) => {
    if (!trackingModalOrder) return;
    try {
      if (applyMode === 'single') {
        await ordersApi.setShippedStatus(trackingModalOrder.id, trackingRef);
        toast.success('Order marked as shipped');
      } else {
        // all = empty orderIds (backend updates all on PO), selected = specific IDs
        const orderIds = applyMode === 'selected' ? selectedOrderIds : undefined;
        const result = await ordersApi.bulkSetShippedStatus(trackingModalOrder.po_number, trackingRef, orderIds);
        toast.success(`Shipped ${result.orders_updated} orders with tracking ref`);
      }
      setTrackingModalOpen(false);
      setTrackingModalOrder(null);
      // Reload to reflect the change (order moves between tabs)
      loadOrders(currentPage, filters);
    } catch (error: any) {
      const msg = error?.response?.data?.detail || 'Failed to update status';
      toast.error(msg);
    }
  };


  return (
    <AppShell title="Orders">
      <div className="flex flex-col overflow-hidden" style={{ height: 'calc(100vh - 116px)' }}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isInternal && activeTab === 'shipped' ? 'Shipped Orders' : 'All Orders'}
            </h1>
            <p className="text-gray-500 mt-1">
              {totalOrders} total order lines
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                'btn-secondary flex items-center gap-2',
                hasActiveFilters && 'bg-primary-50 border-primary-300 text-primary-700'
              )}
            >
              <Filter className="w-4 h-4" />
              Filters
              {hasActiveFilters && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary-600 text-white rounded-full">
                  {[filters.po_number, filters.style_code, filters.factory, filters.customer, filters.status].filter(Boolean).length}
                </span>
              )}
            </button>

            {/* Try v2 */}
            <button
              onClick={() => router.push('/orders-v2')}
              className="btn-secondary flex items-center gap-2 text-primary-600 border-primary-200 bg-primary-50 hover:bg-primary-100"
            >
              Try v2
            </button>

            {/* Refresh */}
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="btn-secondary flex items-center gap-2"
            >
              <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
              Refresh
            </button>

            {/* Export */}
            <button
              onClick={() => setShowExportModal(true)}
              className="btn-primary flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>

        {/* Tab Navigation (internal/admin only) — Orders = no tracking ref
            yet (still in production / pre-ship), Shipped = tracking ref set. */}
        {isInternal && (
          <div className="flex items-center gap-1 mb-4 border-b border-gray-200">
            <button
              onClick={() => handleTabChange('orders')}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
                activeTab === 'orders'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              )}
            >
              Orders
            </button>
            <button
              onClick={() => handleTabChange('shipped')}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
                activeTab === 'shipped'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              )}
            >
              Shipped
            </button>
          </div>
        )}

        {/* Filter Panel */}
        {showFilters && (
          <div className="card p-4 mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
              {/* PO Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  PO Number
                </label>
                <input
                  type="text"
                  value={filters.po_number || ''}
                  onChange={(e) => handleFilterChange('po_number', e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Filter by PO#"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              {/* Style Code */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Style Code
                </label>
                <input
                  type="text"
                  value={filters.style_code || ''}
                  onChange={(e) => handleFilterChange('style_code', e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Filter by style"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              {/* Customer */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Customer
                </label>
                <input
                  type="text"
                  value={filters.customer || ''}
                  onChange={(e) => handleFilterChange('customer', e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Filter by customer"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              {/* Factory */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Factory
                </label>
                <input
                  type="text"
                  value={filters.factory || ''}
                  onChange={(e) => handleFilterChange('factory', e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Filter by factory"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <input
                  type="text"
                  value={filters.status || ''}
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Filter by status"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              {/* Actions */}
              <div className="flex items-end gap-2">
                <button
                  onClick={handleApplyFilters}
                  className="btn-primary flex-1"
                >
                  Apply
                </button>
                {hasActiveFilters && (
                  <button
                    onClick={handleClearFilters}
                    className="btn-secondary px-3"
                    title="Clear filters"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Active Filters Display */}
            {hasActiveFilters && (
              <div className="mt-3 pt-3 border-t border-gray-200 flex items-center gap-2 flex-wrap">
                <span className="text-sm text-gray-500">Active filters:</span>
                {filters.po_number && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-primary-50 text-primary-700 rounded-full text-sm">
                    PO#: {filters.po_number}
                    <button
                      onClick={() => handleRemoveFilter('po_number')}
                      className="hover:text-primary-900"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {filters.style_code && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-primary-50 text-primary-700 rounded-full text-sm">
                    Style: {filters.style_code}
                    <button
                      onClick={() => handleRemoveFilter('style_code')}
                      className="hover:text-primary-900"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {filters.factory && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-primary-50 text-primary-700 rounded-full text-sm">
                    Factory: {filters.factory}
                    <button
                      onClick={() => handleRemoveFilter('factory')}
                      className="hover:text-primary-900"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {filters.customer && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-primary-50 text-primary-700 rounded-full text-sm">
                    Customer: {filters.customer}
                    <button
                      onClick={() => handleRemoveFilter('customer')}
                      className="hover:text-primary-900"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
                {filters.status && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-primary-50 text-primary-700 rounded-full text-sm">
                    Status: {filters.status}
                    <button
                      onClick={() => handleRemoveFilter('status')}
                      className="hover:text-primary-900"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Highlight Changes Banner */}
        {highlightChanges && Object.keys(changedFields).length > 0 && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <RefreshCw className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-emerald-800">
                  Showing changes since your last login
                </p>
                <p className="text-xs text-emerald-600">
                  {changesSince && `Since ${new Date(changesSince).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}`}
                  {' • '}Changed cells are highlighted in green
                </p>
              </div>
            </div>
            <button
              onClick={handleDismissHighlight}
              className="px-3 py-1.5 text-sm text-emerald-700 hover:bg-emerald-100 rounded-lg transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-6 mb-4 text-sm">
          {highlightChanges && Object.keys(changedFields).length > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-emerald-300 rounded" />
              <span className="text-gray-600">Changed since last login</span>
            </div>
          )}
          {user?.role === 'supplier' ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-50 border border-green-200 rounded" />
              <span className="text-gray-600">Editable fields (green highlight)</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-gray-500">All fields are editable</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-gray-400">Double-click cell to edit</span>
          </div>
        </div>

        {/* Active column filters bar — only renders when one or more
            column-header dropdowns have selections. Lets the user see and
            wipe the hidden-by-icon filter state. */}
        <ActiveColumnFiltersBar
          columnFilters={columnFilters}
          onClear={(col) => handleColumnFilterChange(col, [])}
          onClearAll={handleClearAllColumnFilters}
        />

        {/* Table */}
        <div className="flex-1 min-h-0">
          {isLoading ? (
            <div className="card p-12 flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-10 h-10 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-gray-500">Loading orders...</p>
              </div>
            </div>
          ) : (
            <OrderTable
              orders={orders}
              onOrderUpdate={handleOrderUpdate}
              highlightMode={highlightChanges}
              changedFields={highlightChanges ? changedFields : undefined}
              showTrackingRef={isInternal && activeTab === 'shipped'}
              onShippedStatusRequest={isInternal ? handleShippedStatusRequest : undefined}
              onReachEnd={loadMoreOrders}
              hasMore={hasMore}
              isLoadingMore={isLoadingMore}
              columnFilters={columnFilters}
              onColumnFilterChange={handleColumnFilterChange}
              activeTab={isInternal ? activeTab : undefined}
              onBulkSaveRefresh={refreshAfterBulkSave}
            />
          )}
        </div>

        {!isLoading && (
          <div className="flex-shrink-0 py-2 text-xs text-gray-400 text-center">
            Showing {orders.length} of {totalOrders} order lines
          </div>
        )}
      </div>

      {/* Comment Sidebar */}
      <CommentSidebar />

      {/* Tracking Reference Modal */}
      <TrackingRefModal
        isOpen={trackingModalOpen}
        poNumber={trackingModalOrder?.po_number || ''}
        orderId={trackingModalOrder?.id || 0}
        styleCode={trackingModalOrder?.style_code}
        onConfirm={handleTrackingRefConfirm}
        onCancel={() => {
          setTrackingModalOpen(false);
          setTrackingModalOrder(null);
        }}
      />

      <ExportOrdersModal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        filenamePrefix="orderbook"
      />
    </AppShell>
  );
}

