'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCcw, Loader2, AlertTriangle, Package, Factory, Layers } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/layout/AuthProvider';
import { submissionsApi, type ResubmissionsOverview, type SampleType } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';

export default function ResubmissionsPage() {
  return (
    <AuthProvider>
      <ResubmissionsContent />
    </AuthProvider>
  );
}

const SAMPLE_LABEL: Record<SampleType, string> = {
  fit: 'Fit Sample',
  strike: 'Strike Off',
  lab: 'Lab Dip',
  pps: 'PPS',
};

function ftrColour(pct: number): string {
  if (pct >= 75) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (pct >= 50) return 'text-amber-700 bg-amber-50 border-amber-200';
  return 'text-red-700 bg-red-50 border-red-200';
}

function ResubmissionsContent() {
  const { user } = useStore();
  const router = useRouter();
  const [data, setData] = useState<ResubmissionsOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    submissionsApi.getOverview()
      .then(res => { if (!cancelled) setData(res); })
      .catch(() => { /* toast handled by caller if needed */ })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (user && user.role === 'supplier') {
    return (
      <AppShell title="Resubmissions">
        <div className="flex items-center justify-center h-[calc(100vh-200px)]">
          <p className="text-sm text-gray-500">You do not have permission to view this page.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Resubmissions">
      <div className="p-6">
        <div
          className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] ring-1 ring-gray-100 overflow-hidden flex flex-col"
          style={{ height: 'calc(100vh - 100px)' }}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4 flex-shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <RefreshCcw className="w-5 h-5 text-red-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-gray-900">Resubmissions</h3>
                <p className="text-xs text-gray-500 truncate">
                  {isLoading ? 'Loading…'
                    : data?.empty ? 'Nothing to show — no sample has been rejected yet. Everything\'s clearing on v1.'
                    : `${data?.in_rework_now ?? 0} sample${(data?.in_rework_now ?? 0) === 1 ? '' : 's'} currently in rework`}
                </p>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : data?.empty ? (
              <EmptyState />
            ) : data ? (
              <PopulatedDashboard data={data} onOpenOrder={(orderId) => router.push(`/orders-v2?order=${orderId}`)} />
            ) : (
              <div className="text-sm text-gray-500">Failed to load resubmissions data.</div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16">
      <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
        <Package className="w-8 h-8 text-emerald-600" />
      </div>
      <h4 className="text-base font-bold text-gray-900 mb-1">All cleared on first attempt</h4>
      <p className="text-sm text-gray-500 max-w-sm">
        Nothing has been rejected yet, so there&apos;s nothing to review here. This page will populate automatically
        once a sample area is sent back for rework.
      </p>
    </div>
  );
}

function PopulatedDashboard({
  data,
  onOpenOrder,
}: {
  data: ResubmissionsOverview;
  onOpenOrder: (orderId: number) => void;
}) {
  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-3 gap-3">
        <StatTile
          label="In rework now"
          value={data.in_rework_now}
          hint="Sample areas on attempt 2+"
          tone={data.in_rework_now > 0 ? 'warn' : 'info'}
        />
        <StatTile
          label="Total rejections logged"
          value={data.by_factory.reduce((s, f) => s + f.rejections, 0)}
          hint="Across all time"
        />
        <StatTile
          label="Stuck (3+ attempts)"
          value={data.stuck.filter(s => s.attempt_no >= 3).length}
          hint="Need eyes on these"
          tone={data.stuck.some(s => s.attempt_no >= 3) ? 'danger' : 'info'}
        />
      </div>

      {/* Stuck list */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <h4 className="text-sm font-bold text-gray-900">Stuck in rework</h4>
          </div>
          <span className="text-xs text-gray-400">{data.stuck.length} open</span>
        </div>
        {data.stuck.length === 0 ? (
          <div className="text-xs text-gray-500 px-3 py-4 border border-dashed border-gray-200 rounded-lg bg-gray-50/40">
            No open rework right now.
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">PO</th>
                  <th className="text-left px-3 py-2 font-semibold">Component</th>
                  <th className="text-left px-3 py-2 font-semibold">Area</th>
                  <th className="text-left px-3 py-2 font-semibold">Factory</th>
                  <th className="text-center px-3 py-2 font-semibold">v</th>
                  <th className="text-right px-3 py-2 font-semibold">Days open</th>
                  <th className="text-left px-3 py-2 font-semibold">Last reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.stuck.map(row => {
                  const stuck = row.attempt_no >= 3;
                  return (
                    <tr
                      key={row.submission_id}
                      className={cn('hover:bg-gray-50 cursor-pointer', stuck && 'bg-red-50/30')}
                      onClick={() => onOpenOrder(row.order_id)}
                    >
                      <td className="px-3 py-2 font-mono text-[11px] text-gray-700">
                        {row.po_number}
                        {row.china_orderbook_ref && <span className="text-gray-400"> — {row.china_orderbook_ref}</span>}
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-800">{row.component_name || <span className="text-gray-400 italic">order-level</span>}</td>
                      <td className="px-3 py-2 text-gray-600">{SAMPLE_LABEL[row.sample_type]}</td>
                      <td className="px-3 py-2 text-gray-600 truncate max-w-[160px]">{row.factory || '—'}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={cn(
                          'inline-flex items-center text-[10px] px-1.5 py-0.5 rounded font-bold border',
                          stuck ? 'bg-red-100 text-red-700 border-red-300' : 'bg-amber-100 text-amber-800 border-amber-300'
                        )}>
                          v{row.attempt_no}
                        </span>
                      </td>
                      <td className={cn('px-3 py-2 text-right font-semibold', stuck ? 'text-red-700' : 'text-gray-700')}>
                        {row.days_open}
                      </td>
                      <td className="px-3 py-2 text-gray-600 text-xs max-w-[260px] truncate">
                        {row.last_reason ? (
                          <span>
                            <span className="font-semibold text-gray-700">{row.last_reason}</span>
                            {row.last_reason_notes && <span className="text-gray-500"> — {row.last_reason_notes}</span>}
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Breakdown row */}
      <div className="grid grid-cols-2 gap-4">
        <BreakdownCard title="By factory" icon={<Factory className="w-3.5 h-3.5" />} subtitle="First-time-right rate · all time">
          {data.by_factory.length === 0 ? (
            <div className="text-xs text-gray-400 italic py-2">No rejections recorded yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-1.5 font-semibold">Factory</th>
                  <th className="text-right px-3 py-1.5 font-semibold">FTR</th>
                  <th className="text-right px-3 py-1.5 font-semibold">Rejects</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.by_factory.map(row => (
                  <tr key={row.factory} className="hover:bg-gray-50">
                    <td className="px-3 py-1.5 text-gray-800 truncate max-w-[200px]">{row.factory}</td>
                    <td className="px-3 py-1.5 text-right">
                      <span className={cn('inline-flex text-[10px] px-1.5 py-0.5 rounded border font-semibold', ftrColour(row.ftr_pct))}>
                        {row.ftr_pct}%
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right text-gray-700 tabular-nums">{row.rejections}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </BreakdownCard>

        <BreakdownCard title="By sample type" icon={<Layers className="w-3.5 h-3.5" />} subtitle="Where the retries concentrate">
          {data.by_type.length === 0 ? (
            <div className="text-xs text-gray-400 italic py-2">No rejections recorded yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-1.5 font-semibold">Sample</th>
                  <th className="text-right px-3 py-1.5 font-semibold">FTR</th>
                  <th className="text-right px-3 py-1.5 font-semibold">Rejects</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.by_type.map(row => (
                  <tr key={row.sample_type} className="hover:bg-gray-50">
                    <td className="px-3 py-1.5 text-gray-800">{SAMPLE_LABEL[row.sample_type]}</td>
                    <td className="px-3 py-1.5 text-right">
                      <span className={cn('inline-flex text-[10px] px-1.5 py-0.5 rounded border font-semibold', ftrColour(row.ftr_pct))}>
                        {row.ftr_pct}%
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right text-gray-700 tabular-nums">{row.rejections}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </BreakdownCard>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  tone?: 'info' | 'warn' | 'danger';
}) {
  const toneClasses =
    tone === 'danger' ? 'border-red-200 bg-red-50/60' :
    tone === 'warn'   ? 'border-amber-200 bg-amber-50/60' :
                        'border-gray-200 bg-white';
  const valueTone =
    tone === 'danger' ? 'text-red-700' :
    tone === 'warn'   ? 'text-amber-800' :
                        'text-gray-900';
  return (
    <div className={cn('rounded-lg border p-4', toneClasses)}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className={cn('text-3xl font-bold mt-1', valueTone)}>{value}</div>
      <div className="text-[11px] text-gray-500 mt-1">{hint}</div>
    </div>
  );
}

function BreakdownCard({
  title,
  icon,
  subtitle,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <div className="px-3 py-2 border-b border-gray-200 bg-gray-50/40">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
          {icon}
          {title}
        </div>
        <div className="text-[11px] text-gray-500 mt-0.5">{subtitle}</div>
      </div>
      {children}
    </div>
  );
}
