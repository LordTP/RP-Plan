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
  MessageSquare,
  PlusCircle,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Navbar } from '@/components/layout/Navbar';
import { AuthProvider } from '@/components/layout/AuthProvider';
import { CommentSidebar } from '@/components/orders/CommentSidebar';
import { useStore } from '@/store/useStore';
import { statsApi, ActivitySummary, MissedActivity } from '@/lib/api';
import { formatCurrency, formatNumber, formatDate } from '@/lib/utils';
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

  const isInternal = user?.role === 'internal' || user?.role === 'admin';

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
      label: 'Total Value',
      value: formatCurrency(stats?.total_value || 0),
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {user?.username}
          </h1>
          <p className="text-gray-500 mt-1">
            Here's an overview of your purchase orders
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-4 mb-8">
          {allStats.map((stat) => {
            const Icon = stat.icon;
            const isClickable = 'statusFilter' in stat;
            return (
              <div
                key={stat.label}
                className={`card p-4 ${isClickable ? 'cursor-pointer hover:shadow-md hover:border-primary-200 transition-all' : ''}`}
                onClick={() => isClickable && handleStatusClick((stat as any).statusFilter)}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${stat.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">{stat.label}</p>
                    <p className="text-xl font-semibold text-gray-900 font-mono">
                      {stat.value}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

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

      {/* Comment Sidebar */}
      <CommentSidebar />
    </div>
  );
}
