'use client';

import { useEffect, useState } from 'react';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Factory,
  Users,
  Package,
  DollarSign,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Calendar,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import toast from 'react-hot-toast';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/layout/AuthProvider';
import { analyticsApi } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'];

export default function AnalyticsPage() {
  return (
    <AuthProvider>
      <AnalyticsGuard />
    </AuthProvider>
  );
}

function AnalyticsGuard() {
  const { user } = useStore();

  if (user?.role === 'sourcelab_designer') {
    return (
      <AppShell title="Analytics">
        <div className="flex items-center justify-center h-[calc(100vh-200px)]">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <BarChart3 className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-500">Designer accounts do not have access to the Analytics page.</p>
          </div>
        </div>
      </AppShell>
    );
  }

  return <AnalyticsContent />;
}

function AnalyticsContent() {
  const { user } = useStore();
  const [isLoading, setIsLoading] = useState(true);
  const [overview, setOverview] = useState<any>(null);
  const [ordersOverTime, setOrdersOverTime] = useState<any[]>([]);
  const [factoryPerformance, setFactoryPerformance] = useState<any[]>([]);
  const [customerAnalytics, setCustomerAnalytics] = useState<any[]>([]);
  const [deliveryPerformance, setDeliveryPerformance] = useState<any[]>([]);
  const [dateChanges, setDateChanges] = useState<any>(null);
  const [pipeline, setPipeline] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any>(null);

  const isInternal = user?.role === 'admin' || user?.role === 'internal';

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [
        overviewData,
        ordersData,
        factoryData,
        customerData,
        deliveryData,
        dateChangeData,
        pipelineData,
        alertsData,
      ] = await Promise.all([
        analyticsApi.getOverview(),
        analyticsApi.getOrdersOverTime(),
        analyticsApi.getFactoryPerformance(),
        analyticsApi.getCustomerAnalytics(),
        analyticsApi.getDeliveryPerformance(),
        analyticsApi.getDateChanges(),
        analyticsApi.getPipeline(),
        analyticsApi.getAlerts(),
      ]);

      setOverview(overviewData);
      setOrdersOverTime(ordersData.data);
      setFactoryPerformance(factoryData.factories);
      setCustomerAnalytics(customerData.customers);
      setDeliveryPerformance(deliveryData.data);
      setDateChanges(dateChangeData);
      setPipeline(pipelineData.pipeline);
      setAlerts(alertsData);
    } catch (error) {
      toast.error('Failed to load analytics');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isInternal) {
      loadData();
    }
  }, [isInternal]);

  if (!isInternal) {
    return (
      <AppShell title="Analytics">
        <div className="max-w-4xl mx-auto py-12 text-center">
          <BarChart3 className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-500">Analytics is only available for internal users.</p>
        </div>
      </AppShell>
    );
  }

  if (isLoading) {
    return (
      <AppShell title="Analytics">
        <div className="flex items-center justify-center h-[calc(100vh-200px)]">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500">Loading analytics...</p>
          </div>
        </div>
      </AppShell>
    );
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-GB').format(value);
  };

  return (
    <AppShell title="Analytics" subtitle="Order and performance insights">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
            <p className="text-sm text-gray-500 mt-1">Order and performance insights</p>
          </div>
          <button
            onClick={loadData}
            className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            title="Total Orders"
            value={formatNumber(overview?.total_orders || 0)}
            icon={Package}
            color="blue"
          />
          <StatCard
            title="Total Value"
            value={formatCurrency(overview?.total_value || 0)}
            icon={DollarSign}
            color="green"
          />
          <StatCard
            title="On-Time Rate"
            value={`${overview?.on_time_rate || 0}%`}
            icon={overview?.on_time_rate >= 90 ? CheckCircle : AlertTriangle}
            color={overview?.on_time_rate >= 90 ? 'green' : overview?.on_time_rate >= 75 ? 'yellow' : 'red'}
          />
          <StatCard
            title="Late Orders"
            value={formatNumber(overview?.late_orders || 0)}
            icon={Clock}
            color="red"
          />
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Orders Over Time */}
          <ChartCard title="Orders Over Time" icon={TrendingUp} iconColor="text-blue-500">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ordersOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: '13px' }}
                  />
                  <Bar dataKey="orders" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* Order Value Over Time */}
          <ChartCard title="Order Value Over Time" icon={DollarSign} iconColor="text-green-500">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ordersOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: '13px' }}
                  />
                  <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2.5} dot={{ fill: '#10b981', r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Pipeline */}
          <ChartCard title="Order Pipeline" icon={Package} iconColor="text-purple-500">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pipeline.filter(p => p.count > 0)}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={90}
                    innerRadius={45}
                    fill="#8884d8"
                    dataKey="count"
                    nameKey="stage"
                    paddingAngle={2}
                  >
                    {pipeline.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string) => [formatNumber(value), name]}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: '13px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* Delivery Performance */}
          <ChartCard title="Delivery Performance" icon={CheckCircle} iconColor="text-green-500">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deliveryPerformance}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: '13px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="on_time" name="On Time" fill="#10b981" radius={[4, 4, 0, 0]} stackId="a" />
                  <Bar dataKey="late" name="Late" fill="#ef4444" radius={[4, 4, 0, 0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>

        {/* Factory Performance Table */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
          <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center">
              <Factory className="w-4.5 h-4.5 text-orange-500" />
            </div>
            <h2 className="text-base font-semibold text-gray-900">Factory Performance</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr className="bg-gray-50/60">
                  <th className="text-left py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Factory</th>
                  <th className="text-right py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Orders</th>
                  <th className="text-right py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">On-Time Rate</th>
                  <th className="text-right py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Late</th>
                  <th className="text-right py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date Changes</th>
                  <th className="text-right py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Value</th>
                </tr>
              </thead>
              <tbody>
                {factoryPerformance.slice(0, 10).map((factory, idx) => (
                  <tr key={idx} className="border-t border-gray-50 hover:bg-gray-50/60 transition-colors">
                    <td className="py-3.5 px-6 font-medium text-gray-900">{factory.factory}</td>
                    <td className="py-3.5 px-6 text-right text-gray-600">{formatNumber(factory.total_orders)}</td>
                    <td className="py-3.5 px-6 text-right">
                      <span className={cn(
                        'inline-flex px-2.5 py-1 rounded-full text-xs font-semibold',
                        factory.on_time_rate >= 90 ? 'bg-green-50 text-green-700' :
                        factory.on_time_rate >= 75 ? 'bg-yellow-50 text-yellow-700' :
                        'bg-red-50 text-red-700'
                      )}>
                        {factory.on_time_rate}%
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-right text-gray-600">{factory.late_orders}</td>
                    <td className="py-3.5 px-6 text-right text-gray-600">{factory.date_changes}</td>
                    <td className="py-3.5 px-6 text-right font-medium text-gray-900">{formatCurrency(factory.total_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Customer Analytics */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
          <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <Users className="w-4.5 h-4.5 text-blue-500" />
            </div>
            <h2 className="text-base font-semibold text-gray-900">Top Customers by Value</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr className="bg-gray-50/60">
                  <th className="text-left py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="text-right py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Orders</th>
                  <th className="text-right py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Value</th>
                  <th className="text-right py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Quantity</th>
                  <th className="text-right py-3 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">On-Time Rate</th>
                </tr>
              </thead>
              <tbody>
                {customerAnalytics.map((customer, idx) => (
                  <tr key={idx} className="border-t border-gray-50 hover:bg-gray-50/60 transition-colors">
                    <td className="py-3.5 px-6 font-medium text-gray-900">{customer.customer}</td>
                    <td className="py-3.5 px-6 text-right text-gray-600">{formatNumber(customer.order_count)}</td>
                    <td className="py-3.5 px-6 text-right font-medium text-gray-900">{formatCurrency(customer.total_value)}</td>
                    <td className="py-3.5 px-6 text-right text-gray-600">{formatNumber(customer.total_quantity)}</td>
                    <td className="py-3.5 px-6 text-right">
                      <span className={cn(
                        'inline-flex px-2.5 py-1 rounded-full text-xs font-semibold',
                        customer.on_time_rate >= 90 ? 'bg-green-50 text-green-700' :
                        customer.on_time_rate >= 75 ? 'bg-yellow-50 text-yellow-700' :
                        'bg-red-50 text-red-700'
                      )}>
                        {customer.on_time_rate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Date Changes */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <ChartCard title="Date Changes Over Time" icon={Calendar} iconColor="text-amber-500">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dateChanges?.changes_over_time || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: '13px' }}
                  />
                  <Line type="monotone" dataKey="changes" stroke="#f59e0b" strokeWidth={2.5} dot={{ fill: '#f59e0b', r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard title="Date Changes by Factory" icon={Factory} iconColor="text-amber-500">
            <div className="space-y-3 py-2">
              {dateChanges?.changes_by_factory?.slice(0, 8).map((item: any, idx: number) => (
                <div key={idx} className="flex items-center gap-3">
                  <span className="text-xs font-medium text-gray-600 truncate w-28 text-right flex-shrink-0">{item.factory}</span>
                  <div className="flex-1 h-7 bg-gray-100 rounded-lg overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-lg flex items-center justify-end pr-2.5 transition-all duration-500"
                      style={{
                        width: `${Math.max(Math.min((item.changes / (dateChanges?.changes_by_factory?.[0]?.changes || 1)) * 100, 100), 10)}%`
                      }}
                    >
                      <span className="text-[10px] font-bold text-white">{item.changes}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ChartCard>
        </div>

        {/* Alerts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Overdue Production */}
          <AlertCard
            title="Overdue Production"
            icon={AlertTriangle}
            iconColor="text-red-500"
            iconBg="bg-red-50"
            count={alerts?.overdue_production?.length || 0}
            badgeColor="bg-red-100 text-red-700"
            emptyText="No overdue orders"
          >
            {alerts?.overdue_production?.map((order: any) => (
              <div key={order.id} className="px-4 py-3 bg-red-50/60 rounded-xl border border-red-100 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-900">{order.po_number}</span>
                  <span className="text-[11px] text-red-500 font-medium">{order.style_code}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{order.factory} · {order.customer}</p>
              </div>
            ))}
          </AlertCard>

          {/* Stale Orders */}
          <AlertCard
            title="No Updates (14+ days)"
            icon={Clock}
            iconColor="text-yellow-500"
            iconBg="bg-yellow-50"
            count={alerts?.stale_orders?.length || 0}
            badgeColor="bg-yellow-100 text-yellow-700"
            emptyText="All orders up to date"
          >
            {alerts?.stale_orders?.map((order: any) => (
              <div key={order.id} className="px-4 py-3 bg-yellow-50/60 rounded-xl border border-yellow-100 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-900">{order.po_number}</span>
                  <span className="text-[11px] text-yellow-600 font-medium">{order.style_code}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{order.factory} · {order.status || 'No status'}</p>
              </div>
            ))}
          </AlertCard>

          {/* Upcoming Deliveries */}
          <AlertCard
            title="Deliveries This Week"
            icon={CheckCircle}
            iconColor="text-green-500"
            iconBg="bg-green-50"
            count={alerts?.upcoming_deliveries?.length || 0}
            badgeColor="bg-green-100 text-green-700"
            emptyText="No deliveries this week"
          >
            {alerts?.upcoming_deliveries?.map((order: any) => (
              <div key={order.id} className="px-4 py-3 bg-green-50/60 rounded-xl border border-green-100 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-900">{order.po_number}</span>
                  <span className="text-[11px] text-green-600 font-medium">{order.style_code}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {order.customer} · ETA: {order.eta_to_uk ? new Date(order.eta_to_uk).toLocaleDateString() : 'N/A'}
                </p>
              </div>
            ))}
          </AlertCard>
        </div>
    </AppShell>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  icon: React.ElementType;
  color: 'blue' | 'green' | 'yellow' | 'red' | 'purple';
}

function StatCard({ title, value, icon: Icon, color }: StatCardProps) {
  const colorClasses = {
    blue: { icon: 'bg-blue-50 text-blue-600', accent: 'from-blue-500/5 to-transparent' },
    green: { icon: 'bg-green-50 text-green-600', accent: 'from-green-500/5 to-transparent' },
    yellow: { icon: 'bg-yellow-50 text-yellow-600', accent: 'from-yellow-500/5 to-transparent' },
    red: { icon: 'bg-red-50 text-red-600', accent: 'from-red-500/5 to-transparent' },
    purple: { icon: 'bg-purple-50 text-purple-600', accent: 'from-purple-500/5 to-transparent' },
  };

  return (
    <div className={cn('bg-white rounded-2xl border border-gray-200 p-5 relative overflow-hidden')}>
      <div className={cn('absolute inset-0 bg-gradient-to-br', colorClasses[color].accent)} />
      <div className="relative flex items-center gap-4">
        <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0', colorClasses[color].icon)}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-gray-500 font-medium">{title}</p>
          <p className="text-2xl font-bold text-gray-900 truncate mt-0.5">{value}</p>
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, icon: Icon, iconColor, children }: { title: string; icon: React.ElementType; iconColor: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-3">
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', iconColor.replace('text-', 'bg-').replace('-500', '-50'))}>
          <Icon className={cn('w-4.5 h-4.5', iconColor)} />
        </div>
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="p-6">
        {children}
      </div>
    </div>
  );
}

function AlertCard({
  title,
  icon: Icon,
  iconColor,
  iconBg,
  count,
  badgeColor,
  emptyText,
  children,
}: {
  title: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  count: number;
  badgeColor: string;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-3">
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', iconBg)}>
          <Icon className={cn('w-4.5 h-4.5', iconColor)} />
        </div>
        <h2 className="text-base font-semibold text-gray-900 flex-1">{title}</h2>
        {count > 0 && (
          <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full', badgeColor)}>
            {count}
          </span>
        )}
      </div>
      <div className="p-4 space-y-2 max-h-72 overflow-y-auto">
        {count === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">{emptyText}</p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
