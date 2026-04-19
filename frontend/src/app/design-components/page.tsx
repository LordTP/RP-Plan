'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Layers, Search, Loader2, Package, ArrowDownAZ, Flame, Hash, X, AlertTriangle, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/layout/AuthProvider';
import { ordersApi } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import { isSampleDone, businessDaysBetween, businessDaysUntil, relativeTimeShort } from '@/lib/sampleStatus';
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
      const visibleInstances = q && !nameMatches
        ? instances.filter(({ order }) => orderMatchesQuery(order, q))
        : instances;

      // If searching and nothing matches for this group, skip it
      if (q && visibleInstances.length === 0) continue;

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
    const byNorm = new Map<string, string[]>();
    for (const g of rawGroups) {
      const norm = normalizeComponentName(g.name);
      if (!norm) continue;
      if (!byNorm.has(norm)) byNorm.set(norm, []);
      byNorm.get(norm)!.push(g.name);
    }
    const clusters: { normalized: string; variants: string[] }[] = [];
    for (const [norm, variants] of Array.from(byNorm.entries())) {
      const uniqueVariants = Array.from(new Set(variants));
      if (uniqueVariants.length > 1) {
        clusters.push({ normalized: norm, variants: uniqueVariants });
      }
    }
    return clusters;
  }, [rawGroups]);

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
          className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] ring-1 ring-gray-100 overflow-hidden"
          style={{ height: 'calc(100vh - 100px)' }}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
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
            <div className="flex items-center gap-4 flex-shrink-0">
              <label className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hideShipped}
                  onChange={(e) => setHideShipped(e.target.checked)}
                  className="w-3 h-3 rounded border-gray-300 text-primary-600 focus:ring-primary-500 focus:ring-offset-0"
                />
                Hide shipped
              </label>
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
            </div>
          </div>

          {/* Body */}
          <div className="grid grid-cols-[320px_1fr]" style={{ height: 'calc(100% - 65px)' }}>
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
                        onClick={() => setSelectedName(g.name)}
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
                <DataQualityCallout clusters={dupeClusters} />
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

                  <div className="flex-1 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-gray-50 border-b border-gray-100 z-10">
                        <tr className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                          <th className="px-5 py-2">Style</th>
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
                          return (
                            <tr
                              key={component.id}
                              onClick={() => openStyle(order.id)}
                              className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                            >
                              <td className="px-5 py-2.5">
                                <div className="font-semibold text-gray-900">{order.style_code || '—'}</div>
                                {order.colour && <div className="text-[10px] text-gray-400">{order.colour}</div>}
                              </td>
                              <td className="px-3 py-2.5 text-gray-600">{order.po_number}</td>
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
    </AppShell>
  );
}

function DataQualityCallout({ clusters }: { clusters: { normalized: string; variants: string[] }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-gray-100 bg-amber-50/40">
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
        <div className="px-3 pb-3 space-y-2 max-h-60 overflow-y-auto">
          {clusters.map((c) => (
            <div key={c.normalized} className="bg-white border border-amber-200 rounded-md px-2.5 py-1.5">
              <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider mb-0.5">Same name, different casing/spacing</p>
              <div className="space-y-0.5">
                {c.variants.map((v) => (
                  <div key={v} className="text-[11px] text-gray-700 font-mono truncate">"{v}"</div>
                ))}
              </div>
            </div>
          ))}
          <p className="text-[10px] text-amber-700 leading-relaxed pt-1">
            Tip: edit the component names on their styles so they match exactly.
          </p>
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
