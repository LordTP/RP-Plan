'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Clock, CheckCircle, XCircle, X, Loader2 } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/layout/AuthProvider';
import { useStore } from '@/store/useStore';
import {
  statsApi,
  approvalsApi,
  analyticsApi,
  type RecentActivityEvent,
  type PendingApprovalGroup,
  type MyPendingChange,
  type MyApprovedChange,
  type RejectedChange,
} from '@/lib/api';
import { formatNumber, formatDate, cn } from '@/lib/utils';
import { InboxAtScale } from '@/components/dashboard/InboxAtScale';
import { RecentActivityFeed, groupBulkActivity } from '@/components/dashboard/RecentActivityFeed';
import { CriticalPathBoard } from '@/components/dashboard/CriticalPathBoard';

/**
 * /dashboard — flat, scale-friendly layout.
 *   [ KPI strip — Total / In Production / Shipped / Delivered / Overdue ]
 *   [ Inbox (7/12) ............. Activity (5/12) ]
 *   [ Warnings Centre (below the fold when populated) ]
 *
 * The old dashboard content is retired; /dashboard-v2 now redirects here
 * so anyone with the v2 URL bookmarked lands in the right place.
 */

function DashboardContent() {
  const router = useRouter();
  const { user, dashboardStats, setDashboardStats } = useStore();

  const [isLoading, setIsLoading] = useState(true);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApprovalGroup[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivityEvent[]>([]);
  const [hasMoreActivity, setHasMoreActivity] = useState(false);
  const [loadingMoreActivity, setLoadingMoreActivity] = useState(false);
  // Supplier date-change tracking — carried over from the v1 dashboard so
  // suppliers still see their pending / approved / rejected changes at a
  // glance. Loaded only when the current user is a supplier.
  const [myPendingChanges, setMyPendingChanges] = useState<MyPendingChange[]>([]);
  const [myApprovedChanges, setMyApprovedChanges] = useState<MyApprovedChange[]>([]);
  const [rejectedChanges, setRejectedChanges] = useState<RejectedChange[]>([]);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const isInternal = user?.role === 'internal' || user?.role === 'admin';
  const isSupplier = user?.role === 'supplier';

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAll = async () => {
    setIsLoading(true);
    try {
      const [stats, recentResult] = await Promise.all([
        statsApi.getDashboardStats(),
        // Events collapse by PO/type so 25 rarely fills the feed. Ask for
        // a much bigger first page so the box looks populated on load.
        statsApi.getRecentActivity(100),
      ]);
      setDashboardStats(stats);
      setRecentActivity(recentResult?.events || []);
      setHasMoreActivity(recentResult?.has_more || false);

      const approvalsResult = isInternal
        ? await approvalsApi.getPendingApprovals()
        : { pending_approvals: [] };
      setPendingApprovals(approvalsResult.pending_approvals || []);

      // Supplier-only: fetch their own date-change submissions.
      if (isSupplier) {
        try {
          const [myP, myA, rej] = await Promise.all([
            approvalsApi.getMyPendingChanges(),
            approvalsApi.getMyApprovedChanges(),
            approvalsApi.getRejectedChanges(),
          ]);
          setMyPendingChanges(myP.pending_changes || []);
          setMyApprovedChanges(myA.approved_changes || []);
          setRejectedChanges(rej.rejected_changes || []);
        } catch { /* silent — non-critical */ }
      }
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelPending = async (id: number) => {
    setCancellingId(id);
    try {
      await approvalsApi.cancelPendingChange(id);
      toast.success('Pending change cancelled');
      const myP = await approvalsApi.getMyPendingChanges();
      setMyPendingChanges(myP.pending_changes || []);
    } catch {
      toast.error('Failed to cancel pending change');
    } finally {
      setCancellingId(null);
    }
  };

  const formatFieldName = (field: string): string =>
    field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  const reloadInbox = async () => {
    try {
      const approvalsResult = isInternal
        ? await approvalsApi.getPendingApprovals()
        : { pending_approvals: [] };
      setPendingApprovals(approvalsResult.pending_approvals || []);
    } catch { /* silent */ }
  };

  const handleStatusClick = (statusFilter?: string) => {
    if (statusFilter) {
      router.push(`/orders?status=${encodeURIComponent(statusFilter)}`);
    } else {
      router.push('/orders');
    }
  };

  const handlePOClick = (po: string, style?: string) => {
    const params = new URLSearchParams({ expandPO: po });
    if (style) params.set('style_code', style);
    router.push(`/orders-v2?${params.toString()}`);
  };

  const stats = dashboardStats;

  if (isLoading) {
    return (
      <AppShell title="Dashboard">
        <div className="flex items-center justify-center h-[calc(100vh-120px)]">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500">Loading…</p>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Dashboard">
      {/* Page title row */}
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Welcome back, {user?.full_name || user?.username}.
          </p>
        </div>
        <div className="text-xs text-gray-400">
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
        </div>
      </div>

      {/* KPI strip — the pipeline, in order, plus what is late.
          It used to count "In Production", "Shipped" and "Delivered" as
          title-case strings that the status engine has never written, so
          every card but Total sat on zero. It now reads the counts the
          engine itself produces, so the two cannot drift apart. */}
      <div className="border-y border-gray-200 mb-10 bg-white">
        <div className="flex items-stretch overflow-x-auto">
          <KPI
            label="POs"
            value={formatNumber(stats?.total_orders || 0)}
            onClick={() => handleStatusClick()}
            border
            wide
          />
          {(stats?.status_order || []).map((st) => (
            <KPI
              key={st}
              label={st}
              value={formatNumber(stats?.by_status?.[st] ?? 0)}
              onClick={() => handleStatusClick(st)}
              muted={(stats?.by_status?.[st] ?? 0) === 0}
              border
            />
          ))}
          <KPI
            label="Late"
            value={formatNumber(stats?.overdue_orders || 0)}
            onClick={() => handleStatusClick()}
            tone={(stats?.overdue_orders || 0) > 0 ? 'red' : undefined}
            muted={(stats?.overdue_orders || 0) === 0}
            wide
          />
        </div>
      </div>

      {/* Supplier-only: my date-change submissions.
          Pending / Approved / Rejected. Rendered above the fold when
          there's something to show. */}
      {isSupplier && (myPendingChanges.length > 0 || myApprovedChanges.length > 0 || rejectedChanges.length > 0) && (
        <section className="mb-10">
          <header className="flex items-baseline justify-between mb-3 pb-2 border-b border-gray-200">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-700">
              My date-change requests
            </h3>
            <span className="text-[10px] text-gray-400">
              Pending {myPendingChanges.length} · Approved {myApprovedChanges.length} · Rejected {rejectedChanges.length}
            </span>
          </header>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <SupplierChangesColumn
              tone="orange"
              Icon={Clock}
              title="Pending"
              count={myPendingChanges.length}
              emptyLabel="No pending changes"
            >
              {myPendingChanges.map(c => (
                <div key={c.id} className="p-2.5 hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium text-gray-900">
                        {c.po_number} <span className="text-[10px] text-gray-400">({c.style_code})</span>
                      </p>
                      <p className="text-[11px] text-gray-500 mt-0.5">{formatFieldName(c.field_name)}</p>
                      <p className="text-[11px] mt-0.5">
                        <span className="text-gray-400">{c.current_value ? formatDate(c.current_value) : 'Not set'}</span>
                        {' → '}
                        <span className="font-medium text-orange-600">{c.proposed_value ? formatDate(c.proposed_value) : 'Not set'}</span>
                      </p>
                    </div>
                    <button
                      onClick={() => handleCancelPending(c.id)}
                      disabled={cancellingId === c.id}
                      className="p-0.5 text-gray-400 hover:text-red-500 rounded"
                      title="Cancel this pending change"
                    >
                      {cancellingId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              ))}
            </SupplierChangesColumn>

            <SupplierChangesColumn
              tone="green"
              Icon={CheckCircle}
              title="Approved"
              count={myApprovedChanges.length}
              emptyLabel="No approved changes yet"
            >
              {myApprovedChanges.slice(0, 10).map(c => (
                <div key={c.id} className="p-2.5 hover:bg-gray-50">
                  <p className="text-[12px] font-medium text-gray-900">
                    {c.po_number} <span className="text-[10px] text-gray-400">({c.style_code})</span>
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{formatFieldName(c.field_name)}</p>
                  <p className="text-[10px] text-green-600 mt-0.5">Approved by {c.approved_by}</p>
                </div>
              ))}
            </SupplierChangesColumn>

            <SupplierChangesColumn
              tone="red"
              Icon={XCircle}
              title="Rejected"
              count={rejectedChanges.length}
              emptyLabel="No rejected changes"
            >
              {rejectedChanges.slice(0, 10).map(c => (
                <div key={c.id} className="p-2.5 hover:bg-gray-50">
                  <p className="text-[12px] font-medium text-gray-900">
                    {c.po_number} <span className="text-[10px] text-gray-400">({c.style_code})</span>
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{formatFieldName(c.field_name)}</p>
                  <p className="text-[10px] text-red-600 mt-0.5 truncate">{c.rejection_reason}</p>
                </div>
              ))}
            </SupplierChangesColumn>
          </div>
        </section>
      )}

      {/* Critical-path board — internal only. Suppliers see their own PO set
          on the factory pages and have no use for a cross-factory board. */}
      {isInternal && (
        <div className="mb-6">
          <CriticalPathBoard onStyleClick={handlePOClick} />
        </div>
      )}

      {/* Inbox + Activity — locked to the same height and scrolling internally,
          so the page below never reflows as the inbox empties or the feed grows. */}
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-7 flex flex-col h-[600px] bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            <InboxAtScale
              pendingApprovals={pendingApprovals}
              onApproved={reloadInbox}
              onPOClick={handlePOClick}
            />
          </div>
        </div>

        <div className="col-span-12 lg:col-span-5 flex flex-col h-[600px] bg-white border border-gray-200 rounded-xl overflow-hidden">
          <header className="flex-none flex items-center gap-2.5 px-3.5 py-2.5 border-b border-gray-100">
            <h3 className="text-[12.5px] font-bold text-gray-900">Activity</h3>
            <span className="flex-1" />
            <span className="text-[11px] text-gray-400">Last 7 days</span>
          </header>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <RecentActivityFeed
              groups={groupBulkActivity(recentActivity)}
              onPOClick={handlePOClick}
              hasMore={hasMoreActivity}
              loadingMore={loadingMoreActivity}
              onLoadMore={async () => {
                setLoadingMoreActivity(true);
                try {
                  const result = await statsApi.getRecentActivity(50, recentActivity.length);
                  setRecentActivity(prev => [...prev, ...result.events]);
                  setHasMoreActivity(result.has_more);
                } catch { /* ignore */ }
                finally { setLoadingMoreActivity(false); }
              }}
            />
          </div>
        </div>
      </div>

    </AppShell>
  );
}

function KPI({ label, value, onClick, border, tone, muted, wide }: {
  label: string;
  value: string | number;
  onClick?: () => void;
  border?: boolean;
  tone?: 'red';
  /** Nothing in this stage — greyed rather than dropped, so the pipeline
   *  keeps its shape and you can see which stages are empty. */
  muted?: boolean;
  wide?: boolean;
}) {
  const labelClass = tone === 'red' ? 'text-red-500' : 'text-gray-400';
  const valueClass = tone === 'red'
    ? 'text-red-600'
    : muted ? 'text-gray-300' : 'text-gray-900';
  return (
    <div
      className={cn(
        'px-4 py-3.5 flex-1 min-w-[112px] hover:bg-gray-50/40 transition-colors',
        wide && 'min-w-[96px] flex-none',
        border && 'border-r border-gray-200',
        onClick && 'cursor-pointer'
      )}
      onClick={onClick}
    >
      <div className={cn('text-[9.5px] font-semibold uppercase tracking-wider truncate', labelClass)}>{label}</div>
      <div className={cn('text-2xl font-bold mt-0.5 tabular-nums', valueClass)}>{value}</div>
    </div>
  );
}

// One column in the supplier's date-change tracker. Kept tiny and
// state-less — the parent owns the data.
function SupplierChangesColumn({
  tone, Icon, title, count, emptyLabel, children,
}: {
  tone: 'orange' | 'green' | 'red';
  Icon: React.ElementType;
  title: string;
  count: number;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  const styles = {
    orange: { header: 'bg-orange-50 border-orange-100 text-orange-800', icon: 'text-orange-600', badge: 'bg-orange-200 text-orange-800' },
    green:  { header: 'bg-green-50 border-green-100 text-green-800',   icon: 'text-green-600',  badge: 'bg-green-200 text-green-800'  },
    red:    { header: 'bg-red-50 border-red-100 text-red-800',         icon: 'text-red-600',    badge: 'bg-red-200 text-red-800'      },
  }[tone];
  return (
    <div className="bg-white rounded-xl ring-1 ring-gray-100 overflow-hidden">
      <div className={cn('px-4 py-2.5 border-b flex items-center gap-2', styles.header)}>
        <Icon className={cn('w-3.5 h-3.5', styles.icon)} />
        <span className="text-[11px] font-medium">{title}</span>
        <span className={cn('ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-semibold', styles.badge)}>{count}</span>
      </div>
      <div className="divide-y divide-gray-50 max-h-56 overflow-y-auto">
        {count === 0
          ? <div className="p-3 text-center text-[11px] text-gray-400">{emptyLabel}</div>
          : children}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthProvider>
      <DashboardContent />
    </AuthProvider>
  );
}
