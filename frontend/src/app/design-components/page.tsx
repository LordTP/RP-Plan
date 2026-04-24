'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Layers, Search, Loader2, Package, ArrowDownAZ, Flame, Hash, X, AlertTriangle, ChevronDown, Wand2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/layout/AuthProvider';
import { ordersApi, componentsApi, submissionsApi, type RejectReason, type SampleType } from '@/lib/api';
import { SAMPLE_STATUS_FIELD_TO_TYPE } from '@/types';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import { isSampleDone, businessDaysBetween, businessDaysUntil, relativeTimeShort } from '@/lib/sampleStatus';
import { FIT_SAMPLE_STATUS_OPTIONS, SAMPLE_STATUS_OPTIONS } from '@/types';
import type { Order, OrderComponent } from '@/types';

export default function DesignComponentsPage() {
  return (
    <AuthProvider>
      <DesignComponentsContent />
    </AuthProvider>
  );
}

type Instance = { order: Order; component: OrderComponent };
type SortMode = 'count' | 'pending' | 'alpha';

// Statuses that mean "order has left the factory" — hidden by default so the
// page focuses on work still in progress.
const SHIPPED_STATUSES = new Set([
  'Shipped', 'In Transit',
  'Delivered', 'Delivered to UK', 'Delivered to Customer',
  'Complete', 'Completed',
]);

