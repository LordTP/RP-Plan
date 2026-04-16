'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Package, Ship, Loader2, CheckCircle, X, Calendar, AlertCircle, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/layout/AuthProvider';
import { useStore } from '@/store/useStore';
import { trackingApi } from '@/lib/api';
import { cn } from '@/lib/utils';

interface TrackingOrder {
  id: number;
  po_number: string;
  style_code: string;
  customer: string;
  factory: string;
  tracking_reference: string;
  vessel_name: string | null;
  vessel_eta_to_port: string | null;
  revised_vessel_eta_to_port: string | null;
  status: string | null;
}

export default function TrackingPage() {
  return (
    <AuthProvider>
      <TrackingGuard />
    </AuthProvider>
  );
}

function TrackingGuard() {
  const { user } = useStore();
  const isInternal = user?.role === 'admin' || user?.role === 'internal';

  if (!isInternal) {
    return (
      <AppShell title="Tracking">
        <div className="flex items-center justify-center h-[calc(100vh-200px)]">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Ship className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-500">Tracking is only available to internal users.</p>
          </div>
        </div>
      </AppShell>
    );
  }

  return <TrackingContent />;
}

function TrackingContent() {
  const [query, setQuery] = useState('');
  const [orders, setOrders] = useState<TrackingOrder[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [newDate, setNewDate] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [allRefs, setAllRefs] = useState<{ ref: string; count: number }[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchWrapperRef = useRef<HTMLDivElement>(null);

  // Load all tracking refs on mount
  useEffect(() => {
    trackingApi.listRefs().then(r => setAllRefs(r.refs)).catch(console.error);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e: MouseEvent) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDropdown]);

  const filteredRefs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allRefs;
    return allRefs.filter(r => r.ref.toLowerCase().includes(q));
  }, [allRefs, query]);

  const handleSearch = async (overrideQuery?: string) => {
    const q = (overrideQuery ?? query).trim();
    if (!q) {
      toast.error('Enter a tracking reference');
      return;
    }
    setIsSearching(true);
    setHasSearched(true);
    setShowDropdown(false);
    try {
      const result = await trackingApi.search(q);
      setOrders(result.orders);
      setSelectedIds(new Set(result.orders.map(o => o.id)));
      if (result.orders.length === 0) {
        toast('No orders found with that tracking ref');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectRef = (ref: string) => {
    setQuery(ref);
    handleSearch(ref);
  };

  const toggleSelect = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const selectAll = () => setSelectedIds(new Set(orders.map(o => o.id)));
  const deselectAll = () => setSelectedIds(new Set());

  const handleConfirmUpdate = async () => {
    if (selectedIds.size === 0) {
      toast.error('Select at least one order');
      return;
    }
    if (!newDate) {
      toast.error('Enter a new Revised Vessel ETA');
      return;
    }
    setIsUpdating(true);
    try {
      const result = await trackingApi.bulkUpdateRevisedVesselEta(Array.from(selectedIds), newDate);
      toast.success(`Updated ${result.updated_count} orders`);
      setShowConfirm(false);
      setNewDate('');
      // Re-search to refresh
      handleSearch();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Update failed');
    } finally {
      setIsUpdating(false);
    }
  };

  const selectedOrders = useMemo(() => orders.filter(o => selectedIds.has(o.id)), [orders, selectedIds]);

  return (
    <AppShell title="Tracking">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tracking</h1>
          <p className="text-sm text-gray-500 mt-1">Search by tracking reference and bulk-update revised vessel ETA</p>
        </div>

        {/* Search */}
        <div className="bg-white rounded-xl shadow-sm ring-1 ring-gray-100 p-5">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Tracking Reference</label>
          <div className="flex gap-3">
            <div className="relative flex-1" ref={searchWrapperRef}>
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={query}
                onFocus={() => setShowDropdown(true)}
                onChange={(e) => { setQuery(e.target.value); setShowDropdown(true); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSearch();
                  if (e.key === 'Escape') setShowDropdown(false);
                }}
                placeholder="Enter P number or pick from list"
                className="w-full pl-9 pr-9 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <ChevronDown
                onClick={() => setShowDropdown(!showDropdown)}
                className={cn(
                  'w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer transition-transform',
                  showDropdown && 'rotate-180'
                )}
              />

              {/* Autocomplete dropdown */}
              {showDropdown && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto z-20">
                  {filteredRefs.length === 0 ? (
                    <div className="px-4 py-6 text-center text-xs text-gray-400">
                      {query.trim() ? 'No matching tracking refs' : 'No tracking refs in system yet'}
                    </div>
                  ) : (
                    <>
                      <div className="px-3 py-2 border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50/60">
                        {filteredRefs.length} ref{filteredRefs.length !== 1 ? 's' : ''} found
                      </div>
                      {filteredRefs.map(({ ref, count }) => (
                        <button
                          key={ref}
                          onClick={() => handleSelectRef(ref)}
                          className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-primary-50 transition-colors"
                        >
                          <span className="font-mono text-sm font-semibold text-gray-900">{ref}</span>
                          <span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                            {count} order{count !== 1 ? 's' : ''}
                          </span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={() => handleSearch()}
              disabled={isSearching || !query.trim()}
              className="px-5 py-2.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2"
            >
              {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Search
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">Click the field to see all existing refs, or type to filter. Partial match supported.</p>
        </div>

        {/* Results */}
        {hasSearched && !isSearching && (
          <>
            {orders.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm ring-1 ring-gray-100 py-16 text-center">
                <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-500">No orders found</p>
                <p className="text-xs text-gray-400 mt-1">Try a different tracking reference</p>
              </div>
            ) : (
              <div className="grid grid-cols-[1fr_340px] gap-6 items-start">
                {/* Orders list */}
                <div className="bg-white rounded-xl shadow-sm ring-1 ring-gray-100 overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/60">
                    <div className="flex items-center gap-3">
                      <h3 className="text-sm font-semibold text-gray-900">
                        {orders.length} order{orders.length !== 1 ? 's' : ''} found
                      </h3>
                      <span className="text-xs text-gray-500">
                        {selectedIds.size} selected
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={selectAll} className="text-xs text-primary-600 font-medium hover:text-primary-700">
                        Select all
                      </button>
                      <span className="text-gray-300">·</span>
                      <button onClick={deselectAll} className="text-xs text-gray-500 font-medium hover:text-gray-700">
                        Deselect all
                      </button>
                    </div>
                  </div>

                  <div className="max-h-[600px] overflow-y-auto divide-y divide-gray-100">
                    {orders.map(o => {
                      const isSelected = selectedIds.has(o.id);
                      return (
                        <label
                          key={o.id}
                          className={cn(
                            'flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors',
                            isSelected ? 'bg-primary-50/60 hover:bg-primary-50' : 'hover:bg-gray-50'
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(o.id)}
                            className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500 flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0 grid grid-cols-[120px_160px_1fr_auto] items-center gap-3">
                            <div>
                              <p className="text-sm font-bold text-gray-900">{o.po_number}</p>
                              <p className="text-[11px] text-gray-500 truncate">{o.style_code}</p>
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs text-gray-700 truncate">{o.customer}</p>
                              <p className="text-[10px] text-gray-400 truncate">{o.factory}</p>
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-gray-500 min-w-0">
                              <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-[10px] font-bold text-gray-700 truncate">{o.tracking_reference}</span>
                              {o.vessel_name && <span className="truncate">{o.vessel_name}</span>}
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] text-gray-400">Current ETA</p>
                              <p className="text-xs font-medium text-gray-900">
                                {o.revised_vessel_eta_to_port ? format(parseISO(o.revised_vessel_eta_to_port), 'dd MMM yyyy') : <span className="text-gray-300">—</span>}
                              </p>
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Bulk edit panel */}
                <div className="bg-white rounded-xl shadow-sm ring-1 ring-gray-100 p-5 sticky top-[72px]">
                  <h3 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-primary-500" />
                    Bulk Update
                  </h3>
                  <p className="text-[11px] text-gray-400 mb-4">Set Revised Vessel ETA for selected orders</p>

                  <div className="mb-4">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">New Revised Vessel ETA</label>
                    <input
                      type="date"
                      value={newDate}
                      onChange={(e) => setNewDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>

                  <div className="mb-4 p-3 bg-gray-50/80 rounded-lg">
                    <p className="text-[11px] text-gray-500">Will update</p>
                    <p className="text-2xl font-bold text-primary-600 mt-0.5">{selectedIds.size}</p>
                    <p className="text-[11px] text-gray-400">order{selectedIds.size !== 1 ? 's' : ''}</p>
                  </div>

                  <button
                    onClick={() => setShowConfirm(true)}
                    disabled={selectedIds.size === 0 || !newDate}
                    className="w-full px-4 py-2.5 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Apply to {selectedIds.size} order{selectedIds.size !== 1 ? 's' : ''}
                  </button>

                  <p className="text-[10px] text-gray-400 mt-3 leading-relaxed">
                    This will also auto-recalculate the Estimated Delivery date for each order based on FCL/LCL.
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {/* Empty state (before searching) */}
        {!hasSearched && (
          <div className="bg-white rounded-xl shadow-sm ring-1 ring-gray-100 py-16 text-center">
            <Ship className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-500">Enter a tracking reference to get started</p>
          </div>
        )}
      </div>

      {/* Confirm Modal */}
      {showConfirm && (
        <ConfirmModal
          count={selectedIds.size}
          newDate={newDate}
          orders={selectedOrders}
          onConfirm={handleConfirmUpdate}
          onCancel={() => setShowConfirm(false)}
          isUpdating={isUpdating}
        />
      )}
    </AppShell>
  );
}

function ConfirmModal({ count, newDate, orders, onConfirm, onCancel, isUpdating }: {
  count: number;
  newDate: string;
  orders: TrackingOrder[];
  onConfirm: () => void;
  onCancel: () => void;
  isUpdating: boolean;
}) {
  const formattedDate = newDate ? format(parseISO(newDate), 'dd MMM yyyy') : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={isUpdating ? undefined : onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-scale-in overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
              <AlertCircle className="w-4 h-4 text-amber-600" />
            </div>
            <h3 className="text-base font-bold text-gray-900">Confirm Bulk Update</h3>
          </div>
          <button onClick={onCancel} disabled={isUpdating} className="p-1.5 hover:bg-gray-100 rounded-lg disabled:opacity-50">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-700">
            You are about to update the <span className="font-semibold">Revised Vessel ETA</span> to{' '}
            <span className="font-semibold text-primary-700">{formattedDate}</span> for <span className="font-semibold">{count}</span> order{count !== 1 ? 's' : ''}.
          </p>
          <div className="max-h-48 overflow-y-auto bg-gray-50 rounded-lg p-3 space-y-1">
            {orders.map(o => (
              <div key={o.id} className="flex items-center justify-between text-xs">
                <span className="font-mono font-semibold text-gray-900">{o.po_number}</span>
                <span className="text-gray-500 truncate mx-2">{o.style_code}</span>
                <span className="text-gray-400 truncate">{o.factory}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Estimated Delivery will also be recalculated based on each order's FCL/LCL/AIR setting.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 bg-gray-50/60">
          <button onClick={onCancel} disabled={isUpdating} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={isUpdating} className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2">
            {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Confirm Update
          </button>
        </div>
      </div>
    </div>
  );
}
