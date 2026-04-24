'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCcw, Loader2, AlertTriangle, Package, Factory, Layers, Check, Inbox, X as XIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/layout/AuthProvider';
import { submissionsApi, type ResubmissionsOverview, type SampleType, type StuckRow } from '@/lib/api';
import { RejectSampleModal } from '@/components/samples/RejectSampleModal';
import { ScopeActionModal } from '@/components/samples/ScopeActionModal';
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
  const [rejectModal, setRejectModal] = useState<{
    orderId: number;
    componentId: number | null;
    componentName: string | null;
    sampleType: SampleType;
    currentAttemptNo: number;
  } | null>(null);
  const [scopeModal, setScopeModal] = useState<{
    kind: 'approve' | 'markReceived';
    row: StuckRow;
  } | null>(null);

  const refresh = useCallback(() => {
    let cancelled = false;
    setIsLoading(true);
    submissionsApi.getOverview()
      .then(res => { if (!cancelled) setData(res); })
      .catch(() => { /* silent */ })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleMarkReceived = (row: StuckRow) => setScopeModal({ kind: 'markReceived', row });
  const handleApprove = (row: StuckRow) => setScopeModal({ kind: 'approve', row });
  const handleRejectAgain = (row: StuckRow) => {
    setRejectModal({
      orderId: row.order_id,
      componentId: row.component_id,
      componentName: row.component_name,
      sampleType: row.sample_type,
      currentAttemptNo: row.attempt_no,
    });
  };

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
              <PopulatedDashboard
                data={data}
                onOpenOrder={(orderId) => router.push(`/orders-v2?order=${orderId}`)}
                onMarkReceived={handleMarkReceived}
                onApprove={handleApprove}
                onRejectAgain={handleRejectAgain}
              />
            ) : (
              <div className="text-sm text-gray-500">Failed to load resubmissions data.</div>
            )}
          </div>
        </div>
      </div>

      {rejectModal && (
        <RejectSampleModal
          orderId={rejectModal.orderId}
          componentId={rejectModal.componentId}
          componentName={rejectModal.componentName}
          sampleType={rejectModal.sampleType}
          currentAttemptNo={rejectModal.currentAttemptNo}
          onClose={() => setRejectModal(null)}
          onRejected={() => { setRejectModal(null); refresh(); }}
        />
      )}
      {scopeModal && (
        <ScopeActionModal
          kind={scopeModal.kind}
          orderId={scopeModal.row.order_id}
          componentId={scopeModal.row.component_id}
          componentName={scopeModal.row.component_name}
          styleCode={scopeModal.row.style_code}
          sampleType={scopeModal.row.sample_type}
          attemptNo={scopeModal.row.attempt_no}
          onClose={() => setScopeModal(null)}
          onDone={() => { setScopeModal(null); refresh(); }}
        />
      )}
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
  onMarkReceived,
  onApprove,
  onRejectAgain,
}: {
  data: ResubmissionsOverview;
  onOpenOrder: (orderId: number) => void;
  onMarkReceived: (row: StuckRow) => void;
  onApprove: (row: StuckRow) => void;
  onRejectAgain: (row: StuckRow) => void;
}) {
  // Group the stuck list by PO so sibling reworks cluster together. Keeps the
  // per-row actions visible for the multi-style scope decision at click time.
  const grouped = useMemo(() => {
    const map = new Map<string, StuckRow[]>();
    for (const row of data.stuck) {
      const key = row.po_number || '—';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    // Sort POs by most-recent days_open descending on their worst row
    return Array.from(map.entries()).sort(([, a], [, b]) => {
      const maxA = Math.max(...a.map(r => r.days_open));
      const maxB = Math.max(...b.map(r => r.days_open));
      return maxB - maxA;
    });
  }, [data.stuck]);
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
          <div className="space-y-4">
            {grouped.map(([poNumber, rows]) => {
              const firstRow = rows[0];
              const worstDays = Math.max(...rows.map(r => r.days_open));
              const anyStuck = rows.some(r => r.attempt_no >= 3);
              return (
                <div key={poNumber} className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* PO group header */}
                  <div className={cn('px-3 py-2 border-b flex items-center gap-3 flex-wrap', anyStuck ? 'bg-red-50/50 border-red-200' : 'bg-gray-50 border-gray-200')}>
                    <button
                      onClick={() => onOpenOrder(firstRow.order_id)}
                      className="text-xs font-mono font-semibold text-gray-800 hover:underline"
                    >
                      PO {poNumber}
                      {firstRow.china_orderbook_ref && <span className="text-gray-400 font-normal"> — {firstRow.china_orderbook_ref}</span>}
                    </button>
                    <span className="text-[11px] text-gray-500">{firstRow.factory || '—'}</span>
                    <span className="text-[11px] text-gray-400">·</span>
                    <span className="text-[11px] text-gray-500">{rows.length} in rework</span>
                    <span className="ml-auto text-[11px] text-gray-500">
                      worst <span className={cn('font-semibold', anyStuck ? 'text-red-700' : 'text-gray-700')}>{worstDays}d</span>
                    </span>
                  </div>
                  {/* Row table */}
                  <table className="w-full text-sm">
                    <thead className="bg-white text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                      <tr>
                        <th className="text-left px-3 py-1.5 font-semibold">Style</th>
                        <th className="text-left px-3 py-1.5 font-semibold">Component</th>
                        <th className="text-left px-3 py-1.5 font-semibold">Area</th>
                        <th className="text-center px-3 py-1.5 font-semibold">v</th>
                        <th className="text-right px-3 py-1.5 font-semibold">Days</th>
                        <th className="text-left px-3 py-1.5 font-semibold">Last reason</th>
                        <th className="text-right px-3 py-1.5 font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.map(row => {
                        const isStuck = row.attempt_no >= 3;
                        return (
                          <tr key={row.submission_id} className={cn('hover:bg-gray-50', isStuck && 'bg-red-50/20')}>
                            <td className="px-3 py-2 min-w-0">
                              <button
                                onClick={() => onOpenOrder(row.order_id)}
                                className="text-xs text-left hover:underline min-w-0 block max-w-[220px] truncate"
                                title={`${row.style_code || ''} ${row.description || ''} ${row.colour || ''}`.trim()}
                              >
                                <span className="font-mono font-semibold text-gray-800">{row.style_code || `#${row.order_id}`}</span>
                                {row.colour && <span className="text-gray-500"> · {row.colour}</span>}
                                {row.description && <div className="text-[10px] text-gray-400 truncate">{row.description}</div>}
                              </button>
                            </td>
                            <td className="px-3 py-2 font-medium text-gray-800 text-xs">
                              {row.component_name || <span className="text-gray-400 italic">order-level</span>}
                            </td>
                            <td className="px-3 py-2 text-gray-600 text-xs">{SAMPLE_LABEL[row.sample_type]}</td>
                            <td className="px-3 py-2 text-center">
                              <span className={cn(
                                'inline-flex items-center text-[10px] px-1.5 py-0.5 rounded font-bold border',
                                isStuck ? 'bg-red-100 text-red-700 border-red-300' : 'bg-amber-100 text-amber-800 border-amber-300'
                              )}>
                                v{row.attempt_no}
                              </span>
                            </td>
                            <td className={cn('px-3 py-2 text-right text-xs font-semibold', isStuck ? 'text-red-700' : 'text-gray-700')}>
                              {row.days_open}
                            </td>
                            <td className="px-3 py-2 text-gray-600 text-xs max-w-[220px] truncate">
                              {row.last_reason ? (
                                <span>
                                  <span className="font-semibold text-gray-700">{row.last_reason}</span>
                                  {row.last_reason_notes && <span className="text-gray-500"> — {row.last_reason_notes}</span>}
                                </span>
                              ) : '—'}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div className="inline-flex items-center gap-1">
                                <InlineBtn title="Mark received…" icon={<Inbox className="w-3 h-3" />} onClick={() => onMarkReceived(row)} tone="neutral" />
                                <InlineBtn title="Approve…" icon={<Check className="w-3 h-3" />} onClick={() => onApprove(row)} tone="success" />
                                <InlineBtn title="Reject again…" icon={<XIcon className="w-3 h-3" />} onClick={() => onRejectAgain(row)} tone="danger" />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
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

function InlineBtn({
  title,
  icon,
  onClick,
  tone,
}: {
  title: string;
  icon: React.ReactNode;
  onClick: () => void;
  tone: 'neutral' | 'success' | 'danger';
}) {
  const toneClasses =
    tone === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' :
    tone === 'danger'  ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100' :
                         'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100';
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn('inline-flex items-center justify-center w-6 h-6 rounded-md border transition-colors', toneClasses)}
    >
      {icon}
    </button>
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