function normalizeComponentName(name: string): string {
  return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function orderMatchesQuery(order: Order, q: string): boolean {
  const fields = [
    order.po_number,
    order.style_code,
    order.customer,
    order.factory,
    order.colour,
    order.description,
    order.customer_po_number,
    order.china_orderbook_ref,
  ];
  return fields.some((v) => (v || '').toString().toLowerCase().includes(q));
}

type Group = {
  name: string;
  instances: Instance[];
  visibleInstances: Instance[]; // filtered by search
  fitDone: number;
  soDone: number;
  ldDone: number;
  total: number;
  pending: number;
};

function DesignComponentsContent() {
  const { user } = useStore();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('count');
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [hideShipped, setHideShipped] = useState(true);
  const [selectedComponentIds, setSelectedComponentIds] = useState<Set<number>>(new Set());
  const [bulkAction, setBulkAction] = useState<{ field: string; fieldLabel: string; value: string | null; valueLabel: string } | null>(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    ordersApi
      .getOrders(1, 500, {})
      .then((res) => {
        if (!cancelled) setOrders(res.orders);
      })
      .catch(() => {
        if (!cancelled) toast.error('Failed to load orders');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (user && user.role === 'supplier') {
    return (
      <AppShell title="Components">
        <div className="flex items-center justify-center h-[calc(100vh-200px)]">
          <p className="text-sm text-gray-500">You do not have permission to view this page.</p>
        </div>
      </AppShell>
    );
  }

  // Raw groups (unfiltered by search/sort, but respects the hide-shipped toggle)
  const rawGroups = useMemo(() => {
    const byName = new Map<string, Instance[]>();
    for (const order of orders) {
      if (!order.components || order.components.length === 0) continue;
      if (hideShipped && SHIPPED_STATUSES.has((order.status || '').trim())) continue;
      for (const component of order.components) {
        const key = component.name || '(unnamed)';
        if (!byName.has(key)) byName.set(key, []);
        byName.get(key)!.push({ order, component });
      }
    }
    return Array.from(byName.entries()).map(([name, instances]) => ({ name, instances }));
  }, [orders, hideShipped]);

  // Search + sort + compute stats (stats are on the visible instances after search so counts match what's shown)
  const groups: Group[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out: Group[] = [];

    for (const { name, instances } of rawGroups) {
      const nameMatches = q ? name.toLowerCase().includes(q) : true;
      let visibleInstances = q && !nameMatches
        ? instances.filter(({ order }) => orderMatchesQuery(order, q))
        : instances;

      // In Pending mode, drop any instance that's fully done (all 3 samples done)
      if (sort === 'pending') {
        visibleInstances = visibleInstances.filter(({ component }) => {
          const f = isSampleDone(component.fit_sample_status, component.fit_sample_approved);
          const s = isSampleDone(component.strike_off_status, component.strike_off_approved);
          const l = isSampleDone(component.lab_dip_status, component.lab_dip_approved);
          return !(f && s && l);
        });
      }

      // If searching and nothing matches for this group, skip it.
      // If Pending mode and nothing pending, also skip (filters out fully-done groups).
      if ((q || sort === 'pending') && visibleInstances.length === 0) continue;

      let fitDone = 0, soDone = 0, ldDone = 0, pending = 0;
      for (const { component } of visibleInstances) {
        const f = isSampleDone(component.fit_sample_status, component.fit_sample_approved);
        const s = isSampleDone(component.strike_off_status, component.strike_off_approved);
        const l = isSampleDone(component.lab_dip_status, component.lab_dip_approved);
        if (f) fitDone++;
        if (s) soDone++;
        if (l) ldDone++;
        if (!f || !s || !l) pending++;
      }
      out.push({
        name,
        instances,
        visibleInstances,
        fitDone,
        soDone,
        ldDone,
        total: visibleInstances.length,
        pending,
      });
    }

    switch (sort) {
      case 'alpha':
        out.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'pending':
        out.sort((a, b) => b.pending - a.pending || b.total - a.total);
        break;
      case 'count':
      default:
        out.sort((a, b) => b.total - a.total);
    }
    return out;
  }, [rawGroups, search, sort]);

  // Auto-select first group; re-select if current selection drops out of filter
  useEffect(() => {
    if (groups.length === 0) {
      if (selectedName !== null) setSelectedName(null);
      return;
    }
    if (!selectedName || !groups.find((g) => g.name === selectedName)) {
      setSelectedName(groups[0].name);
    }
  }, [groups, selectedName]);

  const selectedGroup = groups.find((g) => g.name === selectedName) || null;
  const totalInstancesVisible = groups.reduce((s, g) => s + g.total, 0);

  // Data quality: find component names that differ only by casing/whitespace.
  const dupeClusters = useMemo(() => {
    const byNorm = new Map<string, Map<string, number>>();
    for (const g of rawGroups) {
      const norm = normalizeComponentName(g.name);
      if (!norm) continue;
      if (!byNorm.has(norm)) byNorm.set(norm, new Map());
      const variantCounts = byNorm.get(norm)!;
      variantCounts.set(g.name, (variantCounts.get(g.name) || 0) + g.instances.length);
    }
    const clusters: { normalized: string; variants: { name: string; count: number }[] }[] = [];
    for (const [norm, variantCounts] of Array.from(byNorm.entries())) {
      if (variantCounts.size > 1) {
        const variants = Array.from(variantCounts.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count);
        clusters.push({ normalized: norm, variants });
      }
    }
    return clusters;
  }, [rawGroups]);

  const handleMerge = async (fromNames: string[], toName: string) => {
    try {
      const res = await componentsApi.mergeComponentNames(fromNames, toName);
      toast.success(`Merged ${res.renamed_count} components into "${toName}"`);
      // Reload orders so the groups/clusters update
      const r = await ordersApi.getOrders(1, 500, {});
      setOrders(r.orders);
      if (fromNames.includes(selectedName || '')) setSelectedName(toName);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Merge failed');
    }
  };

  // Summary stats for the selected component (computed on the visible instances so search-aware)
  const summary = useMemo(() => {
    if (!selectedGroup) return null;
    const fitDays: number[] = [];
    const soDays: number[] = [];
    const ldDays: number[] = [];
    const factoryCounts = new Map<string, number>();
    let oldestPending: Instance | null = null;
    let oldestPendingAge = -1;

    for (const inst of selectedGroup.visibleInstances) {
      const { order, component } = inst;
      if (component.fit_sample_received && component.fit_sample_approved) {
        fitDays.push(businessDaysBetween(component.fit_sample_received, component.fit_sample_approved));
      }
      if (component.strike_off_received && component.strike_off_approved) {
        soDays.push(businessDaysBetween(component.strike_off_received, component.strike_off_approved));
      }
      if (component.lab_dip_received && component.lab_dip_approved) {
        ldDays.push(businessDaysBetween(component.lab_dip_received, component.lab_dip_approved));
      }
      if (order.factory) {
        factoryCounts.set(order.factory, (factoryCounts.get(order.factory) || 0) + 1);
      }

      const fitDone = isSampleDone(component.fit_sample_status, component.fit_sample_approved);
      const soDone = isSampleDone(component.strike_off_status, component.strike_off_approved);
      const ldDone = isSampleDone(component.lab_dip_status, component.lab_dip_approved);
      if (!fitDone || !soDone || !ldDone) {
        const ageDays = Math.floor((Date.now() - new Date(component.updated_at).getTime()) / (1000 * 60 * 60 * 24));
        if (ageDays > oldestPendingAge) {
          oldestPendingAge = ageDays;
          oldestPending = inst;
        }
      }
    }

    const avg = (arr: number[]) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
    const topFactories = Array.from(factoryCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    return {
      avgFit: avg(fitDays),
      avgSo: avg(soDays),
      avgLd: avg(ldDays),
      topFactories,
      oldestPending,
      oldestPendingAge,
    };
  }, [selectedGroup]);

  const openStyle = (orderId: number) => {
    router.push(`/design?openStyle=${orderId}`);
  };

  return (
    <AppShell title="Components">
      <div className="p-6">
        <div
          className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] ring-1 ring-gray-100 overflow-hidden flex flex-col"
          style={{ height: 'calc(100vh - 100px)' }}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4 flex-shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 bg-violet-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Layers className="w-5 h-5 text-violet-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-gray-900">Components</h3>
                <p className="text-xs text-gray-500 truncate">
                  {isLoading
                    ? 'Loading...'
                    : search
                      ? `${totalInstancesVisible} match${totalInstancesVisible !== 1 ? 'es' : ''} for "${search}" across ${groups.length} component${groups.length !== 1 ? 's' : ''}`
                      : `${groups.length} component${groups.length !== 1 ? 's' : ''} across ${totalInstancesVisible} ${totalInstancesVisible === 1 ? 'style' : 'styles'}`}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search PO, style, customer, factory..."
                  className="pl-9 pr-8 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white focus:border-transparent transition-all w-72"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 rounded"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <label className="flex items-center gap-1.5 text-[10px] text-gray-400 hover:text-gray-600 cursor-pointer select-none pr-1">
                <input
                  type="checkbox"
                  checked={hideShipped}
                  onChange={(e) => setHideShipped(e.target.checked)}
                  className="w-3 h-3 rounded border-gray-300 text-primary-600 focus:ring-primary-500 focus:ring-offset-0"
                />
                Hide shipped
              </label>
            </div>
          </div>

          {/* Body */}
          <div className="grid grid-cols-[320px_1fr] flex-1 min-h-0">
            {/* Sidebar */}
            <div className="border-r border-gray-100 bg-gray-50/60 flex flex-col overflow-hidden">
              <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-100 bg-gray-50">
                <SortTab active={sort === 'count'} onClick={() => setSort('count')} icon={<Hash className="w-3 h-3" />} label="Used" />
                <SortTab active={sort === 'pending'} onClick={() => setSort('pending')} icon={<Flame className="w-3 h-3" />} label="Pending" />
                <SortTab active={sort === 'alpha'} onClick={() => setSort('alpha')} icon={<ArrowDownAZ className="w-3 h-3" />} label="A–Z" />
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                {isLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  </div>
                ) : groups.length === 0 ? (
                  <div className="px-4 py-6 text-center text-[11px] text-gray-400">
                    {search ? 'No matches' : 'No components'}
                  </div>
                ) : (
                  groups.map((g) => {
                    const isActive = g.name === selectedName;
                    const allDone = g.total > 0 && g.fitDone === g.total && g.soDone === g.total && g.ldDone === g.total;
                    return (
                      <button
                        key={g.name}
                        onClick={() => { setSelectedName(g.name); setSelectedComponentIds(new Set()); }}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-2 text-left transition-colors rounded-lg',
                          isActive ? 'bg-violet-100 text-violet-700' : 'text-gray-700 hover:bg-gray-100/80'
                        )}
                      >
                        <span className={cn(
                          'flex-shrink-0 w-1.5 h-1.5 rounded-full',
                          allDone ? 'bg-green-400' : g.pending > 0 ? 'bg-amber-400' : 'bg-gray-300'
                        )} />
                        <span className="flex-1 text-xs font-medium truncate">{g.name}</span>
                        <span className={cn(
                          'text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 min-w-[22px] text-center',
                          isActive ? 'bg-white/70' : 'bg-gray-200 text-gray-600'
                        )}>
                          {g.total}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
              {/* Data quality callout */}
              {dupeClusters.length > 0 && (
                <DataQualityCallout clusters={dupeClusters} onMerge={handleMerge} />
              )}
            </div>

            {/* Main content */}
            <div className="flex flex-col overflow-hidden">
              {isLoading ? (
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
                </div>
              ) : !selectedGroup ? (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                  <Package className="w-8 h-8 mb-3" />
                  <p className="text-sm">{search ? `No matches for "${search}"` : 'No components to show'}</p>
                </div>
              ) : (
                <>
                  <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-gray-900 truncate">{selectedGroup.name}</h4>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {selectedGroup.total} {selectedGroup.total === 1 ? 'style' : 'styles'}
                        {selectedGroup.pending > 0 && ` · ${selectedGroup.pending} pending`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <SamplePill label="Fit" done={selectedGroup.fitDone} total={selectedGroup.total} />
                      <SamplePill label="SO" done={selectedGroup.soDone} total={selectedGroup.total} />
                      <SamplePill label="LD" done={selectedGroup.ldDone} total={selectedGroup.total} />
                    </div>
                  </div>
                  {/* Summary strip */}
                  {summary && (
                    <div className="px-5 py-3 border-b border-gray-100 grid grid-cols-3 gap-3">
                      <SummaryCard label="Avg approval (biz days)">
                        <div className="flex items-center gap-2">
                          <AvgStat letter="F" value={summary.avgFit} />
                          <AvgStat letter="SO" value={summary.avgSo} />
                          <AvgStat letter="LD" value={summary.avgLd} />
                        </div>
                      </SummaryCard>
                      <SummaryCard label="Top factories">
                        {summary.topFactories.length === 0 ? (
                          <p className="text-[11px] text-gray-400">—</p>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            {summary.topFactories.map(([name, count]) => (
                              <div key={name} className="flex items-center justify-between gap-2">
                                <span className="text-[11px] text-gray-700 truncate">{name}</span>
                                <span className="text-[10px] font-semibold text-gray-500 flex-shrink-0">{count}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </SummaryCard>
                      <SummaryCard label="Oldest pending">
                        {!summary.oldestPending ? (
                          <p className="text-[11px] text-gray-400">None — all done</p>
                        ) : (
                          <button
                            onClick={() => openStyle(summary.oldestPending!.order.id)}
                            className="text-left w-full group"
                          >
                            <div className="text-[11px] font-semibold text-gray-900 group-hover:text-primary-700 truncate">
                              {summary.oldestPending.order.style_code || summary.oldestPending.order.po_number}
                            </div>
                            <div className="text-[10px] text-amber-600 font-medium">
                              {summary.oldestPendingAge}d since last update
                            </div>
                          </button>
                        )}
                      </SummaryCard>
                    </div>
                  )}

                  {/* Bulk action bar (appears when rows are selected) */}
                  {selectedComponentIds.size > 0 && (
                    <BulkActionBar
                      count={selectedComponentIds.size}
                      onClear={() => setSelectedComponentIds(new Set())}
                      onPick={(field, fieldLabel, value, valueLabel) => setBulkAction({ field, fieldLabel, value, valueLabel })}
                    />
                  )}

                  <div className="flex-1 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-gray-50 border-b border-gray-100 z-10">
                        <tr className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                          <th className="pl-5 pr-2 py-2 w-8">
                            <input
                              type="checkbox"
                              checked={selectedGroup.visibleInstances.length > 0 && selectedGroup.visibleInstances.every((i) => selectedComponentIds.has(i.component.id))}
                              onChange={(e) => {
                                const next = new Set(selectedComponentIds);
                                if (e.target.checked) {
                                  selectedGroup.visibleInstances.forEach((i) => next.add(i.component.id));
                                } else {
                                  selectedGroup.visibleInstances.forEach((i) => next.delete(i.component.id));
                                }
                                setSelectedComponentIds(next);
                              }}
                              className="w-3.5 h-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 focus:ring-offset-0 cursor-pointer"
                            />
                          </th>
                          <th className="px-3 py-2">Style</th>
                          <th className="px-3 py-2">PO</th>
                          <th className="px-3 py-2">Customer</th>
                          <th className="px-3 py-2">Factory</th>
                          <th className="px-3 py-2">Season</th>
                          <th className="px-3 py-2">Ex-fac</th>
                          <th className="px-3 py-2">Updated</th>
                          <th className="px-2 py-2 text-center">Fit</th>
                          <th className="px-2 py-2 text-center">SO</th>
                          <th className="px-2 py-2 text-center">LD</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedGroup.visibleInstances.map(({ order, component }) => {
                          const fit = isSampleDone(component.fit_sample_status, component.fit_sample_approved);
                          const so = isSampleDone(component.strike_off_status, component.strike_off_approved);
                          const ld = isSampleDone(component.lab_dip_status, component.lab_dip_approved);
                          const exFac = order.revised_po_ex_factory || order.original_po_ex_factory;
                          const daysToExFac = businessDaysUntil(exFac);
                          const isSelected = selectedComponentIds.has(component.id);
                          return (
                            <tr
                              key={component.id}
                              onClick={() => openStyle(order.id)}
                              className={cn(
                                'border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors',
                                isSelected && 'bg-primary-50/60 hover:bg-primary-50'
                              )}
                            >
                              <td className="pl-5 pr-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    const next = new Set(selectedComponentIds);
                                    if (e.target.checked) next.add(component.id);
                                    else next.delete(component.id);
                                    setSelectedComponentIds(next);
                                  }}
                                  className="w-3.5 h-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 focus:ring-offset-0 cursor-pointer"
                                />
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="font-semibold text-gray-900">{order.style_code || '—'}</div>
                                {order.colour && <div className="text-[10px] text-gray-400">{order.colour}</div>}
                              </td>
                              <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                                {order.po_number}
                                {order.china_orderbook_ref && (
                                  <span className="text-gray-400 font-normal"> — {order.china_orderbook_ref}</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-gray-600 truncate max-w-[160px]">{order.customer || '—'}</td>
                              <td className="px-3 py-2.5 text-gray-600 truncate max-w-[120px]">{order.factory || '—'}</td>
                              <td className="px-3 py-2.5 text-gray-500 text-[10px] uppercase tracking-wider">{order.season || '—'}</td>
                              <td className="px-3 py-2.5"><ExFacBadge days={daysToExFac} /></td>
                              <td className="px-3 py-2.5 text-gray-500">{relativeTimeShort(component.updated_at)}</td>
                              <td className="px-2 py-2.5 text-center"><Dot done={fit} /></td>
                              <td className="px-2 py-2.5 text-center"><Dot done={so} /></td>
                              <td className="px-2 py-2.5 text-center"><Dot done={ld} /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bulk-update confirm modal */}
      {bulkAction && selectedGroup && (
        <BulkConfirmModal
          action={bulkAction}
          instances={selectedGroup.visibleInstances.filter((i) => selectedComponentIds.has(i.component.id))}
          submitting={bulkSubmitting}
          onCancel={() => setBulkAction(null)}
          onConfirm={async (extra) => {
            const ids = Array.from(selectedComponentIds);
            if (ids.length === 0) { setBulkAction(null); return; }
            setBulkSubmitting(true);
            try {
              const sampleType = SAMPLE_STATUS_FIELD_TO_TYPE[bulkAction.field];
              if (bulkAction.value === 'REJECTED' && sampleType && extra) {
                // Route through the submissions flow so v+1 attempts actually open.
                const res = await submissionsApi.bulkReject({
                  component_ids: ids,
                  sample_type: sampleType as SampleType,
                  reason: extra.reason,
                  notes: extra.notes || undefined,
                });
                toast.success(`Rejected on ${res.rejected_count} styles — v+1 opened`);
              } else {
                const res = await componentsApi.bulkUpdateComponents(ids, bulkAction.field, bulkAction.value);
                toast.success(`${res.changed_count} updated${res.unchanged_count ? ` · ${res.unchanged_count} already matched` : ''}`);
              }
              // Reload orders to pick up fresh component values
              const r = await ordersApi.getOrders(1, 500, {});
              setOrders(r.orders);
              setSelectedComponentIds(new Set());
              setBulkAction(null);
            } catch (e: any) {
              toast.error(e?.response?.data?.detail || 'Bulk update failed');
            } finally {
              setBulkSubmitting(false);
            }
          }}
        />
      )}
    </AppShell>
  );
}

// Fields a user can bulk-set on selected components, with preset values.
// Dates aren't offered here because setting the same date across many styles
// is almost always wrong; stick to status/NOT REQUIRED clears.
const BULK_FIELDS: { key: string; label: string; options: string[] }[] = [
  { key: 'fit_sample_status', label: 'Fit Sample', options: FIT_SAMPLE_STATUS_OPTIONS },
  { key: 'strike_off_status', label: 'Strike Off', options: SAMPLE_STATUS_OPTIONS },
  { key: 'lab_dip_status', label: 'Lab Dip', options: SAMPLE_STATUS_OPTIONS },
];

function BulkActionBar({
  count,
  onClear,
  onPick,
}: {
  count: number;
  onClear: () => void;
  onPick: (field: string, fieldLabel: string, value: string | null, valueLabel: string) => void;
}) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenu(null);
    }
    if (openMenu) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [openMenu]);

  return (
    <div className="sticky top-0 z-20 bg-primary-50/90 backdrop-blur-sm border-b border-primary-200 px-5 py-2 flex items-center gap-3" ref={menuRef}>
      <Wand2 className="w-3.5 h-3.5 text-primary-600 flex-shrink-0" />
      <span className="text-xs font-semibold text-primary-700">{count} selected</span>
      <div className="h-3 w-px bg-primary-300" />
      {BULK_FIELDS.map((f) => (
        <div key={f.key} className="relative">
          <button
            onClick={() => setOpenMenu(openMenu === f.key ? null : f.key)}
            className="flex items-center gap-1 text-[11px] font-medium text-primary-700 hover:bg-primary-100 rounded px-2 py-1 transition-colors"
          >
            Set {f.label}
            <ChevronDown className={cn('w-3 h-3 transition-transform', openMenu === f.key && 'rotate-180')} />
          </button>
          {openMenu === f.key && (
            <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px] z-30">
              {f.options.map((opt) => (
                <button
                  key={opt}
                  onClick={() => { setOpenMenu(null); onPick(f.key, f.label, opt, opt); }}
                  className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-gray-50"
                >
                  {opt}
                </button>
              ))}
              <div className="border-t border-gray-100 my-1" />
              <button
                onClick={() => { setOpenMenu(null); onPick(f.key, f.label, null, 'Clear (empty)'); }}
                className="w-full text-left px-3 py-1.5 text-[11px] text-gray-500 italic hover:bg-gray-50"
              >
                Clear (empty)
              </button>
            </div>
          )}
        </div>
      ))}
      <button
        onClick={onClear}
        className="ml-auto flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700"
      >
        <X className="w-3 h-3" /> Clear selection
      </button>
    </div>
  );
}

function BulkConfirmModal({
  action,
  instances,
  submitting,
  onCancel,
  onConfirm,
}: {
  action: { field: string; fieldLabel: string; value: string | null; valueLabel: string };
  instances: Instance[];
  submitting: boolean;
  onCancel: () => void;
  onConfirm: (extra?: { reason: string; notes: string }) => void;
}) {
  // REJECTED isn't a plain status update — it triggers the resubmission flow
  // (close current attempt, open v+1). So when the user picks it, we need a
  // reason + optional note inside this same modal before confirming.
  const isReject = action.value === 'REJECTED';
  const [reason, setReason] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [reasons, setReasons] = useState<RejectReason[]>([]);
  const [loadingReasons, setLoadingReasons] = useState(false);

  useEffect(() => {
    if (!isReject) return;
    let cancelled = false;
    setLoadingReasons(true);
    submissionsApi.getRejectReasons()
      .then(res => { if (!cancelled) setReasons(res.reasons); })
      .catch(() => { if (!cancelled) toast.error('Failed to load reasons'); })
      .finally(() => { if (!cancelled) setLoadingReasons(false); });
    return () => { cancelled = true; };
  }, [isReject]);

  // Preview: split into changing vs already-matching so user sees real impact.
  // For REJECTED we treat every selected row as "changing" — even rows already
  // at REJECTED need to go through the submission flow to get a v+1 opened.
  const { changing, matching } = useMemo(() => {
    if (isReject) return { changing: instances, matching: [] as Instance[] };
    const changing: Instance[] = [];
    const matching: Instance[] = [];
    for (const i of instances) {
      const current = (i.component as any)[action.field];
      const currentNormalized = current === null || current === undefined ? '' : String(current);
      const targetNormalized = action.value ?? '';
      if (currentNormalized === targetNormalized) matching.push(i);
      else changing.push(i);
    }
    return { changing, matching };
  }, [instances, action, isReject]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !submitting) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, submitting]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={submitting ? undefined : onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-scale-in overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', isReject ? 'bg-red-100' : 'bg-amber-100')}>
            <AlertTriangle className={cn('w-5 h-5', isReject ? 'text-red-600' : 'text-amber-600')} />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900">
              {isReject ? `Reject ${action.fieldLabel} on ${changing.length} styles` : 'Confirm bulk update'}
            </h3>
            <p className="text-xs text-gray-500">
              {isReject
                ? 'Closes the current attempt and opens v+1 on every selected component.'
                : 'This action will update multiple components at once.'}
            </p>
          </div>
        </div>
        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {!isReject && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">What will happen</p>
              <p className="text-sm text-gray-900">
                Set <strong>{action.fieldLabel} Status</strong> to <strong>{action.valueLabel}</strong>
              </p>
              <p className="text-xs text-gray-500 mt-2">
                <strong className="text-gray-900">{changing.length}</strong> will change
                {matching.length > 0 && <> · <span className="text-gray-500">{matching.length} already set to this</span></>}
              </p>
            </div>
          )}
          {isReject && (
            <>
              <div>
                <label className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide mb-1.5 block">
                  Reason
                </label>
                {loadingReasons ? (
                  <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Loading reasons…
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5">
                    {reasons.map((r) => (
                      <button
                        key={r.code}
                        type="button"
                        onClick={() => setReason(r.code)}
                        className={cn(
                          'px-2.5 py-1.5 text-xs rounded-lg border text-left transition-colors',
                          reason === r.code
                            ? 'bg-red-50 border-red-300 text-red-800 font-semibold'
                            : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                        )}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide mb-1.5 block">
                  Note to factory <span className="text-gray-400 font-normal normal-case">(optional)</span>
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="What's wrong and what do you want them to change? Same note sent on all styles."
                  className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white focus:border-transparent resize-none"
                />
              </div>
            </>
          )}
          {changing.length > 0 && (
            <div className="border border-gray-200 rounded-xl max-h-52 overflow-y-auto divide-y divide-gray-100">
              <div className="sticky top-0 bg-gray-50 px-3 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Affected styles ({changing.length})</div>
              {changing.map((i) => {
                const current = (i.component as any)[action.field] || '—';
                return (
                  <div key={i.component.id} className="px-3 py-2 flex items-center gap-2 text-[11px]">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 truncate">{i.order.style_code || `Component #${i.component.id}`}</div>
                      <div className="text-[10px] text-gray-400 truncate">{i.order.po_number} · {i.order.customer || '—'}</div>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-gray-500 flex-shrink-0">
                      <span className="line-through text-gray-400">{current}</span>
                      <span className="text-gray-300">→</span>
                      <span className="font-semibold text-gray-700">{action.valueLabel}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {changing.length === 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center text-xs text-gray-500">
              All selected rows are already set to this value. Nothing will change.
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 bg-gray-50/60">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(isReject ? { reason, notes } : undefined)}
            disabled={submitting || changing.length === 0 || (isReject && !reason)}
            className={cn(
              'px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center gap-2',
              isReject ? 'bg-red-600 hover:bg-red-700' : 'bg-primary-600 hover:bg-primary-700'
            )}
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting
              ? (isReject ? 'Rejecting…' : 'Updating…')
              : isReject
                ? `Reject ${changing.length} style${changing.length === 1 ? '' : 's'}`
                : `Update ${changing.length} style${changing.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}


type DupeCluster = { normalized: string; variants: { name: string; count: number }[] };

function DataQualityCallout({
  clusters,
  onMerge,
}: {
  clusters: DupeCluster[];
  onMerge: (fromNames: string[], toName: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-gray-100 bg-amber-50/40 flex-shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-amber-50 transition-colors"
      >
        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
        <span className="flex-1 text-[11px] font-medium text-amber-800 truncate">
          {clusters.length} potential duplicate{clusters.length !== 1 ? 's' : ''}
        </span>
        <ChevronDown className={cn('w-3 h-3 text-amber-600 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 max-h-80 overflow-y-auto">
          {clusters.map((c) => (
            <DupeClusterCard key={c.normalized} cluster={c} onMerge={onMerge} />
          ))}
        </div>
      )}
    </div>
  );
}

function DupeClusterCard({
  cluster,
  onMerge,
}: {
  cluster: DupeCluster;
  onMerge: (fromNames: string[], toName: string) => Promise<void>;
}) {
  const [merging, setMerging] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Default: keep the variant with the most usage
  const [keepName, setKeepName] = useState(cluster.variants[0]?.name || '');
  const othersCount = cluster.variants
    .filter((v) => v.name !== keepName)
    .reduce((s, v) => s + v.count, 0);

  const handleConfirm = async () => {
    const fromNames = cluster.variants.filter((v) => v.name !== keepName).map((v) => v.name);
    if (fromNames.length === 0) return;
    setMerging(true);
    try {
      await onMerge(fromNames, keepName);
      setPickerOpen(false);
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="bg-white border border-amber-200 rounded-md px-2.5 py-2">
      <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider mb-1">Same name, different casing/spacing</p>
      <div className="space-y-0.5 mb-2">
        {cluster.variants.map((v) => (
          <div key={v.name} className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-gray-700 font-mono truncate">"{v.name}"</span>
            <span className="text-[10px] text-gray-400 flex-shrink-0">{v.count}</span>
          </div>
        ))}
      </div>
      {!pickerOpen ? (
        <button
          onClick={() => setPickerOpen(true)}
          className="w-full text-[10px] font-semibold text-amber-700 hover:text-amber-900 hover:bg-amber-50 border border-amber-300 rounded px-2 py-1 transition-colors"
        >
          Merge these into one →
        </button>
      ) : (
        <div className="space-y-1.5 pt-1 border-t border-amber-100">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Keep which name?</p>
          <div className="space-y-0.5">
            {cluster.variants.map((v) => (
              <label key={v.name} className="flex items-center gap-1.5 text-[11px] cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                <input
                  type="radio"
                  name={`keep-${cluster.normalized}`}
                  checked={keepName === v.name}
                  onChange={() => setKeepName(v.name)}
                  className="w-3 h-3"
                />
                <span className="font-mono text-gray-700 truncate flex-1">"{v.name}"</span>
                <span className="text-[9px] text-gray-400">{v.count}</span>
              </label>
            ))}
          </div>
          <p className="text-[10px] text-amber-700 pt-0.5">
            {othersCount} component{othersCount !== 1 ? 's' : ''} will be renamed.
          </p>
          <div className="flex gap-1.5">
            <button
              onClick={() => setPickerOpen(false)}
              disabled={merging}
              className="flex-1 text-[10px] text-gray-600 hover:bg-gray-100 rounded px-2 py-1 border border-gray-200"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={merging || othersCount === 0}
              className="flex-1 text-[10px] font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded px-2 py-1 disabled:opacity-50"
            >
              {merging ? 'Merging...' : 'Confirm merge'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


function SortTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md transition-colors',
        active ? 'bg-violet-100 text-violet-700' : 'text-gray-500 hover:bg-gray-100'
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function SamplePill({ label, done, total }: { label: string; done: number; total: number }) {
  const allDone = total > 0 && done === total;
  return (
    <span
      className={cn(
        'text-[10px] px-2 py-0.5 rounded font-semibold',
        allDone ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
      )}
    >
      {label} {done}/{total}
    </span>
  );
}

function SummaryCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50/70 border border-gray-100 rounded-lg px-3 py-2">
      <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{label}</p>
      {children}
    </div>
  );
}

function AvgStat({ letter, value }: { letter: string; value: number | null }) {
  const color =
    value === null ? 'text-gray-300'
      : value > 14 ? 'text-red-500'
      : value > 7 ? 'text-amber-500'
      : 'text-green-600';
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-[9px] font-semibold text-gray-400">{letter}</span>
      <span className={cn('text-sm font-bold tabular-nums', color)}>
        {value === null ? '—' : `${value}d`}
      </span>
    </div>
  );
}

function ExFacBadge({ days }: { days: number | null }) {
  if (days === null) return <span className="text-gray-300">—</span>;
  const overdue = days < 0;
  const color =
    overdue ? 'bg-red-100 text-red-700'
      : days <= 7 ? 'bg-red-50 text-red-600'
      : days <= 14 ? 'bg-amber-100 text-amber-700'
      : 'bg-gray-100 text-gray-600';
  return (
    <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-semibold tabular-nums', color)}>
      {overdue ? `${Math.abs(days)}d late` : `${days}d`}
    </span>
  );
}

function Dot({ done }: { done: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold',
        done ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
      )}
    >
      {done ? '✓' : '·'}
    </span>
  );
}
