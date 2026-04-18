'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Package,
  CheckCircle,
  Loader2,
  RefreshCw,
  ChevronDown,
  AlertTriangle,
  Search,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/layout/AuthProvider';
import { analyticsApi } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';

export default function DesignOverviewPage() {
  return (
    <AuthProvider>
      <DesignOverviewContent />
    </AuthProvider>
  );
}

function DesignOverviewContent() {
  const { user } = useStore();
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const result = await analyticsApi.getDesignAnalytics();
      setData(result);
    } catch {
      toast.error('Failed to load design analytics');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (isLoading) {
    return (
      <AppShell title="Design Overview">
        <div className="flex items-center justify-center h-[calc(100vh-200px)]">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Loading design analytics...</p>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!data) return null;

  return (
    <AppShell title="Design Overview">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Design Overview</h1>
            <p className="text-sm text-gray-500 mt-1">Sampling progress, component tracking, and factory performance</p>
          </div>
          <button onClick={loadData} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {/* PO Completion Tracker */}
        <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">PO Completion Tracker</h3>
          <p className="text-[11px] text-gray-400 mb-4">Sampling progress per purchase order (least complete first)</p>
          <div className="max-h-[400px] overflow-y-auto">
            {(data.po_completion || []).length === 0 ? (
              <div className="text-center py-6 text-xs text-gray-400">No data</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 font-semibold text-gray-500 w-[80px]">PO#</th>
                    <th className="text-left py-2 font-semibold text-gray-500">Customer</th>
                    <th className="text-left py-2 font-semibold text-gray-500">Factory</th>
                    <th className="text-left py-2 font-semibold text-gray-500 w-[40%]">Progress</th>
                    <th className="text-right py-2 font-semibold text-gray-500 w-[80px]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.po_completion || []).map((po: any) => (
                    <tr key={po.po_number} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer group" onClick={() => window.location.href = `/design?expandPO=${encodeURIComponent(po.po_number)}`}>
                      <td className="py-2 font-bold text-gray-900 group-hover:text-primary-700">{po.po_number}</td>
                      <td className="py-2 text-gray-600 truncate max-w-[120px]">{po.customer}</td>
                      <td className="py-2 text-gray-400 truncate max-w-[100px]">{po.factory}</td>
                      <td className="py-2 pr-3">
                        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={cn('h-full rounded-full transition-all', po.completion_pct === 100 ? 'bg-green-500' : po.completion_pct >= 50 ? 'bg-primary-500' : 'bg-amber-500')}
                            style={{ width: `${Math.max(po.completion_pct, 2)}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-2 text-right">
                        <span className={cn('font-bold', po.completion_pct === 100 ? 'text-green-600' : 'text-gray-700')}>
                          {po.approved_samples}/{po.total_samples}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Component Coverage + Factory Performance */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Component Coverage */}
          <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Component Coverage</h3>
            <div className="text-center mb-4">
              <p className="text-3xl font-bold text-violet-600">{data.component_coverage?.coverage_pct || 0}%</p>
              <p className="text-xs text-gray-400 mt-1">of orders have components</p>
            </div>
            {(data.component_coverage?.by_component_name || []).length > 0 && (
              <div className="mb-4">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Components</p>
                <div className="space-y-1.5">
                  {(data.component_coverage?.by_component_name || []).map((c: any) => (
                    <div key={c.name} className="flex items-center justify-between text-xs">
                      <span className="text-gray-700 font-medium">{c.name}</span>
                      <span className="text-gray-500">{c.count} styles</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1 text-xs border-t border-gray-100 pt-3">
              <div className="flex justify-between py-1">
                <span className="text-gray-500">With components</span>
                <span className="font-semibold text-green-600">{data.component_coverage?.orders_with_components || 0}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Without components</span>
                <span className="font-semibold text-red-500">{data.component_coverage?.orders_without_components || 0}</span>
              </div>
            </div>
          </div>

          {/* Factory Sample Performance */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200/60 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Factory Sample Performance (Avg Business Days to Approve)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 font-semibold text-gray-500">Factory</th>
                    <th className="text-center py-2 font-semibold text-gray-500">Orders</th>
                    <th className="text-center py-2 font-semibold text-blue-500">Fit</th>
                    <th className="text-center py-2 font-semibold text-purple-500">Strike Off</th>
                    <th className="text-center py-2 font-semibold text-amber-500">Lab Dip</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.factory_sample_performance || []).map((f: any) => (
                    <tr key={f.factory} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 font-medium text-gray-900">{f.factory}</td>
                      <td className="py-2 text-center text-gray-600">{f.total_orders}</td>
                      <td className="py-2 text-center">
                        {f.avg_fit_days != null ? <span className={cn('font-semibold', f.avg_fit_days > 14 ? 'text-red-500' : f.avg_fit_days > 7 ? 'text-amber-500' : 'text-green-500')}>{f.avg_fit_days}d</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-2 text-center">
                        {f.avg_strike_off_days != null ? <span className={cn('font-semibold', f.avg_strike_off_days > 14 ? 'text-red-500' : f.avg_strike_off_days > 7 ? 'text-amber-500' : 'text-green-500')}>{f.avg_strike_off_days}d</span> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-2 text-center">
                        {f.avg_lab_dip_days != null ? <span className={cn('font-semibold', f.avg_lab_dip_days > 14 ? 'text-red-500' : f.avg_lab_dip_days > 7 ? 'text-amber-500' : 'text-green-500')}>{f.avg_lab_dip_days}d</span> : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))}
                  {(data.factory_sample_performance || []).length === 0 && (
                    <tr><td colSpan={5} className="py-6 text-center text-gray-400">No factory data yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Season Overview + Customer Workload */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Season Overview */}
          <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Season Overview</h3>
            <p className="text-[11px] text-gray-400 mb-4">Sampling completion by season</p>
            <div className="space-y-3">
              {(data.season_overview || []).length === 0 ? (
                <div className="text-center py-6 text-xs text-gray-400">No data</div>
              ) : (data.season_overview || []).map((s: any) => (
                <div key={s.season}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold text-gray-900">{s.season}</span>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-green-600 font-semibold">{s.complete} done</span>
                      <span className="text-amber-600 font-semibold">{s.in_progress} in progress</span>
                      <span className="text-gray-400">{s.total} total</span>
                    </div>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden flex">
                    <div className="h-full bg-green-500 transition-all" style={{ width: `${s.completion_pct}%` }} />
                    <div className="h-full bg-amber-400 transition-all" style={{ width: `${100 - s.completion_pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Customer Workload */}
          <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Customer Workload</h3>
            <p className="text-[11px] text-gray-400 mb-4">Styles with incomplete sampling by customer</p>
            <div className="space-y-1 max-h-[400px] overflow-y-auto">
              {(data.customer_workload || []).length === 0 ? (
                <div className="text-center py-6 text-xs text-gray-400">No data</div>
              ) : (data.customer_workload || []).map((c: any) => (
                <CustomerRow key={c.customer} customer={c} />
              ))}
            </div>
          </div>
        </div>

        {/* At Risk + Awaiting Action */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* At Risk */}
          <SearchableAlertCard
            title="Late / At Risk Samples"
            description="Approaching ex-factory with unapproved samples"
            emptyIcon={<CheckCircle className="w-6 h-6 mx-auto mb-2 text-green-400" />}
            emptyText="No at-risk samples"
            items={data.at_risk_samples || []}
            renderItem={(item: any) => (
              <Link key={item.id} href={`/design?openStyle=${item.id}`} className="block px-3 py-2.5 bg-red-50/60 rounded-xl border border-red-100 text-xs hover:bg-red-50 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-gray-900">{item.po_number} · {item.style_code}</span>
                  <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full', item.days_until_ex_factory <= 14 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')}>
                    {item.days_until_ex_factory}d to ex-fac
                  </span>
                </div>
                <p className="text-gray-500">{item.factory} · {item.customer}</p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {item.issues.map((issue: string, i: number) => (
                    <span key={i} className="text-[9px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded font-medium">{issue}</span>
                  ))}
                </div>
              </Link>
            )}
          />

          {/* Awaiting Action */}
          <SearchableAlertCard
            title="Awaiting Action"
            description="Samples received but not yet approved"
            emptyIcon={<CheckCircle className="w-6 h-6 mx-auto mb-2 text-green-400" />}
            emptyText="All samples actioned"
            items={data.awaiting_action || []}
            renderItem={(item: any) => (
              <Link key={item.id} href={`/design?openStyle=${item.id}`} className="block px-3 py-2.5 bg-amber-50/60 rounded-xl border border-amber-100 text-xs hover:bg-amber-50 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-gray-900">{item.po_number} · {item.style_code}</span>
                  <span className="text-[10px] text-gray-400">{item.factory}</span>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {item.actions.map((a: any, i: number) => (
                    <span key={i} className={cn('text-[9px] px-1.5 py-0.5 rounded font-medium', a.received_days_ago > 14 ? 'bg-red-100 text-red-600' : a.received_days_ago > 7 ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600')}>
                      {a.type} · {a.received_days_ago}d ago
                    </span>
                  ))}
                </div>
              </Link>
            )}
          />
        </div>
      </div>
    </AppShell>
  );
}

function CustomerRow({ customer: c }: { customer: any }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between py-2 px-1 hover:bg-gray-50 rounded-lg transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <ChevronDown className={cn('w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0', expanded && 'rotate-180')} />
          <span className="text-sm font-medium text-gray-900 truncate">{c.customer}</span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {c.incomplete > 0 && <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{c.incomplete} incomplete</span>}
          {c.complete > 0 && <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{c.complete} done</span>}
          <span className="text-xs text-gray-400">{c.total_styles}</span>
        </div>
      </button>
      {expanded && c.pos && (
        <div className="ml-6 mb-2 space-y-0.5">
          {c.pos.map((po: any) => (
            <Link
              key={po.po_number}
              href={`/design?expandPO=${encodeURIComponent(po.po_number)}`}
              className="flex items-center justify-between px-3 py-1.5 rounded-lg hover:bg-primary-50 transition-colors group"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-900 group-hover:text-primary-700">{po.po_number}</span>
                <span className="text-[10px] text-gray-400">{po.factory}</span>
              </div>
              <div className="flex items-center gap-2">
                {po.incomplete > 0 && <span className="text-[9px] font-bold text-amber-600">{po.incomplete} incomplete</span>}
                <span className="text-[10px] text-gray-400">{po.styles} style{po.styles !== 1 ? 's' : ''}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function SearchableAlertCard({ title, description, emptyIcon, emptyText, items, renderItem }: {
  title: string;
  description: string;
  emptyIcon: React.ReactNode;
  emptyText: string;
  items: any[];
  renderItem: (item: any) => React.ReactNode;
}) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item: any) =>
      (item.po_number || '').toLowerCase().includes(q) ||
      (item.style_code || '').toLowerCase().includes(q) ||
      (item.customer || '').toLowerCase().includes(q) ||
      (item.factory || '').toLowerCase().includes(q)
    );
  }, [items, search]);

  return (
    <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {items.length > 3 && (
          <div className="relative">
            <Search className="w-3 h-3 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="pl-6 pr-2 py-1 text-[10px] bg-gray-50 border border-gray-200 rounded-md w-32 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:w-44 transition-all"
            />
          </div>
        )}
      </div>
      <p className="text-[11px] text-gray-400 mb-3">{description}{search && ` · ${filtered.length} match${filtered.length !== 1 ? 'es' : ''}`}</p>
      <div className="space-y-2 max-h-[350px] overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-xs text-gray-400">
            {search ? (
              <>
                <Search className="w-5 h-5 mx-auto mb-2 text-gray-300" />
                No matches
              </>
            ) : (
              <>
                {emptyIcon}
                {emptyText}
              </>
            )}
          </div>
        ) : filtered.map(renderItem)}
      </div>
    </div>
  );
}
