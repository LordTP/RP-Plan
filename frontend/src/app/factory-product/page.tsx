'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Download,
  Filter,
  RefreshCw,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/layout/AuthProvider';
import { OrderTable } from '@/components/orders/OrderTable';
import { CommentSidebar } from '@/components/orders/CommentSidebar';
import { ExportOrdersModal } from '@/components/orders/ExportOrdersModal';
import { ActiveColumnFiltersBar } from '@/components/orders/ActiveColumnFiltersBar';
import { FactoryV2View } from '@/components/orders/FactoryV2View';
import { useStore } from '@/store/useStore';
import { ordersApi, OrderFilters } from '@/lib/api';
import { wsClient } from '@/lib/websocket';
import { cn } from '@/lib/utils';
import { FACTORY_PRODUCT_COLUMNS } from '@/types';
import type { Order } from '@/types';

export default function FactoryProductPage() {
  return (
    <AuthProvider>
      <PageGuard />
    </AuthProvider>
  );
}

function PageGuard() {
  const { user } = useStore();
  const searchParams = useSearchParams();

  // Suppliers default to the V2 PO-grouped view (their workspace). They can
  // still reach the legacy table by clicking "Table View" on V2 — that
  // button appends ?view=table, which we honor here.
  const wantsTable = searchParams.get('view') === 'table';

  if (user?.role === 'supplier' && !wantsTable) {
    return <FactoryV2View viewType="factory-product" />;
  }

  if (user?.role !== 'admin' && user?.role !== 'supplier') {
    return (
      <AppShell title="Factory Product">
        <div className="flex items-center justify-center h-[calc(100vh-200px)]">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <X className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-500">This page is only available to factory users.</p>
          </div>
        </div>
      </AppShell>
    );
  }

  return <PageContent />;
}

function PageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, setSelectedOrder, updateOrderInList } = useStore();

  // Local state — does NOT touch the global orders store
  const [orders, setOrders] = useState<Order[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 100;

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  const [filters, setFilters] = useState<OrderFilters>({
    search: '',
    po_number: searchParams.get('po_number') || '',
    style_code: searchParams.get('style_code') || '',
    factory: searchParams.get('factory') || '',
    customer: searchParams.get('customer') || '',
    status: searchParams.get('status') || '',
  });

  // Excel-style per-column header dropdown state. Local to this page so
  // it doesn't leak into the global orders store (factory pages use local
  // state by convention — see CLAUDE.md).
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});

  const hasActiveFilters = filters.po_number || filters.style_code || filters.factory || filters.customer || filters.status || Object.keys(columnFilters).length > 0;
  const hasMore = orders.length < totalOrders;

  const buildCleanFilters = useCallback((currentFilters: OrderFilters, currentColumnFilters: Record<string, string[]> = {}) => {
    const cleanFilters: OrderFilters = {};
    if (currentFilters.search) cleanFilters.search = currentFilters.search;
    if (currentFilters.po_number) cleanFilters.po_number = currentFilters.po_number;
    if (currentFilters.style_code) cleanFilters.style_code = currentFilters.style_code;
    if (currentFilters.factory) cleanFilters.factory = currentFilters.factory;
    if (currentFilters.customer) cleanFilters.customer = currentFilters.customer;
    if (currentFilters.status) cleanFilters.status = currentFilters.status;
    const nonEmpty = Object.fromEntries(
      Object.entries(currentColumnFilters).filter(([, v]) => v.length > 0),
    );
    if (Object.keys(nonEmpty).length > 0) cleanFilters.column_filter = nonEmpty;
    return cleanFilters;
  }, []);

  const loadOrders = useCallback(async (
    page: number = 1,
    currentFilters: OrderFilters = filters,
    currentColumnFilters: Record<string, string[]> = columnFilters,
  ) => {
    setIsLoading(true);
    try {
      const cleanFilters = buildCleanFilters(currentFilters, currentColumnFilters);
      const response = await ordersApi.getOrders(page, pageSize, cleanFilters);
      setOrders(response.orders);
      setTotalOrders(response.total);
      setCurrentPage(1);
    } catch (error) {
      console.error('Failed to load orders:', error);
      toast.error('Failed to load orders.');
    } finally {
      setIsLoading(false);
    }
  }, [pageSize, buildCleanFilters, filters, columnFilters]);

  const loadMoreOrders = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const nextPage = currentPage + 1;
      const cleanFilters = buildCleanFilters(filters, columnFilters);
      const response = await ordersApi.getOrders(nextPage, pageSize, cleanFilters);
      setOrders(prev => [...prev, ...response.orders]);
      setTotalOrders(response.total);
      setCurrentPage(nextPage);
    } catch (error) {
      console.error('Failed to load more orders:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, currentPage, pageSize, filters, columnFilters, buildCleanFilters]);

  const handleColumnFilterChange = useCallback((column: string, values: string[]) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (values.length === 0) {
        delete next[column];
      } else {
        next[column] = values;
      }
      loadOrders(1, filters, next);
      return next;
    });
  }, [filters, loadOrders]);

  const handleClearAllColumnFilters = useCallback(() => {
    setColumnFilters({});
    loadOrders(1, filters, {});
  }, [filters, loadOrders]);

  useEffect(() => {
    loadOrders(1, filters);
  }, []);

  useEffect(() => {
    const unsubscribe = wsClient.subscribe((data) => {
      if (data.type === 'order_update' && data.order) {
        setOrders(prev => prev.map(o => o.id === data.order.id ? data.order : o));
      }
    });
    return () => unsubscribe();
  }, []);

  // Infinite scroll is handled inside OrderTable now (its observer is
  // rooted on its inner scroll container so the sentinel actually fires).

  const handleRefresh = () => {
    loadOrders(1, filters);
    toast.success('Orders refreshed');
  };

  const handleOrderUpdate = (order: Order) => {
    setOrders(prev => prev.map(o => o.id === order.id ? order : o));
  };

  const handleFilterChange = (key: keyof OrderFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleApplyFilters = () => {
    setCurrentPage(1);
    loadOrders(1, filters);
  };

  const handleClearFilters = () => {
    setFilters({ search: '', po_number: '', style_code: '', factory: '', customer: '', status: '' });
    setCurrentPage(1);
    loadOrders(1, {});
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleApplyFilters();
  };

  return (
    <AppShell title="Factory Product">
      <div className="flex flex-col overflow-hidden" style={{ height: 'calc(100vh - 116px)' }}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Factory Product</h1>
            <p className="text-gray-500 mt-1">{totalOrders} total order lines</p>
          </div>
          <div className="flex items-center gap-3">
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
            <button
              onClick={() => router.push('/factory-product-v2')}
              className="btn-secondary flex items-center gap-2 text-primary-600 border-primary-200 bg-primary-50 hover:bg-primary-100"
            >
              Try v2
            </button>
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="btn-secondary flex items-center gap-2"
            >
              <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
              Refresh
            </button>
            <button
              onClick={() => setShowExportModal(true)}
              className="btn-primary flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="card p-4 mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PO Number</label>
                <input type="text" value={filters.po_number || ''} onChange={(e) => handleFilterChange('po_number', e.target.value)} onKeyDown={handleSearchKeyDown} placeholder="Filter by PO#" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Style Code</label>
                <input type="text" value={filters.style_code || ''} onChange={(e) => handleFilterChange('style_code', e.target.value)} onKeyDown={handleSearchKeyDown} placeholder="Filter by style" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer</label>
                <input type="text" value={filters.customer || ''} onChange={(e) => handleFilterChange('customer', e.target.value)} onKeyDown={handleSearchKeyDown} placeholder="Filter by customer" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent" />
              </div>
              <div className="flex items-end gap-2">
                <button onClick={handleApplyFilters} className="btn-primary flex-1">Apply</button>
                {hasActiveFilters && (
                  <button onClick={handleClearFilters} className="btn-secondary px-3" title="Clear filters">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

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
              columnKeys={FACTORY_PRODUCT_COLUMNS}
              onReachEnd={loadMoreOrders}
              hasMore={hasMore}
              isLoadingMore={isLoadingMore}
              columnFilters={columnFilters}
              onColumnFilterChange={handleColumnFilterChange}
            />
          )}
        </div>

        {!isLoading && (
          <div className="flex-shrink-0 py-2 text-xs text-gray-400 text-center">
            Showing {orders.length} of {totalOrders} order lines
          </div>
        )}
      </div>

      <CommentSidebar />

      <ExportOrdersModal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        filenamePrefix="factory-product"
      />
    </AppShell>
  );
}
