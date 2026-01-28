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
import { Navbar } from '@/components/layout/Navbar';
import { AuthProvider } from '@/components/layout/AuthProvider';
import { analyticsApi } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'];

export default function AnalyticsPage() {
  return (
    <AuthProvider>
      <AnalyticsContent />
    </AuthProvider>
  );
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
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-4xl mx-auto px-4 py-12 text-center">
          <BarChart3 className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-500">Analytics is only available for internal users.</p>
        </main>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500">Loading analytics...</p>
          </div>
        </div>
      </div>
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
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
            <p className="text-gray-500">Order and performance insights</p>
          </div>
          <button
            onClick={loadData}
            className="btn-secondary flex items-center gap-2"
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
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-500" />
              Orders Over Time
            </h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ordersOverTime}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="orders" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Order Value Over Time */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-500" />
              Order Value Over Time
            </h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ordersOverTime}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Pipeline */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Package className="w-5 h-5 text-purple-500" />
              Order Pipeline
            </h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pipeline.filter(p => p.count > 0)}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="count"
                    nameKey="stage"
                  >
                    {pipeline.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number, name: string) => [formatNumber(value), name]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Delivery Performance */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              Delivery Performance
            </h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deliveryPerformance}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="on_time" name="On Time" fill="#10b981" stackId="a" />
                  <Bar dataKey="late" name="Late" fill="#ef4444" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Factory Performance Table */}
        <div className="card p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Factory className="w-5 h-5 text-orange-500" />
            Factory Performance
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Factory</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500">Orders</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500">On-Time Rate</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500">Late</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500">Date Changes</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500">Total Value</th>
                </tr>
              </thead>
              <tbody>
                {factoryPerformance.slice(0, 10).map((factory, idx) => (
                  <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 font-medium text-gray-900">{factory.factory}</td>
                    <td className="py-3 px-4 text-right text-gray-600">{formatNumber(factory.total_orders)}</td>
                    <td className="py-3 px-4 text-right">
                      <span className={cn(
                        'inline-flex px-2 py-1 rounded-full text-xs font-medium',
                        factory.on_time_rate >= 90 ? 'bg-green-100 text-green-800' :
                        factory.on_time_rate >= 75 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      )}>
                        {factory.on_time_rate}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-gray-600">{factory.late_orders}</td>
                    <td className="py-3 px-4 text-right text-gray-600">{factory.date_changes}</td>
                    <td className="py-3 px-4 text-right text-gray-600">{formatCurrency(factory.total_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Customer Analytics */}
        <div className="card p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-500" />
            Top Customers by Value
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Customer</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500">Orders</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500">Total Value</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500">Quantity</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500">On-Time Rate</th>
                </tr>
              </thead>
              <tbody>
                {customerAnalytics.map((customer, idx) => (
                  <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 font-medium text-gray-900">{customer.customer}</td>
                    <td className="py-3 px-4 text-right text-gray-600">{formatNumber(customer.order_count)}</td>
                    <td className="py-3 px-4 text-right text-gray-600">{formatCurrency(customer.total_value)}</td>
                    <td className="py-3 px-4 text-right text-gray-600">{formatNumber(customer.total_quantity)}</td>
                    <td className="py-3 px-4 text-right">
                      <span className={cn(
                        'inline-flex px-2 py-1 rounded-full text-xs font-medium',
                        customer.on_time_rate >= 90 ? 'bg-green-100 text-green-800' :
                        customer.on_time_rate >= 75 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
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
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-amber-500" />
              Date Changes Over Time
            </h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dateChanges?.changes_over_time || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="changes" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Factory className="w-5 h-5 text-amber-500" />
              Date Changes by Factory
            </h2>
            <div className="space-y-3">
              {dateChanges?.changes_by_factory?.slice(0, 8).map((item: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 truncate flex-1">{item.factory}</span>
                  <div className="flex items-center gap-2 ml-4">
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-amber-500 h-2 rounded-full"
                        style={{
                          width: `${Math.min((item.changes / (dateChanges?.changes_by_factory?.[0]?.changes || 1)) * 100, 100)}%`
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-900 w-12 text-right">{item.changes}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Alerts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Overdue Production */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Overdue Production
              {alerts?.overdue_production?.length > 0 && (
                <span className="ml-auto bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full">
                  {alerts.overdue_production.length}
                </span>
              )}
            </h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {alerts?.overdue_production?.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No overdue orders</p>
              ) : (
                alerts?.overdue_production?.map((order: any) => (
                  <div key={order.id} className="p-2 bg-red-50 rounded-lg text-sm">
                    <div className="font-medium text-gray-900">{order.po_number}</div>
                    <div className="text-gray-600 text-xs">{order.style_code}</div>
                    <div className="text-gray-500 text-xs">{order.factory} - {order.customer}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Stale Orders */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-yellow-500" />
              No Updates (14+ days)
              {alerts?.stale_orders?.length > 0 && (
                <span className="ml-auto bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full">
                  {alerts.stale_orders.length}
                </span>
              )}
            </h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {alerts?.stale_orders?.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">All orders up to date</p>
              ) : (
                alerts?.stale_orders?.map((order: any) => (
                  <div key={order.id} className="p-2 bg-yellow-50 rounded-lg text-sm">
                    <div className="font-medium text-gray-900">{order.po_number}</div>
                    <div className="text-gray-600 text-xs">{order.style_code}</div>
                    <div className="text-gray-500 text-xs">{order.factory} - {order.status || 'No status'}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Upcoming Deliveries */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              Deliveries This Week
              {alerts?.upcoming_deliveries?.length > 0 && (
                <span className="ml-auto bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                  {alerts.upcoming_deliveries.length}
                </span>
              )}
            </h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {alerts?.upcoming_deliveries?.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No deliveries this week</p>
              ) : (
                alerts?.upcoming_deliveries?.map((order: any) => (
                  <div key={order.id} className="p-2 bg-green-50 rounded-lg text-sm">
                    <div className="font-medium text-gray-900">{order.po_number}</div>
                    <div className="text-gray-600 text-xs">{order.style_code}</div>
                    <div className="text-gray-500 text-xs">
                      {order.customer} - ETA: {order.eta_to_uk ? new Date(order.eta_to_uk).toLocaleDateString() : 'N/A'}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
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
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    red: 'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
  };

  return (
    <div className="card p-4">
      <div className="flex items-center gap-3">
        <div className={cn('p-2 rounded-lg', colorClasses[color])}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
}
