'use client';

import { useEffect, useState } from 'react';
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
} from 'lucide-react';
import toast from 'react-hot-toast';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/layout/AuthProvider';
import { CommentSidebar } from '@/components/orders/CommentSidebar';
import { useStore } from '@/store/useStore';
import { statsApi, approvalsApi, ActivitySummary, MissedActivity, PendingApprovalGroup, RejectedChange, MyPendingChange, MyApprovedChange, RecentActivityEvent } from '@/lib/api';
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
      promises.push(statsApi.getRecentActivity(10));

      const [stats, poSummaryResponse, activity, missed, recentActivityResult] = await Promise.all(promises);
      setDashboardStats(stats);
      setPOSummaries(poSummaryResponse.po_summaries);
      setActivitySummary(activity);
      setMissedActivity(missed);
      setRecentActivity(recentActivityResult?.events || []);

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
      {/* Dark Hero Banner with Stats */}
      <div className="bg-gradient-to-r from-gray-900 via-gray-900 to-gray-800 rounded-2xl p-8 mb-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-teal-500/5 rounded-full blur-3xl translate-y-1/2" />

        <div className="relative z-10">
          <div className="flex items-end justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold text-white">Welcome back, {user?.username}</h2>
              <p className="text-gray-400 text-sm mt-1">Here&apos;s what&apos;s happening with your orders today.</p>
            </div>
            <Link
              href="/orders"
              className="px-4 py-2 text-sm font-medium text-white bg-white/10 border border-white/10 rounded-lg hover:bg-white/20 backdrop-blur-sm transition-colors flex items-center gap-2"
            >
              Export Report
              <Download className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div
              onClick={() => handleStatusClick()}
              className="bg-white/[0.06] backdrop-blur-sm border border-white/[0.06] rounded-xl px-4 py-3 cursor-pointer hover:bg-white/[0.1] transition-colors"
            >
              <p className="text-gray-400 text-xs font-medium">Total Orders</p>
              <p className="text-2xl font-bold text-white mt-1">{formatNumber(stats?.total_orders || 0)}</p>
            </div>
            <div
              onClick={() => handleStatusClick('In Production')}
              className="bg-white/[0.06] backdrop-blur-sm border border-white/[0.06] rounded-xl px-4 py-3 cursor-pointer hover:bg-white/[0.1] transition-colors"
            >
              <p className="text-gray-400 text-xs font-medium">In Production</p>
              <p className="text-2xl font-bold text-amber-400 mt-1">{formatNumber(stats?.orders_in_production || 0)}</p>
            </div>
            <div
              onClick={() => handleStatusClick('Shipped')}
              className="bg-white/[0.06] backdrop-blur-sm border border-white/[0.06] rounded-xl px-4 py-3 cursor-pointer hover:bg-white/[0.1] transition-colors"
            >
              <p className="text-gray-400 text-xs font-medium">Shipped</p>
              <p className="text-2xl font-bold text-blue-400 mt-1">{formatNumber(stats?.orders_shipped || 0)}</p>
            </div>
            {isInternal && (
              <div className="bg-white/[0.06] backdrop-blur-sm border border-white/[0.06] rounded-xl px-4 py-3">
                <p className="text-gray-400 text-xs font-medium">Open Value</p>
                <p className="text-2xl font-bold text-teal-400 mt-1">{formatCurrency(stats?.total_open_value || 0)}</p>
              </div>
            )}
            {!isInternal && (
              <div
                onClick={() => handleStatusClick('Delivered')}
                className="bg-white/[0.06] backdrop-blur-sm border border-white/[0.06] rounded-xl px-4 py-3 cursor-pointer hover:bg-white/[0.1] transition-colors"
              >
                <p className="text-gray-400 text-xs font-medium">Delivered</p>
                <p className="text-2xl font-bold text-green-400 mt-1">{formatNumber(stats?.orders_delivered || 0)}</p>
              </div>
            )}
            <div
              onClick={() => handleStatusClick('Delayed')}
              className="bg-red-500/10 backdrop-blur-sm border border-red-500/20 rounded-xl px-4 py-3 cursor-pointer hover:bg-red-500/15 transition-colors"
            >
              <p className="text-red-300 text-xs font-medium">Overdue</p>
              <p className="text-2xl font-bold text-red-400 mt-1">{formatNumber(stats?.overdue_orders || 0)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* While You Were Away */}
      {missedActivity && missedActivity.since && (missedActivity.new_orders.count > 0 || missedActivity.updated_orders.count > 0 || missedActivity.new_comments.count > 0) && (
        <div className="mb-6 bg-white rounded-xl border border-gray-200/60 shadow-sm overflow-hidden">
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
            <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm">
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
              <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm overflow-hidden">
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
              <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm overflow-hidden">
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
              <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm overflow-hidden">
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
            <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm overflow-hidden">
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

          {/* Active Purchase Orders */}
          <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Active Purchase Orders</h3>
              <Link href="/orders" className="text-sm text-primary-500 font-medium hover:text-primary-700 flex items-center gap-1">
                View all <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y divide-gray-100">
              {poSummaries.length === 0 ? (
                <div className="px-5 py-8 text-center text-gray-400 text-[11px]">No purchase orders found</div>
              ) : poSummaries.map((po) => (
                <div
                  key={po.po_number}
                  onClick={() => handlePOClick(po.po_number)}
                  className="px-5 py-2.5 hover:bg-gray-50/80 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-semibold text-gray-900 group-hover:text-primary-600 transition-colors">{po.po_number}</span>
                      {po.status && (
                        <span className={cn('inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full', getStatusColor(po.status))}>
                          <span className="w-1 h-1 rounded-full bg-current opacity-60" />
                          {po.status}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2.5">
                      {isInternal && (
                        <span className="text-[12px] font-semibold text-gray-900 font-mono">{formatCurrency(po.total_value)}</span>
                      )}
                      <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-400 transition-colors" />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-gray-400">
                    <span>{po.customer}</span>
                    <span className="text-gray-200">|</span>
                    <span>{po.factory}</span>
                    <span className="text-gray-200">|</span>
                    <span>{formatNumber(po.total_qty)} units</span>
                    {po.earliest_ex_factory && (
                      <>
                        <span className="text-gray-200">|</span>
                        <span>Ex-fty {formatDate(po.earliest_ex_factory)}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column - 1/3 */}
        <div className="space-y-6">
          {/* Quick Actions - hidden for suppliers */}
          {!isSupplier && (
          <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2">
              <Link href="/orders" className="flex flex-col items-center gap-2 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors group">
                <Package className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
                <span className="text-[11px] text-gray-500 font-medium">Orders</span>
              </Link>
              <Link href="/import" className="flex flex-col items-center gap-2 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors group">
                <FileSpreadsheet className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
                <span className="text-[11px] text-gray-500 font-medium">Import</span>
              </Link>
              <Link href="/analytics" className="flex flex-col items-center gap-2 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors group">
                <BarChart3 className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
                <span className="text-[11px] text-gray-500 font-medium">Analytics</span>
              </Link>
              <Link href="/settings" className="flex flex-col items-center gap-2 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors group">
                <TrendingUp className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
                <span className="text-[11px] text-gray-500 font-medium">Reports</span>
              </Link>
            </div>
          </div>
          )}

          {/* Recent Activity */}
          <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Recent Activity</h3>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                <span className="text-[10px] text-gray-400">Live</span>
              </div>
            </div>
            <div className="p-4 space-y-3.5 max-h-72 overflow-y-auto">
              {recentActivity.length === 0 ? (
                <div className="py-6 text-center text-[11px] text-gray-400">No recent activity</div>
              ) : recentActivity.map((event, idx) => {
                const isComment = event.type === 'comment';
                const isSupplier = event.source === 'Supplier';
                const bgColor = isComment
                  ? (isSupplier ? 'bg-orange-50' : 'bg-purple-50')
                  : (isSupplier ? 'bg-orange-50' : 'bg-blue-50');
                const textColor = isComment
                  ? (isSupplier ? 'text-orange-500' : 'text-purple-500')
                  : (isSupplier ? 'text-orange-500' : 'text-blue-500');
                const initialsColor = isComment
                  ? (isSupplier ? 'text-orange-500' : 'text-purple-500')
                  : (isSupplier ? 'text-orange-500' : 'text-blue-500');

                return (
                  <div key={`${event.type}-${idx}`} className="flex gap-3 cursor-pointer" onClick={() => handlePOClick(event.po_number)}>
                    <div className="relative">
                      <div className={cn('w-7 h-7 rounded-full flex items-center justify-center', bgColor)}>
                        <span className={cn('text-[9px] font-bold', initialsColor)}>{event.user_initials}</span>
                      </div>
                      {idx < recentActivity.length - 1 && (
                        <div className="absolute left-1/2 top-7 -translate-x-1/2 w-px h-3 bg-gray-100" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      {isComment ? (
                        <p className="text-xs text-gray-600">
                          <span className="font-semibold text-gray-800">{event.username}</span>
                          {' added a comment'}
                        </p>
                      ) : (
                        <p className="text-xs text-gray-600">
                          <span className="font-semibold text-gray-800">{event.username}</span>
                          {' updated '}
                          <span className={cn('font-medium', textColor)}>{formatFieldName(event.field_name || '')}</span>
                        </p>
                      )}
                      <p className="text-[10px] text-gray-300 mt-0.5">
                        PO# {event.po_number}
                        {event.created_at && <span> · {timeAgo(event.created_at)}</span>}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            {recentActivity.length > 0 && (
              <div className="px-4 pb-3">
                <Link href="/orders" className="block w-full py-2 text-xs text-gray-400 font-medium hover:text-gray-600 bg-gray-50 rounded-lg transition-colors text-center">
                  View all activity
                </Link>
              </div>
            )}
          </div>

          {/* Order Status Breakdown */}
          <div className="bg-white rounded-xl border border-gray-200/60 shadow-sm">
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
          </div>

          {/* Additional Stats */}
          {isInternal && (
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-4 text-white">
              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-0.5">This Month</p>
              <p className="text-2xl font-bold">{formatNumber(stats?.orders_this_month || 0)}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">new orders</p>
            </div>
          )}
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
