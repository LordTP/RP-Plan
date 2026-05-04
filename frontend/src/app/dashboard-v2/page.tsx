'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/layout/AuthProvider';
import { useStore } from '@/store/useStore';
import {
  statsApi,
  approvalsApi,
  analyticsApi,
  type RecentActivityEvent,
  type PendingApprovalGroup,
} from '@/lib/api';
import { WarningsCentre } from '@/components/dashboard/WarningsCentre';
import { formatCurrency, formatNumber, cn } from '@/lib/utils';
import type { DashboardStats } from '@/types';
import { InboxAtScale } from '@/components/dashboard/InboxAtScale';
import { RecentActivityFeed, groupBulkActivity } from '@/components/dashboard/RecentActivityFeed';

/**
 * /dashboard-v2 — flatter, scale-friendly dashboard.
 * Sits alongside /dashboard so we can A/B without disruption.
 *
 * Layout:
 *   [ KPI strip — Total / In Production / Shipped / Open Value / Overdue ]
 *   [ Inbox (7/12) ............. Activity (5/12) ]
 */

function DashboardV2Content() {
  const router = useRouter();
  const { user, dashboardStats, setDashboardStats } = useStore();

  const [isLoading, setIsLoading] = useState(true);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApprovalGroup[]>([]);
  const [warnings, setWarnings] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivityEvent[]>([]);
  const [hasMoreActivity, setHasMoreActivity] = useState(false);
  const [loadingMoreActivity, setLoadingMoreActivity] = useState(false);

  const isInternal = user?.role === 'internal' || user?.role === 'admin';

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setIsLoading(true);
    try {
      const [stats, recentResult] = await Promise.all([
        statsApi.getDashboardStats(),
        statsApi.getRecentActivity(25),
      ]);
      setDashboardStats(stats);
      setRecentActivity(recentResult?.events || []);
      setHasMoreActivity(recentResult?.has_more || false);

      const [approvalsResult, warningsResult] = await Promise.all([
        isInternal ? approvalsApi.getPendingApprovals() : Promise.resolve({ pending_approvals: [] }),
        analyticsApi.getDashboardWarnings().catch(() => ({ warnings: [] })),
      ]);
      setPendingApprovals(approvalsResult.pending_approvals || []);
      setWarnings(warningsResult?.warnings || []);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setIsLoading(false);
    }
  };

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
          <p className="text-xs text-gray-400 mt-0.5">v2 preview · /dashboard-v2</p>
        </div>
        <div className="text-xs text-gray-400">
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
        </div>
      </div>

      {/* KPI strip — flat, divided by hairlines, no card chrome */}
      <div className="grid grid-cols-5 border-y border-gray-200 mb-10 bg-white">
        <KPI label="Total"          value={formatNumber(stats?.total_orders || 0)}              onClick={() => handleStatusClick()} border />
        <KPI label="In Production"  value={formatNumber(stats?.orders_in_production || 0)}      onClick={() => handleStatusClick('In Production')} border />
        <KPI label="Shipped"        value={formatNumber(stats?.orders_shipped || 0)}            onClick={() => handleStatusClick('Shipped')} border />
        {isInternal
          ? <KPI label="Open Value" value={formatCurrency(stats?.total_open_value || 0)} border />
          : <KPI label="Delivered"  value={formatNumber(stats?.orders_delivered || 0)}          onClick={() => handleStatusClick('Delivered')} border />
        }
        <KPI label="Overdue"        value={formatNumber(stats?.overdue_orders || 0)}            onClick={() => handleStatusClick('Delayed')} tone="red" />
      </div>

      {/* Inbox + Activity */}
      <div className="grid grid-cols-12 gap-10">
        <div className="col-span-12 lg:col-span-7">
          <InboxAtScale
            pendingApprovals={pendingApprovals}
            onApproved={reloadInbox}
            onPOClick={handlePOClick}
          />
        </div>

        <div className="col-span-12 lg:col-span-5">
          <header className="flex items-baseline justify-between mb-3 pb-2 border-b border-gray-200">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-700">Activity</h3>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              <span className="text-[10px] text-gray-400">Live</span>
            </div>
          </header>
          <RecentActivityFeed
            groups={groupBulkActivity(recentActivity)}
            onPOClick={handlePOClick}
            hasMore={hasMoreActivity}
            loadingMore={loadingMoreActivity}
            onLoadMore={async () => {
              setLoadingMoreActivity(true);
              try {
                const result = await statsApi.getRecentActivity(15, recentActivity.length);
                setRecentActivity(prev => [...prev, ...result.events]);
                setHasMoreActivity(result.has_more);
              } catch { /* ignore */ }
              finally { setLoadingMoreActivity(false); }
            }}
          />
        </div>
      </div>

      {/* Warnings Centre — full-width below the fold */}
      {warnings.length > 0 && (
        <div className="mt-10">
          <header className="flex items-baseline justify-between mb-3 pb-2 border-b border-gray-200">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-700">Warnings</h3>
            <span className="text-xs text-gray-400">
              {warnings.reduce((s, w) => s + (w.count || 0), 0)} flagged across {warnings.length} categories
            </span>
          </header>
          <WarningsCentre warnings={warnings} />
        </div>
      )}
    </AppShell>
  );
}

function KPI({ label, value, onClick, border, tone }: {
  label: string;
  value: string | number;
  onClick?: () => void;
  border?: boolean;
  tone?: 'red';
}) {
  const labelClass = tone === 'red' ? 'text-red-500' : 'text-gray-400';
  const valueClass = tone === 'red' ? 'text-red-600' : 'text-gray-900';
  return (
    <div
      className={cn(
        'px-5 py-3.5 hover:bg-gray-50/40 transition-colors',
        border && 'border-r border-gray-200',
        onClick && 'cursor-pointer'
      )}
      onClick={onClick}
    >
      <div className={cn('text-[10px] font-semibold uppercase tracking-wider', labelClass)}>{label}</div>
      <div className={cn('text-2xl font-bold mt-0.5 tabular-nums', valueClass)}>{value}</div>
    </div>
  );
}

export default function DashboardV2Page() {
  return (
    <AuthProvider>
      <DashboardV2Content />
    </AuthProvider>
  );
}
