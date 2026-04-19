'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Package,
  Factory,
  Truck,
  CheckCircle,
  Clock,
  AlertTriangle,
  TrendingUp,
  Calendar,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  MessageSquare,
  PlusCircle,
  RefreshCw,
  XCircle,
  Check,
  X,
  FileWarning,
  Loader2,
  BarChart3,
  FileSpreadsheet,
  Download,
  Search,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/layout/AuthProvider';
import { CommentSidebar } from '@/components/orders/CommentSidebar';
import { useStore } from '@/store/useStore';
import { statsApi, approvalsApi, analyticsApi, ActivitySummary, MissedActivity, PendingApprovalGroup, RejectedChange, MyPendingChange, MyApprovedChange, RecentActivityEvent } from '@/lib/api';
import { formatCurrency, formatNumber, formatDate, cn, getStatusColor } from '@/lib/utils';
import { formatDistanceToNow, parseISO } from 'date-fns';
import type { DashboardStats, POSummary } from '@/types';

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    return formatDistanceToNow(parseISO(dateStr), { addSuffix: true });
  } catch {
    return '';
  }
}

export default function DashboardPage() {
  return (
    <AuthProvider>
      <DashboardContent />
    </AuthProvider>
  );
}

function DashboardContent() {
  const router = useRouter();
  const { user, dashboardStats, setDashboardStats } = useStore();
  const [isLoading, setIsLoading] = useState(true);
  const [poSummaries, setPOSummaries] = useState<POSummary[]>([]);
  const [activitySummary, setActivitySummary] = useState<ActivitySummary | null>(null);
  const [missedActivity, setMissedActivity] = useState<MissedActivity | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApprovalGroup[]>([]);
  const [rejectedChanges, setRejectedChanges] = useState<RejectedChange[]>([]);
  const [selectedApprovals, setSelectedApprovals] = useState<number[]>([]);
  const [expandedPOs, setExpandedPOs] = useState<string[]>([]);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showBulkRejectModal, setShowBulkRejectModal] = useState(false);
  const [bulkRejectReason, setBulkRejectReason] = useState('');
  const [myPendingChanges, setMyPendingChanges] = useState<MyPendingChange[]>([]);
  const [myApprovedChanges, setMyApprovedChanges] = useState<MyApprovedChange[]>([]);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivityEvent[]>([]);
  const [hasMoreActivity, setHasMoreActivity] = useState(false);
  const [loadingMoreActivity, setLoadingMoreActivity] = useState(false);
  const [warnings, setWarnings] = useState<any[]>([]);

  const isInternal = user?.role === 'internal' || user?.role === 'admin';
  const isDesigner = user?.role === 'sourcelab_designer';
  const isSupplier = user?.role === 'supplier';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const promises: Promise<any>[] = [
        statsApi.getDashboardStats(),
        statsApi.getPOSummary(10),
      ];
      promises.push(statsApi.getActivitySummary());
      promises.push(statsApi.getMissedActivity());
      promises.push(statsApi.getRecentActivity(25));

      const [stats, poSummaryResponse, activity, missed, recentActivityResult] = await Promise.all(promises);
      setDashboardStats(stats);
      setPOSummaries(poSummaryResponse.po_summaries);
      setActivitySummary(activity);
      setMissedActivity(missed);
      setRecentActivity(recentActivityResult?.events || []);
      setHasMoreActivity(recentActivityResult?.has_more || false);

      // Load dashboard warnings
      try {
        const warningsResult = await analyticsApi.getDashboardWarnings();
        setWarnings(warningsResult?.warnings || []);
      } catch { /* warnings optional */ }

      try {
        const [myPendingResult, myApprovedResult, rejectedResult] = await Promise.all([
          approvalsApi.getMyPendingChanges(),
          approvalsApi.getMyApprovedChanges(),
          approvalsApi.getRejectedChanges(),
        ]);
        setMyPendingChanges(myPendingResult.pending_changes);
        setMyApprovedChanges(myApprovedResult.approved_changes);
        setRejectedChanges(rejectedResult.rejected_changes);

        if (user?.role === 'internal' || user?.role === 'admin') {
          const pendingResult = await approvalsApi.getPendingApprovals();
          setPendingApprovals(pendingResult.pending_approvals);
        }
      } catch (e) {
        console.error('Failed to load approval data:', e);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      toast.error('Failed to load dashboard data. Please refresh the page or try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePOClick = (poNumber: string, highlightChanges: boolean = false, highlightSince?: string) => {
    const params = new URLSearchParams();
    params.set('po_number', poNumber);
    if (highlightChanges) params.set('highlight_changes', 'true');
    if (highlightSince) params.set('highlight_since', highlightSince);
    router.push(`/orders?${params.toString()}`);
  };

  const handleStatusClick = (statusFilter?: string) => {
    if (statusFilter) {
      router.push(`/orders?status=${encodeURIComponent(statusFilter)}`);
    } else {
      router.push('/orders');
    }
  };

  const togglePOExpanded = (poNumber: string) => {
    setExpandedPOs(prev =>
      prev.includes(poNumber) ? prev.filter(p => p !== poNumber) : [...prev, poNumber]
    );
  };

  const toggleApprovalSelection = (id: number) => {
    setSelectedApprovals(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleBulkApprove = async () => {
    if (selectedApprovals.length === 0) return;
    setIsProcessing(true);
    try {
      const result = await approvalsApi.bulkApprove(selectedApprovals);
      toast.success(`Approved ${result.approved_count} date change(s)`);
      setSelectedApprovals([]);
      loadData();
    } catch (error: any) {
      toast.error('Failed to approve changes');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkReject = async () => {
    if (selectedApprovals.length === 0) return;
    if (!bulkRejectReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }
    setIsProcessing(true);
    try {
      const result = await approvalsApi.bulkReject(selectedApprovals, bulkRejectReason);
      toast.success(`Rejected ${result.rejected_count} date change(s)`);
      setSelectedApprovals([]);
      setShowBulkRejectModal(false);
      setBulkRejectReason('');
      loadData();
    } catch (error: any) {
      toast.error('Failed to reject changes');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async (id: number) => {
    if (!rejectReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }
    setIsProcessing(true);
    try {
      await approvalsApi.rejectChange(id, rejectReason);
      toast.success('Date change rejected');
      setRejectingId(null);
      setRejectReason('');
      loadData();
    } catch (error: any) {
      toast.error('Failed to reject change');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelPending = async (id: number) => {
    setCancellingId(id);
    try {
      await approvalsApi.cancelPendingChange(id);
      toast.success('Pending change cancelled');
      loadData();
    } catch (error: any) {
      toast.error('Failed to cancel pending change');
    } finally {
      setCancellingId(null);
    }
  };

  const formatFieldName = (field: string): string => {
    return field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  // Strip the time portion from stored datetime strings like "2026-04-13 00:00:00"
  // so date fields render as just "2026-04-13" in the recent activity feed.
  const stripTimeFromDate = (v: string): string => {
    if (!v) return v;
    const m = v.match(/^(\d{4}-\d{2}-\d{2})[T\s]\d{2}:\d{2}(?::\d{2})?/);
    return m ? m[1] : v;
  };

  // Collapse bulk writes (same user hitting "Add to all styles on PO") into one
  // activity row. Events within ~60 seconds of each other that share user +
  // PO + action are merged; the group tracks every affected style.
  type ActivityGroup = RecentActivityEvent & { styles: string[]; count: number };
  const groupBulkActivity = (events: RecentActivityEvent[]): ActivityGroup[] => {
    const groups: ActivityGroup[] = [];
    const WINDOW_MS = 60_000;
    for (const e of events) {
      const eTime = e.created_at ? new Date(e.created_at).getTime() : 0;
      const key = e.type === 'comment'
        ? `comment|${e.username}|${e.po_number}|${e.comment_text || ''}`
        : `change|${e.username}|${e.po_number}|${e.field_name || ''}|${e.old_value || ''}|${e.new_value || ''}`;
      // Find a matching group from the most recent entries (events come newest-first)
      const match = groups.find((g) => {
        const gKey = g.type === 'comment'
          ? `comment|${g.username}|${g.po_number}|${g.comment_text || ''}`
          : `change|${g.username}|${g.po_number}|${g.field_name || ''}|${g.old_value || ''}|${g.new_value || ''}`;
        if (gKey !== key) return false;
        const gTime = g.created_at ? new Date(g.created_at).getTime() : 0;
        return Math.abs(gTime - eTime) <= WINDOW_MS;
      });
      if (match) {
        if (e.style_code && !match.styles.includes(e.style_code)) {
          match.styles.push(e.style_code);
        }
        match.count += 1;
      } else {
        groups.push({
          ...e,
          styles: e.style_code ? [e.style_code] : [],
          count: 1,
        });
      }
    }
    return groups;
  };

  const stats = dashboardStats;

  if (isLoading) {
    return (
      <AppShell title="Dashboard">
        <div className="flex items-center justify-center h-[calc(100vh-120px)]">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500">Loading dashboard...</p>
          </div>
        </div>
      </AppShell>
    );
  }

  const totalPendingApprovals = pendingApprovals.reduce((sum, po) => sum + po.changes.length, 0);

  return (
    <AppShell title="Dashboard">
      {/* Welcome header with inline metrics */}
      <div className="mb-8 flex items-end justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Welcome back, {user?.full_name || user?.username}</h2>
          <p className="text-gray-500 text-sm mt-1">Here&apos;s what&apos;s happening with your orders today.</p>
        </div>
        <div className="flex items-center gap-5">
          <InlineMetric label="Total" value={formatNumber(stats?.total_orders || 0)} onClick={() => handleStatusClick()} />
          <div className="w-px h-8 bg-gray-200" />
          <InlineMetric label="In Production" value={formatNumber(stats?.orders_in_production || 0)} color="text-amber-600" onClick={() => handleStatusClick('In Production')} />
          <InlineMetric label="Shipped" value={formatNumber(stats?.orders_shipped || 0)} color="text-blue-600" onClick={() => handleStatusClick('Shipped')} />
          {isInternal ? (
            <InlineMetric label="Open Value" value={formatCurrency(stats?.total_open_value || 0)} color="text-teal-600" />
          ) : (
            <InlineMetric label="Delivered" value={formatNumber(stats?.orders_delivered || 0)} color="text-green-600" onClick={() => handleStatusClick('Delivered')} />
          )}
          <InlineMetric label="Overdue" value={formatNumber(stats?.overdue_orders || 0)} color="text-red-600" onClick={() => handleStatusClick('Delayed')} />
        </div>
      </div>

      {/* While You Were Away */}
      {missedActivity && missedActivity.since && (missedActivity.new_orders.count > 0 || missedActivity.updated_orders.count > 0 || missedActivity.new_comments.count > 0) && (
        <div className="mb-6 bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] ring-1 ring-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-amber-100 rounded-lg flex items-center justify-center">
                <Clock className="w-3.5 h-3.5 text-amber-500" />
              </div>
              <div>
                <h3 className="text-xs font-semibold text-gray-900">While You Were Away</h3>
                <p className="text-[10px] text-gray-400">
                  {new Date(missedActivity.since).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {' — '}
                  {missedActivity.until && new Date(missedActivity.until).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100">
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <PlusCircle className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-[11px] font-medium text-gray-700">New Orders</span>
                <span className="text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full font-semibold">{missedActivity.new_orders.count}</span>
              </div>
              <div className="space-y-1.5 max-h-28 overflow-y-auto">
                {missedActivity.new_orders.orders.length > 0 ? missedActivity.new_orders.orders.map((order) => (
                  <div key={order.po_number} onClick={() => handlePOClick(order.po_number)} className="px-2 py-1.5 bg-amber-50 rounded-md text-[11px] cursor-pointer hover:bg-amber-100 transition-colors">
                    <span className="font-semibold text-amber-800">{order.po_number}</span>
                    <span className="text-amber-600 ml-1.5">{order.customer}</span>
                  </div>
                )) : <p className="text-[11px] text-gray-300">None</p>}
              </div>
            </div>
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <RefreshCw className="w-3.5 h-3.5 text-orange-500" />
                <span className="text-[11px] font-medium text-gray-700">Updated</span>
                <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-semibold">{missedActivity.updated_orders.count}</span>
              </div>
              <div className="space-y-1.5 max-h-28 overflow-y-auto">
                {missedActivity.updated_orders.orders.length > 0 ? missedActivity.updated_orders.orders.map((order) => (
                  <div key={order.po_number} onClick={() => handlePOClick(order.po_number, true, missedActivity.since!)} className="px-2 py-1.5 bg-orange-50 rounded-md text-[11px] cursor-pointer hover:bg-orange-100 transition-colors">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-orange-800">{order.po_number}</span>
                      <span className="text-orange-500">{order.customer}</span>
                    </div>
                    <p className="text-orange-600 text-[10px] mt-0.5">{order.styles.length} style(s): {order.styles.slice(0, 3).join(', ')}{order.styles.length > 3 ? '...' : ''}</p>
                  </div>
                )) : <p className="text-[11px] text-gray-300">None</p>}
              </div>
            </div>
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="w-3.5 h-3.5 text-yellow-500" />
                <span className="text-[11px] font-medium text-gray-700">Comments</span>
                <span className="text-[10px] bg-yellow-100 text-yellow-600 px-1.5 py-0.5 rounded-full font-semibold">{missedActivity.new_comments.count}</span>
              </div>
              <div className="space-y-1.5 max-h-28 overflow-y-auto">
                {missedActivity.new_comments.comments.length > 0 ? missedActivity.new_comments.comments.map((comment) => (
                  <div key={comment.id} onClick={() => handlePOClick(comment.po_number)} className="px-2 py-1.5 bg-yellow-50 rounded-md text-[11px] cursor-pointer hover:bg-yellow-100 transition-colors">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-yellow-800">{comment.po_number}</span>
                      {comment.style_code && <span className="text-yellow-500 text-[10px]">{comment.style_code}</span>}
                      <span className="text-yellow-500 text-[10px] ml-auto">{comment.username}</span>
                    </div>
                    <p className="text-yellow-600 truncate mt-0.5">{comment.comment_text}</p>
                  </div>
                )) : <p className="text-[11px] text-gray-300">None</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - 2/3 */}
        <div className="lg:col-span-2 space-y-6">
          {/* Pending Approvals (Internal) */}
          {isInternal && !isDesigner && pendingApprovals.length > 0 && (
            <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] ring-1 ring-gray-100">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                    <Clock className="w-4 h-4 text-orange-500" />
                  </div>
                  <h3 className="font-semibold text-gray-900">Pending Approvals</h3>
                  <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-semibold">{totalPendingApprovals}</span>
                </div>
                {selectedApprovals.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleBulkApprove}
                      disabled={isProcessing}
                      className="px-2.5 py-1 text-[11px] font-medium text-white bg-green-500 rounded-md hover:bg-green-600 transition-colors disabled:opacity-50 flex items-center gap-1"
                    >
                      {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      Approve ({selectedApprovals.length})
                    </button>
                    <button
                      onClick={() => setShowBulkRejectModal(true)}
                      disabled={isProcessing}
                      className="px-2.5 py-1 text-[11px] font-medium text-white bg-red-500 rounded-md hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center gap-1"
                    >
                      <X className="w-3 h-3" />
                      Reject ({selectedApprovals.length})
                    </button>
                  </div>
                )}
              </div>
              <div className="divide-y divide-gray-50">
                {pendingApprovals.map((poGroup) => (
                  <div key={poGroup.po_number}>
                    <div
                      onClick={() => togglePOExpanded(poGroup.po_number)}
                      className="flex items-center justify-between px-6 py-3 cursor-pointer hover:bg-gray-50/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {expandedPOs.includes(poGroup.po_number) ? (
                          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        )}
                        <span className="text-sm font-semibold text-gray-900">{poGroup.po_number}</span>
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">{poGroup.customer}</span>
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium hidden sm:inline">{poGroup.factory}</span>
                      </div>
                      <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-medium">{poGroup.changes.length} pending</span>
                    </div>
                    {expandedPOs.includes(poGroup.po_number) && (
                      <div className="divide-y divide-gray-50 bg-gray-50/30">
                        {poGroup.changes.map((change) => (
                          <div key={change.id} className="px-6 py-3.5 hover:bg-gray-50">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3">
                                <input
                                  type="checkbox"
                                  checked={selectedApprovals.includes(change.id)}
                                  onChange={() => toggleApprovalSelection(change.id)}
                                  className="mt-0.5 w-4 h-4 rounded text-primary-600 focus:ring-primary-500"
                                />
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-gray-900">{formatFieldName(change.field_name)}</span>
                                    <span className="text-[10px] text-gray-400">({change.style_code})</span>
                                  </div>
                                  <p className="text-xs text-gray-400 mt-1">
                                    <span className="line-through text-gray-300">{change.current_value ? formatDate(change.current_value) : 'Not set'}</span>
                                    {' → '}
                                    <span className="font-medium text-orange-500">{change.proposed_value ? formatDate(change.proposed_value) : 'Not set'}</span>
                                    <span className="text-gray-300 ml-2">· {change.submitted_by}</span>
                                    {change.submitted_at && <span className="text-gray-300 ml-1">· {timeAgo(change.submitted_at)}</span>}
                                  </p>
                                  {change.reason && (
                                    <p className="text-xs text-gray-500 mt-1 bg-gray-100 px-2 py-1 rounded inline-block">
                                      {change.reason}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-1 flex-shrink-0">
                                {rejectingId === change.id ? (
                                  <div className="flex flex-col gap-1.5">
                                    <input
                                      type="text"
                                      value={rejectReason}
                                      onChange={(e) => setRejectReason(e.target.value)}
                                      placeholder="Rejection reason..."
                                      className="px-2 py-1 text-[11px] border rounded-md w-44 focus:outline-none focus:ring-1 focus:ring-red-500"
                                      autoFocus
                                    />
                                    <div className="flex gap-1">
                                      <button onClick={() => handleReject(change.id)} disabled={isProcessing} className="px-2 py-0.5 text-[11px] bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50">Confirm</button>
                                      <button onClick={() => { setRejectingId(null); setRejectReason(''); }} className="px-2 py-0.5 text-[11px] bg-gray-200 text-gray-600 rounded-md hover:bg-gray-300">Cancel</button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <button
                                      onClick={async () => {
                                        setIsProcessing(true);
                                        try {
                                          await approvalsApi.approveChange(change.id);
                                          toast.success('Date change approved');
                                          loadData();
                                        } catch (e) {
                                          toast.error('Failed to approve');
                                        } finally {
                                          setIsProcessing(false);
                                        }
                                      }}
                                      disabled={isProcessing}
                                      className="w-8 h-8 rounded-lg bg-green-50 text-green-500 flex items-center justify-center hover:bg-green-100 transition-colors disabled:opacity-50"
                                    >
                                      <Check className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => setRejectingId(change.id)}
                                      disabled={isProcessing}
                                      className="w-8 h-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 transition-colors disabled:opacity-50"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Supplier Date Change Dashboard */}
          {isSupplier && (myPendingChanges.length > 0 || myApprovedChanges.length > 0 || rejectedChanges.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] ring-1 ring-gray-100 overflow-hidden">
                <div className="px-4 py-2.5 bg-orange-50 border-b border-orange-100 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-orange-600" />
                  <span className="text-[11px] font-medium text-orange-800">Pending</span>
                  <span className="ml-auto text-[10px] bg-orange-200 text-orange-800 px-1.5 py-0.5 rounded-full font-semibold">{myPendingChanges.length}</span>
                </div>
                <div className="divide-y divide-gray-50 max-h-56 overflow-y-auto">
                  {myPendingChanges.length === 0 ? (
                    <div className="p-3 text-center text-[11px] text-gray-400">No pending changes</div>
                  ) : myPendingChanges.map((change) => (
                    <div key={change.id} className="p-2.5 hover:bg-gray-50">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[12px] font-medium text-gray-900">{change.po_number} <span className="text-[10px] text-gray-400">({change.style_code})</span></p>
                          <p className="text-[11px] text-gray-500 mt-0.5">{formatFieldName(change.field_name)}</p>
                          <p className="text-[11px] mt-0.5">
                            <span className="text-gray-400">{change.current_value ? formatDate(change.current_value) : 'Not set'}</span>
                            {' → '}
                            <span className="font-medium text-orange-600">{change.proposed_value ? formatDate(change.proposed_value) : 'Not set'}</span>
                          </p>
                        </div>
                        <button onClick={() => handleCancelPending(change.id)} disabled={cancellingId === change.id} className="p-0.5 text-gray-400 hover:text-red-500 rounded transition-colors">
                          {cancellingId === change.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] ring-1 ring-gray-100 overflow-hidden">
                <div className="px-4 py-2.5 bg-green-50 border-b border-green-100 flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                  <span className="text-[11px] font-medium text-green-800">Approved</span>
                  <span className="ml-auto text-[10px] bg-green-200 text-green-800 px-1.5 py-0.5 rounded-full font-semibold">{myApprovedChanges.length}</span>
                </div>
                <div className="divide-y divide-gray-50 max-h-56 overflow-y-auto">
                  {myApprovedChanges.length === 0 ? (
                    <div className="p-3 text-center text-[11px] text-gray-400">No approved changes yet</div>
                  ) : myApprovedChanges.slice(0, 10).map((change) => (
                    <div key={change.id} className="p-2.5 hover:bg-gray-50">
                      <p className="text-[12px] font-medium text-gray-900">{change.po_number} <span className="text-[10px] text-gray-400">({change.style_code})</span></p>
                      <p className="text-[11px] text-gray-500 mt-0.5">{formatFieldName(change.field_name)}</p>
                      <p className="text-[10px] text-green-600 mt-0.5">Approved by {change.approved_by}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] ring-1 ring-gray-100 overflow-hidden">
                <div className="px-4 py-2.5 bg-red-50 border-b border-red-100 flex items-center gap-2">
                  <XCircle className="w-3.5 h-3.5 text-red-600" />
                  <span className="text-[11px] font-medium text-red-800">Rejected</span>
                  <span className="ml-auto text-[10px] bg-red-200 text-red-800 px-1.5 py-0.5 rounded-full font-semibold">{rejectedChanges.length}</span>
                </div>
                <div className="divide-y divide-gray-50 max-h-56 overflow-y-auto">
                  {rejectedChanges.length === 0 ? (
                    <div className="p-3 text-center text-[11px] text-gray-400">No rejected changes</div>
                  ) : rejectedChanges.slice(0, 10).map((change) => (
                    <div key={change.id} className="p-2.5 hover:bg-gray-50">
                      <p className="text-[12px] font-medium text-gray-900">{change.po_number} <span className="text-[10px] text-gray-400">({change.style_code})</span></p>
                      <p className="text-[11px] text-gray-500 mt-0.5">{formatFieldName(change.field_name)}</p>
                      <p className="text-[10px] text-red-600 mt-0.5 truncate">{change.rejection_reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Activity This Session */}
          {activitySummary && (activitySummary.new_orders.count > 0 || activitySummary.updated_orders.count > 0 || activitySummary.new_comments.count > 0) && (
            <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] ring-1 ring-gray-100 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center">
                    <RefreshCw className="w-3.5 h-3.5 text-blue-500" />
                  </div>
                  <h3 className="text-xs font-semibold text-gray-900">Changes This Session</h3>
                </div>
                <span className="text-[10px] text-gray-400">
                  Since {new Date(activitySummary.since).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100">
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <PlusCircle className="w-3.5 h-3.5 text-green-500" />
                    <span className="text-[11px] font-medium text-gray-700">New Orders</span>
                    <span className="text-[10px] bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full font-semibold">{activitySummary.new_orders.count}</span>
                  </div>
                  <div className="space-y-1.5 max-h-28 overflow-y-auto">
                    {activitySummary.new_orders.orders.length > 0 ? activitySummary.new_orders.orders.map((order) => (
                      <div key={order.po_number} onClick={() => handlePOClick(order.po_number)} className="px-2 py-1.5 bg-green-50 rounded-md text-[11px] cursor-pointer hover:bg-green-100 transition-colors">
                        <span className="font-semibold text-green-800">{order.po_number}</span>
                        <span className="text-green-600 ml-1.5">{order.customer}</span>
                      </div>
                    )) : <p className="text-[11px] text-gray-300">None</p>}
                  </div>
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <RefreshCw className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-[11px] font-medium text-gray-700">Updated</span>
                    <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-semibold">{activitySummary.updated_orders.count}</span>
                  </div>
                  <div className="space-y-1.5 max-h-28 overflow-y-auto">
                    {activitySummary.updated_orders.orders.length > 0 ? activitySummary.updated_orders.orders.map((order) => (
                      <div key={order.po_number} onClick={() => handlePOClick(order.po_number, true)} className="px-2 py-1.5 bg-blue-50 rounded-md text-[11px] cursor-pointer hover:bg-blue-100 transition-colors">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-blue-800">{order.po_number}</span>
                          <span className="text-blue-500">{order.customer}</span>
                        </div>
                        <p className="text-blue-600 text-[10px] mt-0.5">{order.styles.length} style(s): {order.styles.slice(0, 3).join(', ')}{order.styles.length > 3 ? '...' : ''}</p>
                      </div>
                    )) : <p className="text-[11px] text-gray-300">None</p>}
                  </div>
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="w-3.5 h-3.5 text-purple-500" />
                    <span className="text-[11px] font-medium text-gray-700">Comments</span>
                    <span className="text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full font-semibold">{activitySummary.new_comments.count}</span>
                  </div>
                  <div className="space-y-1.5 max-h-28 overflow-y-auto">
                    {activitySummary.new_comments.comments.length > 0 ? activitySummary.new_comments.comments.map((comment) => (
                      <div key={comment.id} onClick={() => handlePOClick(comment.po_number)} className="px-2 py-1.5 bg-purple-50 rounded-md text-[11px] cursor-pointer hover:bg-purple-100 transition-colors">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-purple-800">{comment.po_number}</span>
                          {comment.style_code && <span className="text-purple-400 text-[10px]">{comment.style_code}</span>}
                          <span className="text-purple-400 text-[10px] ml-auto">{comment.username}</span>
                        </div>
                        <p className="text-purple-600 truncate mt-0.5">{comment.comment_text}</p>
                      </div>
                    )) : <p className="text-[11px] text-gray-300">None</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Warnings Centre */}
          {warnings.length > 0 && <WarningsCentre warnings={warnings} />}

        </div>

        {/* Right Column - 1/3 */}
        <div className="space-y-6">
          {/* Order Status Breakdown */}
          <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] ring-1 ring-gray-100">
            <div className="px-4 py-3.5 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Order Breakdown</h3>
            </div>
            <div className="p-4 space-y-2.5">
              {[
                { label: 'In Production', value: stats?.orders_in_production || 0, color: 'bg-amber-400', onClick: () => handleStatusClick('In Production') },
                { label: 'Shipped', value: stats?.orders_shipped || 0, color: 'bg-blue-400', onClick: () => handleStatusClick('Shipped') },
                { label: 'Delivered', value: stats?.orders_delivered || 0, color: 'bg-green-400', onClick: () => handleStatusClick('Delivered') },
                { label: 'Pending', value: stats?.orders_pending_approval || 0, color: 'bg-orange-400', onClick: () => handleStatusClick('Pending') },
                { label: 'Cancelled', value: stats?.orders_cancelled || 0, color: 'bg-gray-400', onClick: () => handleStatusClick('Cancelled') },
              ].map((item) => {
                const total = stats?.total_orders || 1;
                const pct = Math.round((item.value / total) * 100);
                return (
                  <div key={item.label} onClick={item.onClick} className="cursor-pointer group">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[11px] text-gray-500 group-hover:text-gray-700 transition-colors">{item.label}</span>
                      <span className="text-[11px] font-semibold text-gray-700">{item.value}</span>
                    </div>
                    <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className={cn('h-full rounded-full transition-all', item.color)} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            {isInternal && (
              <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/40 flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">This Month</p>
                  <p className="text-[10px] text-gray-400">new orders</p>
                </div>
                <p className="text-xl font-bold text-gray-900 tabular-nums">{formatNumber(stats?.orders_this_month || 0)}</p>
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="text-sm font-semibold text-gray-900">Recent Activity</h3>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                <span className="text-[10px] text-gray-400">Live</span>
              </div>
            </div>
            <div className="space-y-1 max-h-[490px] overflow-y-auto px-1">
              {recentActivity.length === 0 ? (
                <div className="py-6 text-center text-[11px] text-gray-400">No recent activity</div>
              ) : groupBulkActivity(recentActivity).map((event, idx) => {
                const isComment = event.type === 'comment';
                const isSupplierSource = event.source === 'Supplier';
                const bgColor = isComment
                  ? (isSupplierSource ? 'bg-orange-50' : 'bg-purple-50')
                  : (isSupplierSource ? 'bg-orange-50' : 'bg-blue-50');
                const initialsColor = isComment
                  ? (isSupplierSource ? 'text-orange-500' : 'text-purple-500')
                  : (isSupplierSource ? 'text-orange-500' : 'text-blue-500');
                const isBulk = event.count > 1;
                const styleLabel = isBulk
                  ? `${event.styles.length} styles`
                  : (event.style_code || '');

                return (
                  <div
                    key={`${event.type}-${idx}`}
                    onClick={() => handlePOClick(event.po_number)}
                    className="flex gap-2.5 cursor-pointer rounded-lg px-2 py-2 hover:bg-gray-50 transition-colors -mx-1"
                  >
                    <div className={cn('w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0', bgColor)}>
                      <span className={cn('text-[9px] font-bold', initialsColor)}>{event.user_initials}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-gray-900">{event.username}</span>
                        <span className="text-[10px] text-gray-300">·</span>
                        <span className="text-[10px] text-gray-400">{event.po_number}</span>
                        {styleLabel && (
                          isBulk ? (
                            <BulkStylesPill count={event.styles.length} styles={event.styles} />
                          ) : (
                            <span className="text-[10px] text-gray-300">{styleLabel}</span>
                          )
                        )}
                        <span className="text-[10px] text-gray-300 ml-auto">{event.created_at ? timeAgo(event.created_at) : ''}</span>
                      </div>
                      {isComment ? (
                        <p className="text-[11px] text-gray-600 truncate mt-0.5">
                          <span className="text-purple-500 font-medium">Commented: </span>
                          {event.comment_text || 'Added a comment'}
                        </p>
                      ) : (
                        <p className="text-[11px] text-gray-600 mt-0.5">
                          <span className="text-blue-500 font-medium">{formatFieldName(event.field_name || '')}: </span>
                          {event.old_value && <span className="text-gray-400 line-through">{stripTimeFromDate(event.old_value)}</span>}
                          {event.old_value && event.new_value && <span className="text-gray-300"> → </span>}
                          {event.new_value && <span className="font-medium text-gray-700">{stripTimeFromDate(event.new_value)}</span>}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
              {hasMoreActivity && (
                <button
                  onClick={async () => {
                    setLoadingMoreActivity(true);
                    try {
                      const result = await statsApi.getRecentActivity(15, recentActivity.length);
                      setRecentActivity(prev => [...prev, ...result.events]);
                      setHasMoreActivity(result.has_more);
                    } catch { /* ignore */ }
                    finally { setLoadingMoreActivity(false); }
                  }}
                  disabled={loadingMoreActivity}
                  className="w-full py-2 text-xs text-gray-400 font-medium hover:text-gray-600 transition-colors text-center mt-1"
                >
                  {loadingMoreActivity ? 'Loading...' : 'Load more'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bulk Reject Modal */}
      {showBulkRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setShowBulkRejectModal(false); setBulkRejectReason(''); }} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Reject {selectedApprovals.length} Date Change{selectedApprovals.length > 1 ? 's' : ''}</h3>
              <button onClick={() => { setShowBulkRejectModal(false); setBulkRejectReason(''); }} className="p-1 text-gray-400 hover:text-gray-600 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Rejection Reason <span className="text-red-500">*</span></label>
              <textarea
                value={bulkRejectReason}
                onChange={(e) => setBulkRejectReason(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm resize-none"
                placeholder="Enter reason for rejection..."
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowBulkRejectModal(false); setBulkRejectReason(''); }} disabled={isProcessing} className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">Cancel</button>
              <button
                onClick={handleBulkReject}
                disabled={isProcessing || !bulkRejectReason.trim()}
                className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {isProcessing ? <><Loader2 className="w-4 h-4 animate-spin" />Rejecting...</> : <><X className="w-4 h-4" />Reject</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <CommentSidebar />
    </AppShell>
  );
}

const WARNING_SEVERITY_STYLES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  red: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
  blue: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500' },
};

function InlineMetric({ label, value, color, onClick }: { label: string; value: string | number; color?: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'text-left',
        onClick && 'cursor-pointer hover:opacity-70 transition-opacity'
      )}
    >
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className={cn('text-xl font-bold tabular-nums mt-0.5', color || 'text-gray-900')}>{value}</p>
    </button>
  );
}

function WarningsCentre({ warnings }: { warnings: any[] }) {
  const [selected, setSelected] = useState<string>(warnings[0]?.key || '');
  const [search, setSearch] = useState('');

  // Apply search filter — recompute filtered warnings + counts
  const filteredWarnings = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return warnings;
    return warnings.map(w => {
      const items = w.items.filter((item: any) =>
        (item.po_number || '').toLowerCase().includes(q) ||
        (item.style_code || '').toLowerCase().includes(q) ||
        (item.customer || '').toLowerCase().includes(q) ||
        (item.factory || '').toLowerCase().includes(q) ||
        (item.component || '').toLowerCase().includes(q)
      );
      return { ...w, items, count: items.length };
    }).filter(w => w.count > 0);
  }, [warnings, search]);

  const selectedWarning = filteredWarnings.find(w => w.key === selected) || filteredWarnings[0];

  // If current selection is filtered out by search, switch to first available
  useEffect(() => {
    if (filteredWarnings.length > 0 && !filteredWarnings.find(w => w.key === selected)) {
      setSelected(filteredWarnings[0].key);
    }
  }, [filteredWarnings, selected]);
  const totalCount = filteredWarnings.reduce((s, w) => s + w.count, 0);

  const redWarnings = filteredWarnings.filter(w => w.severity === 'red');
  const amberWarnings = filteredWarnings.filter(w => w.severity === 'amber');
  const blueWarnings = filteredWarnings.filter(w => w.severity === 'blue');

  const renderTab = (w: any) => {
    const style = WARNING_SEVERITY_STYLES[w.severity] || WARNING_SEVERITY_STYLES.amber;
    const isActive = selected === w.key;
    return (
      <button
        key={w.key}
        onClick={() => setSelected(w.key)}
        className={cn(
          'w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors rounded-lg',
          isActive ? `${style.bg} ${style.text}` : 'text-gray-700 hover:bg-gray-100/80'
        )}
      >
        <AlertTriangle className={cn('w-3.5 h-3.5 flex-shrink-0', isActive ? style.text : 'text-gray-400')} />
        <span className="flex-1 text-xs font-medium truncate">{w.title}</span>
        <span className={cn(
          'text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 min-w-[20px] text-center',
          isActive ? 'bg-white/60' : `${style.bg} ${style.text}`
        )}>
          {w.count}
        </span>
      </button>
    );
  };

  if (!selectedWarning) {
    // No results with current search
    if (search) {
      return (
        <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] ring-1 ring-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Warnings Centre</h3>
                <p className="text-xs text-gray-500">No matches for &quot;{search}&quot;</p>
              </div>
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search PO, style, factory..."
                className="pl-9 pr-8 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white focus:border-transparent transition-all w-64"
              />
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 rounded">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="py-16 text-center text-sm text-gray-400">
            <Search className="w-8 h-8 mx-auto mb-3 text-gray-300" />
            No warnings match your search
          </div>
        </div>
      );
    }
    return null;
  }
  const selStyle = WARNING_SEVERITY_STYLES[selectedWarning.severity] || WARNING_SEVERITY_STYLES.amber;

  return (
    <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] ring-1 ring-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-gray-900">Warnings Centre</h3>
            <p className="text-xs text-gray-500 truncate">
              {search ? `${totalCount} match${totalCount !== 1 ? 'es' : ''} for "${search}"` : `${totalCount} items across ${filteredWarnings.length} categories need attention`}
            </p>
          </div>
        </div>
        <div className="relative flex-shrink-0">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search PO, style, factory..."
            className="pl-9 pr-8 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white focus:border-transparent transition-all w-64"
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

      <div className="grid grid-cols-[320px_1fr] h-[440px]">
        {/* Left: tabs grouped by severity */}
        <div className="border-r border-gray-100 bg-gray-50/60 p-3 space-y-4 overflow-y-auto">
          {redWarnings.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider mb-1.5 px-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Urgent
              </p>
              <div className="space-y-0.5">{redWarnings.map(renderTab)}</div>
            </div>
          )}
          {amberWarnings.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider mb-1.5 px-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Needs Attention
              </p>
              <div className="space-y-0.5">{amberWarnings.map(renderTab)}</div>
            </div>
          )}
          {blueWarnings.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider mb-1.5 px-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Reminder
              </p>
              <div className="space-y-0.5">{blueWarnings.map(renderTab)}</div>
            </div>
          )}
        </div>

        {/* Right: detail */}
        <div className="p-5 overflow-y-auto">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
            <div>
              <h4 className="text-sm font-bold text-gray-900">{selectedWarning.title}</h4>
              <p className="text-xs text-gray-500 mt-0.5">{selectedWarning.description}</p>
            </div>
            <span className={cn('text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 ml-4', selStyle.bg, selStyle.text)}>
              {selectedWarning.count} flagged
            </span>
          </div>
          <div className="space-y-1">
            {selectedWarning.items.map((item: any, i: number) => (
              <Link
                key={i}
                href={
                  item.order_id
                    ? `/design?openStyle=${item.order_id}`
                    : `/design?expandPO=${encodeURIComponent(item.po_number)}`
                }
                className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 rounded-lg transition-colors group"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', selStyle.dot)} />
                  <span className="text-sm font-bold text-gray-900 flex-shrink-0">{item.po_number}</span>
                  {item.style_code && <span className="text-xs text-gray-500 flex-shrink-0">{item.style_code}</span>}
                  {item.component && <span className="text-[10px] bg-violet-50 text-violet-600 px-1.5 py-0.5 rounded font-semibold flex-shrink-0">{item.component}</span>}
                  <span className="text-xs text-gray-400 truncate">{item.customer} · {item.factory}</span>
                  {item.style_count > 1 && !item.style_code && <span className="text-[10px] text-gray-400 flex-shrink-0">{item.style_count} styles</span>}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {item.days_since != null && (
                    <span className={cn(
                      'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                      item.days_since >= 7 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    )}>
                      {item.days_since}d
                    </span>
                  )}
                  <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


function BulkStylesPill({ count, styles }: { count: number; styles: string[] }) {
  const [show, setShow] = useState(false);
  return (
    <span
      className="relative"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-[10px] font-semibold text-primary-700 bg-primary-50 ring-1 ring-primary-100 rounded px-1.5 py-0.5 cursor-default">
        {count} styles
      </span>
      {show && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 bg-white text-gray-800 rounded-lg shadow-lg ring-1 ring-gray-200 py-2 px-3 z-50 min-w-[180px]">
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[5px] border-b-white" />
          <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Styles</p>
          <div className="space-y-0.5 max-h-48 overflow-y-auto">
            {styles.map((s, i) => (
              <div key={i} className="text-[11px] font-medium text-gray-700 whitespace-nowrap">{s}</div>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}
