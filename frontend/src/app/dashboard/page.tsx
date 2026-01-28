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
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Navbar } from '@/components/layout/Navbar';
import { AuthProvider } from '@/components/layout/AuthProvider';
import { CommentSidebar } from '@/components/orders/CommentSidebar';
import { useStore } from '@/store/useStore';
import { statsApi, approvalsApi, ActivitySummary, MissedActivity, PendingApprovalGroup, RejectedChange, MyPendingChange, MyApprovedChange } from '@/lib/api';
import { formatCurrency, formatNumber, formatDate, cn } from '@/lib/utils';
import type { DashboardStats, POSummary } from '@/types';

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
  // Supplier-specific state
  const [myPendingChanges, setMyPendingChanges] = useState<MyPendingChange[]>([]);
  const [myApprovedChanges, setMyApprovedChanges] = useState<MyApprovedChange[]>([]);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const isInternal = user?.role === 'internal' || user?.role === 'admin';
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

      // Load activity summary for all users
      promises.push(statsApi.getActivitySummary());
      promises.push(statsApi.getMissedActivity());

      const [stats, poSummaryResponse, activity, missed] = await Promise.all(promises);

      setDashboardStats(stats);
      setPOSummaries(poSummaryResponse.po_summaries);
      setActivitySummary(activity);
      setMissedActivity(missed);

      // Load approval data based on user role
      try {
        // Supplier-specific data (available to all users)
        const [myPendingResult, myApprovedResult, rejectedResult] = await Promise.all([
          approvalsApi.getMyPendingChanges(),
          approvalsApi.getMyApprovedChanges(),
          approvalsApi.getRejectedChanges(),
        ]);
        setMyPendingChanges(myPendingResult.pending_changes);
        setMyApprovedChanges(myApprovedResult.approved_changes);
        setRejectedChanges(rejectedResult.rejected_changes);

        // Internal-only data (pending approvals for review)
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
    if (highlightChanges) {
      params.set('highlight_changes', 'true');
    }
    if (highlightSince) {
      params.set('highlight_since', highlightSince);
    }
    router.push(`/orders?${params.toString()}`);
  };

  const stats = dashboardStats;

  const handleStatusClick = (statusFilter?: string) => {
    if (statusFilter) {
      router.push(`/orders?status=${encodeURIComponent(statusFilter)}`);
    } else {
      router.push('/orders');
    }
  };

  const togglePOExpanded = (poNumber: string) => {
    setExpandedPOs(prev =>
      prev.includes(poNumber)
        ? prev.filter(p => p !== poNumber)
        : [...prev, poNumber]
    );
  };

  const toggleApprovalSelection = (id: number) => {
    setSelectedApprovals(prev =>
      prev.includes(id)
        ? prev.filter(i => i !== id)
        : [...prev, id]
    );
  };

  const handleBulkApprove = async () => {
    if (selectedApprovals.length === 0) return;
    setIsProcessing(true);
    try {
      const result = await approvalsApi.bulkApprove(selectedApprovals);
      toast.success(`Approved ${result.approved_count} date change(s)`);
      setSelectedApprovals([]);
      loadData(); // Refresh
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
      loadData(); // Refresh
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
      loadData(); // Refresh
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
      loadData(); // Refresh
    } catch (error: any) {
      toast.error('Failed to cancel pending change');
    } finally {
      setCancellingId(null);
    }
  };

  const formatFieldName = (field: string): string => {
    return field
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  };

  const statCards = [
    {
      label: 'Total Orders',
      value: formatNumber(stats?.total_orders || 0),
      icon: Package,
      color: 'bg-primary-100 text-primary-600',
      statusFilter: undefined,
    },
    {
      label: 'In Production',
      value: formatNumber(stats?.orders_in_production || 0),
      icon: Factory,
      color: 'bg-yellow-100 text-yellow-600',
      statusFilter: 'In Production',
    },
    {
      label: 'Shipped',
      value: formatNumber(stats?.orders_shipped || 0),
      icon: Truck,
      color: 'bg-blue-100 text-blue-600',
      statusFilter: 'Shipped',
    },
    {
      label: 'Delivered',
      value: formatNumber(stats?.orders_delivered || 0),
      icon: CheckCircle,
      color: 'bg-green-100 text-green-600',
      statusFilter: 'Delivered',
    },
    {
      label: 'Pending',
      value: formatNumber(stats?.orders_pending_approval || 0),
      icon: Clock,
      color: 'bg-orange-100 text-orange-600',
      statusFilter: 'Pending',
    },
    {
      label: 'Overdue',
      value: formatNumber(stats?.overdue_orders || 0),
      icon: AlertTriangle,
      color: 'bg-red-100 text-red-600',
      statusFilter: 'Delayed',
    },
    {
      label: 'Cancelled',
      value: formatNumber(stats?.orders_cancelled || 0),
      icon: XCircle,
      color: 'bg-gray-200 text-gray-600',
      statusFilter: 'Cancelled',
    },
  ];

  // Only show these to internal users
  const internalStats = (user?.role === 'internal' || user?.role === 'admin') ? [
    {
      label: 'Total Open Value',
      value: formatCurrency(stats?.total_open_value || 0),
      icon: TrendingUp,
      color: 'bg-teal-100 text-teal-600',
    },
    {
      label: 'This Month',
      value: formatNumber(stats?.orders_this_month || 0),
      icon: Calendar,
      color: 'bg-purple-100 text-purple-600',
    },
  ] : [];

  const allStats = [...statCards, ...internalStats];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500">Loading dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {user?.username}
          </h1>
          <p className="text-gray-500 mt-1">
            Here's an overview of your purchase orders
          </p>
        </div>

        {/* Stats Bar */}
        <div className="bg-white border border-gray-200 rounded-xl px-2 py-3 mb-8 flex items-center overflow-x-auto">
          {allStats.map((stat, index) => {
            const Icon = stat.icon;
            const isClickable = 'statusFilter' in stat;
            return (
              <div key={stat.label} className="flex items-center flex-1 min-w-0">
                {index > 0 && <div className="w-px h-8 bg-gray-200 flex-shrink-0" />}
                <div
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors w-full justify-center',
                    isClickable ? 'cursor-pointer hover:bg-gray-50' : ''
                  )}
                  onClick={() => isClickable && handleStatusClick((stat as any).statusFilter)}
                >
                  <div className={cn('w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0', stat.color)}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xs text-gray-500 whitespace-nowrap">{stat.label}</span>
                    <span className="text-sm font-semibold text-gray-900 font-mono">{stat.value}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pending Date Approvals - For Sourcelab users */}
        {isInternal && pendingApprovals.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Pending Date Approvals
                <span className="ml-2 px-2 py-0.5 text-sm bg-orange-100 text-orange-700 rounded-full">
                  {pendingApprovals.reduce((sum, po) => sum + po.changes.length, 0)}
                </span>
              </h2>
              {selectedApprovals.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleBulkApprove}
                    disabled={isProcessing}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Approve Selected ({selectedApprovals.length})
                  </button>
                  <button
                    onClick={() => setShowBulkRejectModal(true)}
                    disabled={isProcessing}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    <X className="w-4 h-4" />
                    Reject Selected ({selectedApprovals.length})
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-3">
              {pendingApprovals.map((poGroup) => (
                <div key={poGroup.po_number} className="card overflow-hidden">
                  {/* PO Header - Clickable */}
                  <div
                    onClick={() => togglePOExpanded(poGroup.po_number)}
                    className="flex items-center justify-between p-4 bg-orange-50 cursor-pointer hover:bg-orange-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {expandedPOs.includes(poGroup.po_number) ? (
                        <ChevronDown className="w-5 h-5 text-orange-600" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-orange-600" />
                      )}
                      <div>
                        <span className="font-semibold text-orange-800">PO# {poGroup.po_number}</span>
                        <span className="ml-3 text-sm text-orange-600">{poGroup.customer}</span>
                        <span className="ml-3 text-sm text-orange-500">{poGroup.factory}</span>
                      </div>
                    </div>
                    <span className="px-2 py-1 bg-orange-200 text-orange-800 rounded text-sm font-medium">
                      {poGroup.changes.length} pending
                    </span>
                  </div>

                  {/* Changes List - Expandable */}
                  {expandedPOs.includes(poGroup.po_number) && (
                    <div className="divide-y divide-gray-100">
                      {poGroup.changes.map((change) => (
                        <div key={change.id} className="p-4 hover:bg-gray-50">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={selectedApprovals.includes(change.id)}
                                onChange={() => toggleApprovalSelection(change.id)}
                                className="mt-1 w-4 h-4 rounded text-green-600 focus:ring-green-500"
                              />
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-gray-900">{formatFieldName(change.field_name)}</span>
                                  <span className="text-xs text-gray-500">({change.style_code})</span>
                                </div>
                                <div className="flex items-center gap-2 mt-1 text-sm">
                                  <span className="text-gray-500">{change.current_value ? formatDate(change.current_value) : 'Not set'}</span>
                                  <ArrowRight className="w-4 h-4 text-gray-400" />
                                  <span className="font-medium text-orange-600">{change.proposed_value ? formatDate(change.proposed_value) : 'Not set'}</span>
                                </div>
                                <div className="mt-2 text-sm text-gray-600 bg-gray-100 p-2 rounded">
                                  <strong>Reason:</strong> {change.reason}
                                </div>
                                <div className="mt-1 text-xs text-gray-400">
                                  Submitted by {change.submitted_by} {change.submitted_at && `on ${new Date(change.submitted_at).toLocaleString('en-GB')}`}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {rejectingId === change.id ? (
                                <div className="flex flex-col gap-2">
                                  <input
                                    type="text"
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                    placeholder="Rejection reason..."
                                    className="px-2 py-1 text-sm border rounded w-48"
                                    autoFocus
                                  />
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => handleReject(change.id)}
                                      disabled={isProcessing}
                                      className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                                    >
                                      Confirm
                                    </button>
                                    <button
                                      onClick={() => { setRejectingId(null); setRejectReason(''); }}
                                      className="px-2 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                                    >
                                      Cancel
                                    </button>
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
                                    className="p-2 text-green-600 hover:bg-green-100 rounded-lg transition-colors disabled:opacity-50"
                                    title="Approve"
                                  >
                                    <Check className="w-5 h-5" />
                                  </button>
                                  <button
                                    onClick={() => setRejectingId(change.id)}
                                    disabled={isProcessing}
                                    className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50"
                                    title="Reject"
                                  >
                                    <X className="w-5 h-5" />
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
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Date Change Requests</h2>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Pending Approval */}
              <div className="card overflow-hidden">
                <div className="p-3 bg-orange-50 border-b border-orange-100">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-orange-600" />
                    <h3 className="font-medium text-orange-800">Pending Approval</h3>
                    <span className="ml-auto px-2 py-0.5 text-xs bg-orange-200 text-orange-800 rounded-full">
                      {myPendingChanges.length}
                    </span>
                  </div>
                </div>
                <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
                  {myPendingChanges.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 text-sm">
                      No pending changes
                    </div>
                  ) : (
                    myPendingChanges.map((change) => (
                      <div key={change.id} className="p-3 hover:bg-gray-50">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900 text-sm">PO# {change.po_number}</span>
                              <span className="text-xs text-gray-500 truncate">({change.style_code})</span>
                            </div>
                            <div className="text-xs text-gray-600 mt-1">{formatFieldName(change.field_name)}</div>
                            <div className="flex items-center gap-1 mt-1 text-xs">
                              <span className="text-gray-400">{change.current_value ? formatDate(change.current_value) : 'Not set'}</span>
                              <ArrowRight className="w-3 h-3 text-gray-400" />
                              <span className="font-medium text-orange-600">{change.proposed_value ? formatDate(change.proposed_value) : 'Not set'}</span>
                            </div>
                            <div className="text-xs text-gray-400 mt-1 truncate" title={change.reason}>
                              {change.reason}
                            </div>
                          </div>
                          <button
                            onClick={() => handleCancelPending(change.id)}
                            disabled={cancellingId === change.id}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                            title="Cancel this request"
                          >
                            {cancellingId === change.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <X className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Recently Approved */}
              <div className="card overflow-hidden">
                <div className="p-3 bg-green-50 border-b border-green-100">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <h3 className="font-medium text-green-800">Recently Approved</h3>
                    <span className="ml-auto px-2 py-0.5 text-xs bg-green-200 text-green-800 rounded-full">
                      {myApprovedChanges.length}
                    </span>
                  </div>
                </div>
                <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
                  {myApprovedChanges.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 text-sm">
                      No approved changes yet
                    </div>
                  ) : (
                    myApprovedChanges.slice(0, 10).map((change) => (
                      <div key={change.id} className="p-3 hover:bg-gray-50">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 text-sm">PO# {change.po_number}</span>
                          <span className="text-xs text-gray-500 truncate">({change.style_code})</span>
                        </div>
                        <div className="text-xs text-gray-600 mt-1">{formatFieldName(change.field_name)}</div>
                        <div className="flex items-center gap-1 mt-1 text-xs">
                          <span className="text-gray-400">{change.current_value ? formatDate(change.current_value) : 'Not set'}</span>
                          <ArrowRight className="w-3 h-3 text-gray-400" />
                          <span className="font-medium text-green-600">{change.proposed_value ? formatDate(change.proposed_value) : 'Not set'}</span>
                        </div>
                        <div className="text-xs text-green-600 mt-1">
                          Approved by {change.approved_by}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Rejected */}
              <div className="card overflow-hidden">
                <div className="p-3 bg-red-50 border-b border-red-100">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-5 h-5 text-red-600" />
                    <h3 className="font-medium text-red-800">Rejected</h3>
                    <span className="ml-auto px-2 py-0.5 text-xs bg-red-200 text-red-800 rounded-full">
                      {rejectedChanges.length}
                    </span>
                  </div>
                </div>
                <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
                  {rejectedChanges.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 text-sm">
                      No rejected changes
                    </div>
                  ) : (
                    rejectedChanges.slice(0, 10).map((change) => (
                      <div key={change.id} className="p-3 hover:bg-gray-50">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 text-sm">PO# {change.po_number}</span>
                          <span className="text-xs text-gray-500 truncate">({change.style_code})</span>
                        </div>
                        <div className="text-xs text-gray-600 mt-1">{formatFieldName(change.field_name)}</div>
                        <div className="flex items-center gap-1 mt-1 text-xs">
                          <span className="text-gray-400">{change.current_value ? formatDate(change.current_value) : 'Not set'}</span>
                          <ArrowRight className="w-3 h-3 text-gray-400" />
                          <span className="line-through text-red-400">{change.proposed_value ? formatDate(change.proposed_value) : 'Not set'}</span>
                        </div>
                        <div className="mt-1 p-1.5 bg-red-100 rounded text-xs text-red-700 truncate" title={change.rejection_reason}>
                          {change.rejection_reason}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          Rejected by {change.rejected_by}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* While You Were Away - Changes between previous login and last login */}
        {missedActivity && missedActivity.since && (missedActivity.new_orders.count > 0 || missedActivity.updated_orders.count > 0 || missedActivity.new_comments.count > 0) && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                While You Were Away
              </h2>
              <span className="text-sm text-gray-500">
                {new Date(missedActivity.since).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
                {' — '}
                {missedActivity.until && new Date(missedActivity.until).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* New Orders */}
              <div className="card p-4 border-l-4 border-l-amber-400">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
                    <PlusCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">New Orders</h3>
                    <p className="text-xs text-gray-500">{missedActivity.new_orders.count} rows in {missedActivity.new_orders.po_count} POs</p>
                  </div>
                </div>
                {missedActivity.new_orders.orders.length > 0 ? (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {missedActivity.new_orders.orders.map((order) => (
                      <div
                        key={order.po_number}
                        onClick={() => handlePOClick(order.po_number)}
                        className="p-2 bg-amber-50 rounded text-xs cursor-pointer hover:bg-amber-100 transition-colors"
                      >
                        <div className="font-medium text-amber-800">PO# {order.po_number}</div>
                        <div className="text-amber-600">{order.customer}</div>
                        <div className="text-amber-500">{order.styles.length} style(s)</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">No new orders</p>
                )}
              </div>

              {/* Updated Orders */}
              <div className="card p-4 border-l-4 border-l-orange-400">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center">
                    <RefreshCw className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">Updated Orders</h3>
                    <p className="text-xs text-gray-500">{missedActivity.updated_orders.count} rows in {missedActivity.updated_orders.po_count} POs</p>
                  </div>
                </div>
                {missedActivity.updated_orders.orders.length > 0 ? (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {missedActivity.updated_orders.orders.map((order) => (
                      <div
                        key={order.po_number}
                        onClick={() => handlePOClick(order.po_number, true, missedActivity.since!)}
                        className="p-2 bg-orange-50 rounded text-xs cursor-pointer hover:bg-orange-100 transition-colors"
                      >
                        <div className="font-medium text-orange-800">PO# {order.po_number}</div>
                        <div className="text-orange-600">{order.customer}</div>
                        <div className="text-orange-500">{order.styles.length} style(s) updated</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">No updated orders</p>
                )}
              </div>

              {/* New Comments */}
              <div className="card p-4 border-l-4 border-l-yellow-400">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-yellow-100 text-yellow-600 flex items-center justify-center">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">New Comments</h3>
                    <p className="text-xs text-gray-500">{missedActivity.new_comments.count} comment(s)</p>
                  </div>
                </div>
                {missedActivity.new_comments.comments.length > 0 ? (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {missedActivity.new_comments.comments.map((comment) => (
                      <div
                        key={comment.id}
                        onClick={() => handlePOClick(comment.po_number)}
                        className="p-2 bg-yellow-50 rounded text-xs cursor-pointer hover:bg-yellow-100 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-yellow-800">PO# {comment.po_number}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            comment.source === 'Sourcelab' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                          }`}>
                            {comment.source}
                          </span>
                        </div>
                        <div className="text-yellow-600">{comment.style_code}</div>
                        <div className="text-yellow-500 truncate">{comment.comment_text}</div>
                        <div className="text-yellow-400 mt-1">by {comment.username}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">No new comments</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Activity Summary - Changes this session */}
        {activitySummary && (activitySummary.new_orders.count > 0 || activitySummary.updated_orders.count > 0 || activitySummary.new_comments.count > 0) && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Changes This Session
              </h2>
              <span className="text-sm text-gray-500">
                Since {new Date(activitySummary.since).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* New Orders */}
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-green-100 text-green-600 flex items-center justify-center">
                    <PlusCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">New Orders</h3>
                    <p className="text-xs text-gray-500">{activitySummary.new_orders.count} rows in {activitySummary.new_orders.po_count} POs</p>
                  </div>
                </div>
                {activitySummary.new_orders.orders.length > 0 ? (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {activitySummary.new_orders.orders.map((order) => (
                      <div
                        key={order.po_number}
                        onClick={() => handlePOClick(order.po_number)}
                        className="p-2 bg-green-50 rounded text-xs cursor-pointer hover:bg-green-100 transition-colors"
                      >
                        <div className="font-medium text-green-800">PO# {order.po_number}</div>
                        <div className="text-green-600">{order.customer}</div>
                        <div className="text-green-500">{order.styles.length} style(s)</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">No new orders</p>
                )}
              </div>

              {/* Updated Orders */}
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                    <RefreshCw className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">Updated Orders</h3>
                    <p className="text-xs text-gray-500">{activitySummary.updated_orders.count} rows in {activitySummary.updated_orders.po_count} POs</p>
                  </div>
                </div>
                {activitySummary.updated_orders.orders.length > 0 ? (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {activitySummary.updated_orders.orders.map((order) => (
                      <div
                        key={order.po_number}
                        onClick={() => handlePOClick(order.po_number, true)}
                        className="p-2 bg-blue-50 rounded text-xs cursor-pointer hover:bg-blue-100 transition-colors"
                      >
                        <div className="font-medium text-blue-800">PO# {order.po_number}</div>
                        <div className="text-blue-600">{order.customer}</div>
                        <div className="text-blue-500">{order.styles.length} style(s) updated</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">No updated orders</p>
                )}
              </div>

              {/* New Comments */}
              <div className="card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">New Comments</h3>
                    <p className="text-xs text-gray-500">{activitySummary.new_comments.count} comment(s)</p>
                  </div>
                </div>
                {activitySummary.new_comments.comments.length > 0 ? (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {activitySummary.new_comments.comments.map((comment) => (
                      <div
                        key={comment.id}
                        onClick={() => handlePOClick(comment.po_number)}
                        className="p-2 bg-purple-50 rounded text-xs cursor-pointer hover:bg-purple-100 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-purple-800">PO# {comment.po_number}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            comment.source === 'Sourcelab' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                          }`}>
                            {comment.source}
                          </span>
                        </div>
                        <div className="text-purple-600">{comment.style_code}</div>
                        <div className="text-purple-500 truncate">{comment.comment_text}</div>
                        <div className="text-purple-400 mt-1">by {comment.username}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">No new comments</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Recent PO Summary */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent Purchase Orders</h2>
            <Link
              href="/orders"
              className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              View all orders
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">PO#</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Customer</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Factory</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Lines</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Total Qty</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Ex-Factory</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-gray-600"></th>
                </tr>
              </thead>
              <tbody>
                {poSummaries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      No purchase orders found
                    </td>
                  </tr>
                ) : (
                  poSummaries.map((po) => (
                    <tr
                      key={po.po_number}
                      onClick={() => handlePOClick(po.po_number)}
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-primary-600">{po.po_number}</td>
                      <td className="px-4 py-3 text-gray-900">{po.customer}</td>
                      <td className="px-4 py-3 text-gray-600">{po.factory}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                          {po.line_count} {po.line_count === 1 ? 'line' : 'lines'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-900">
                        {formatNumber(po.total_qty)}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {po.earliest_ex_factory ? formatDate(po.earliest_ex_factory) : '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Bulk Reject Modal */}
      {showBulkRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => { setShowBulkRejectModal(false); setBulkRejectReason(''); }}
          />
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Reject {selectedApprovals.length} Date Change{selectedApprovals.length > 1 ? 's' : ''}
              </h3>
              <button
                onClick={() => { setShowBulkRejectModal(false); setBulkRejectReason(''); }}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Rejection Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={bulkRejectReason}
                onChange={(e) => setBulkRejectReason(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm resize-none"
                placeholder="Enter reason for rejection..."
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-1">
                This reason will be applied to all selected changes
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowBulkRejectModal(false); setBulkRejectReason(''); }}
                disabled={isProcessing}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkReject}
                disabled={isProcessing || !bulkRejectReason.trim()}
                className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Rejecting...
                  </>
                ) : (
                  <>
                    <X className="w-4 h-4" />
                    Reject {selectedApprovals.length} Change{selectedApprovals.length > 1 ? 's' : ''}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comment Sidebar */}
      <CommentSidebar />
    </div>
  );
}
