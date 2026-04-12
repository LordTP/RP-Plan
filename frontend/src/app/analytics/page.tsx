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
  ChevronDown,
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
  const [designData, setDesignData] = useState<any>(null);

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

      // Load design analytics
      try {
        const designResult = await analyticsApi.getDesignAnalytics();
        setDesignData(designResult);
      } catch { /* design data is optional */ }
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

        {/* ═══ DESIGN ANALYTICS ═══ */}
        {designData && (
          <>
            <div className="mt-10 mb-6">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <span className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center">
                  <Package className="w-4 h-4 text-violet-600" />
                </span>
                Design &amp; Sampling
              </h2>
              <p className="text-sm text-gray-500 mt-1">Sample pipeline, component tracking, and factory performance</p>
            </div>

            {/* Sample Pipeline — expandable status groups */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {['fit_sample', 'strike_off', 'lab_dip', 'pps'].map(type => {
                const groups: any[] = designData.sample_pipeline?.[type] || [];
                const total = groups.reduce((s: number, g: any) => s + g.count, 0);
                const label = type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
                const STATUS_COLORS: Record<string, string> = {
                  'OUTSTANDING': 'bg-amber-100 text-amber-700',
                  'RECEIVED': 'bg-blue-100 text-blue-700',
                  'APPROVED': 'bg-green-100 text-green-700',
                  'LATE': 'bg-red-100 text-red-700',
                  'NOT REQUIRED': 'bg-gray-100 text-gray-600',
                  'P23 ADVISE UPDATE': 'bg-purple-100 text-purple-700',
                  'NOT SET': 'bg-gray-50 text-gray-400',
                };
                return (
                  <div key={type} className="bg-white rounded-2xl border border-gray-200/60 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-900">{label} Pipeline</h3>
                      <span className="text-xs text-gray-400">{total} total</span>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {groups.map((g: any) => (
                        <SamplePipelineGroup key={g.status} group={g} colorClass={STATUS_COLORS[g.status] || 'bg-gray-100 text-gray-600'} total={total} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Component Coverage + Factory Sample Performance */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              {/* Component Coverage */}
              <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Component Coverage</h3>
                <div className="text-center mb-4">
                  <p className="text-3xl font-bold text-violet-600">{designData.component_coverage?.coverage_pct || 0}%</p>
                  <p className="text-xs text-gray-400 mt-1">of orders have components</p>
                </div>
                {/* By component name */}
                {(designData.component_coverage?.by_component_name || []).length > 0 && (
                  <div className="mb-4">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Components</p>
                    <div className="space-y-1.5">
                      {(designData.component_coverage?.by_component_name || []).map((c: any) => (
                        <div key={c.name} className="flex items-center justify-between text-xs">
                          <span className="text-gray-700 font-medium">{c.name}</span>
                          <span className="text-gray-500">{c.count} styles</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Summary stats */}
                <div className="space-y-1 text-xs border-t border-gray-100 pt-3">
                  <div className="flex justify-between py-1">
                    <span className="text-gray-500">With components</span>
                    <span className="font-semibold text-green-600">{designData.component_coverage?.orders_with_components || 0}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-gray-500">Without components</span>
                    <span className="font-semibold text-red-500">{designData.component_coverage?.orders_without_components || 0}</span>
                  </div>
                </div>
                {/* Orders missing components — expandable */}
                {(designData.component_coverage?.orders_missing_components || []).length > 0 && (
                  <MissingComponentsList orders={designData.component_coverage.orders_missing_components} />
                )}
              </div>

              {/* Factory Sample Performance */}
              <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200/60 shadow-sm p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Factory Sample Performance (Avg Days to Approve)</h3>
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
                      {(designData.factory_sample_performance || []).map((f: any) => (
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
                      {(designData.factory_sample_performance || []).length === 0 && (
                        <tr><td colSpan={5} className="py-6 text-center text-gray-400">No factory data yet</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* At Risk + Awaiting Action */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* At Risk Samples */}
              <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Late / At Risk Samples</h3>
                <p className="text-[11px] text-gray-400 mb-4">Approaching ex-factory with unapproved samples</p>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {(designData.at_risk_samples || []).length === 0 ? (
                    <div className="text-center py-8 text-xs text-gray-400">
                      <CheckCircle className="w-6 h-6 mx-auto mb-2 text-green-400" />
                      No at-risk samples
                    </div>
                  ) : (designData.at_risk_samples || []).map((item: any) => (
                    <div key={item.id} className="px-3 py-2.5 bg-red-50/60 rounded-xl border border-red-100 text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-gray-900">{item.po_number} · {item.style_code}</span>
                        <span className={cn(
                          'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                          item.days_until_ex_factory <= 14 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                        )}>
                          {item.days_until_ex_factory}d to ex-fac
                        </span>
                      </div>
                      <p className="text-gray-500">{item.factory} · {item.customer}</p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {item.issues.map((issue: string, i: number) => (
                          <span key={i} className="text-[9px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded font-medium">{issue}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Awaiting Action */}
              <div className="bg-white rounded-2xl border border-gray-200/60 shadow-sm p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Awaiting Action</h3>
                <p className="text-[11px] text-gray-400 mb-4">Samples received but not yet approved</p>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {(designData.awaiting_action || []).length === 0 ? (
                    <div className="text-center py-8 text-xs text-gray-400">
                      <CheckCircle className="w-6 h-6 mx-auto mb-2 text-green-400" />
                      All samples actioned
                    </div>
                  ) : (designData.awaiting_action || []).map((item: any) => (
                    <div key={item.id} className="px-3 py-2.5 bg-amber-50/60 rounded-xl border border-amber-100 text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-gray-900">{item.po_number} · {item.style_code}</span>
                        <span className="text-[10px] text-gray-400">{item.factory}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.actions.map((a: any, i: number) => (
                          <span key={i} className={cn(
                            'text-[9px] px-1.5 py-0.5 rounded font-medium',
                            a.received_days_ago > 14 ? 'bg-red-100 text-red-600' : a.received_days_ago > 7 ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'
                          )}>
                            {a.type} · {a.received_days_ago}d ago
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
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

function SamplePipelineGroup({ group, colorClass, total }: { group: any; colorClass: string; total: number }) {
  const [expanded, setExpanded] = useState(false);
  const pct = total > 0 ? Math.round((group.count / total) * 100) : 0;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', colorClass)}>
            {group.status}
          </span>
          <span className="text-sm font-semibold text-gray-900">{group.count}</span>
          <span className="text-xs text-gray-400">{pct}%</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-primary-400 rounded-full" style={{ width: `${pct}%` }} />
          </div>
          <ChevronDown className={cn('w-3.5 h-3.5 text-gray-400 transition-transform', expanded && 'rotate-180')} />
        </div>
      </button>
      {expanded && (
        <div className="px-5 pb-3">
          <div className="max-h-48 overflow-y-auto space-y-1">
            {group.orders.map((o: any) => (
              <div key={o.id} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">{o.po_number}</span>
                  <span className="text-gray-500">{o.style_code}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-400">
                  <span>{o.customer}</span>
                  <span className="text-gray-300">·</span>
                  <span>{o.factory}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MissingComponentsList({ orders }: { orders: any[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Missing Components ({orders.length})</span>
        <ChevronDown className={cn('w-3 h-3 text-gray-400 transition-transform', expanded && 'rotate-180')} />
      </button>
      {expanded && (
        <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
          {orders.map((o: any) => (
            <div key={o.id} className="text-[11px] flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
              <span className="font-medium text-gray-700">{o.po_number} · {o.style_code}</span>
              <span className="text-gray-400">{o.factory}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
