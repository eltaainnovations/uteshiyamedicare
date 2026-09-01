import {
  Building2,
  Clock,
  FileBarChart2,
  Package,
  RefreshCw,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  fetchOrderFulfillment,
  fetchRevenueTrend,
  fetchTopProducts,
  type OrderFulfillment,
  type RevenueTrend,
  type TopProducts,
} from '../../api/analyticsApi'
import { fetchDistributors } from '../../api/distributorsApi'
import { fetchOrders, type OrderListItem } from '../../api/ordersApi'
import { fetchProducts } from '../../api/productsApi'
import { useChartTheme } from '../../context/ThemeContext'
import { clearAsyncDataCache, useAsyncData } from '../../hooks/useAsyncData'
import { formatInr } from '../../utils/currency'
import ChartSkeleton from '../common/ChartSkeleton'
import DistributorTypeahead from '../common/DistributorTypeahead'
import ErrorBlock from '../common/ErrorBlock'
import SectionCard from '../common/SectionCard'

const STATUS_COLORS: Record<string, string> = {
  Draft: '#9CA3AF',
  'To Deliver': '#4AA3FF',
  'To Bill': '#7C3AED',
  'To Deliver and Bill': '#F59E0B',
  Completed: '#1F8A70',
  Closed: '#6B7280',
  Cancelled: '#DC2626',
}
const PENDING_STATUSES = ['To Deliver', 'To Bill', 'To Deliver and Bill']

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function todayStr(): string {
  return isoDate(new Date())
}
function yesterdayStr(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return isoDate(d)
}
// Trailing 12 months — chosen over a fixed fiscal-year window for the
// charts/Top Products/Fulfillment section: simpler, and "real-time
// snapshot" fits a rolling window better than a fixed FY boundary.
function trailing12MonthsFrom(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 1)
  d.setDate(d.getDate() + 1)
  return isoDate(d)
}
// Indian fiscal year (Apr 1 – Mar 31) — this codebase's own reference
// data already said "FY 2025–26", so that's taken as the real convention
// rather than defaulting to calendar-year YTD.
function fiscalYearStart(): string {
  const now = new Date()
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  return isoDate(new Date(year, 3, 1))
}

interface KpiCardProps {
  icon: LucideIcon
  color: string
  bg: string
  value: string
  label: string
  loading: boolean
  deltaPct?: number | null
  deltaLabel?: string
}

function KpiCard({ icon: Icon, color, bg, value, label, loading, deltaPct, deltaLabel }: KpiCardProps) {
  return (
    <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] p-4 border border-gray-100 dark:border-[#252836] shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <div className="w-9 h-9 rounded-[8px] flex items-center justify-center" style={{ background: bg }}>
          <Icon size={18} style={{ color }} />
        </div>
        {deltaPct != null && (
          <span
            className={`flex items-center gap-0.5 text-xs font-semibold ${deltaPct >= 0 ? 'text-green-600' : 'text-red-500'}`}
          >
            {deltaPct >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          </span>
        )}
      </div>
      {loading ? (
        <div className="animate-pulse h-6 w-16 bg-gray-100 dark:bg-[#161921] rounded" />
      ) : (
        <p className="text-xl font-bold text-gray-900 dark:text-[#E8EAF0]">{value}</p>
      )}
      <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-1 leading-tight">{label}</p>
      {deltaPct != null && deltaLabel && (
        <p className={`text-[10px] font-medium mt-1 ${deltaPct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
          {deltaPct >= 0 ? '+' : ''}
          {deltaPct.toFixed(1)}% {deltaLabel}
        </p>
      )}
    </div>
  )
}

const QUICK_ACTIONS: { icon: LucideIcon; label: string; color: string; action: string }[] = [
  { icon: UserPlus, label: 'Create User', color: '#147BA6', action: 'create-user' },
  { icon: FileBarChart2, label: 'Generate Report', color: '#7C3AED', action: 'generate-report' },
  { icon: ShoppingCart, label: 'View Orders', color: '#1F8A70', action: 'view-orders' },
  { icon: Building2, label: 'View Distributors', color: '#4AA3FF', action: 'view-distributors' },
]

export default function AdminDashboard() {
  const { grid, axis, tooltip } = useChartTheme()
  const navigate = useNavigate()

  const [customer, setCustomer] = useState<string | null>(null)
  const [customerLabel, setCustomerLabel] = useState<string | null>(null)
  // Bumped by the Refresh button. Included in every fetch's deps so all
  // sections re-run together; paired with clearAsyncDataCache so that
  // re-run actually hits the network instead of re-serving the cache it
  // just invalidated.
  const [refreshNonce, setRefreshNonce] = useState(0)

  const trailing12From = trailing12MonthsFrom()
  const today = todayStr()
  const scope = customer ?? 'all'

  // Revenue Trend chart — also the source for "Monthly Orders" (last
  // bucket's order_count) and its "vs last month" delta (second-to-last
  // bucket), so those two KPIs cost nothing beyond this one fetch.
  const revenue = useAsyncData<RevenueTrend>(
    () => fetchRevenueTrend({ fromDate: trailing12From, toDate: today, customer: customer ?? undefined, granularity: 'monthly' }),
    [customer, refreshNonce],
    `dashboard:revenue:${scope}`,
  )

  // Today's Orders + its "vs yesterday" delta — one daily-granularity
  // call spanning just yesterday+today.
  const todayWindow = useAsyncData<RevenueTrend>(
    () => fetchRevenueTrend({ fromDate: yesterdayStr(), toDate: today, customer: customer ?? undefined, granularity: 'daily' }),
    [customer, refreshNonce],
    `dashboard:today-window:${scope}`,
  )

  // Total Revenue (YTD, Indian fiscal year) — its own change_pct comes
  // free from the same revenue-trend endpoint.
  const ytdRevenue = useAsyncData<RevenueTrend>(
    () => fetchRevenueTrend({ fromDate: fiscalYearStart(), toDate: today, customer: customer ?? undefined, granularity: 'monthly' }),
    [customer, refreshNonce],
    `dashboard:ytd-revenue:${scope}`,
  )

  // Order Fulfillment donut + status KPI cards + Pending Orders + the 3
  // small stat cards (Fulfillment Rate / Cancellation / Lead Time) all
  // come from this one fetch.
  const fulfillment = useAsyncData<OrderFulfillment>(
    () => fetchOrderFulfillment({ fromDate: trailing12From, toDate: today, customer: customer ?? undefined }),
    [customer, refreshNonce],
    `dashboard:fulfillment:${scope}`,
  )

  const topProducts = useAsyncData<TopProducts>(
    () => fetchTopProducts({ fromDate: trailing12From, toDate: today, customer: customer ?? undefined }),
    [customer, refreshNonce],
    `dashboard:top-products:${scope}`,
  )

  // Total Distributors — the catalogue isn't distributor-specific, but
  // this KPI is: filtering to one distributor makes it trivially 1, no
  // call needed.
  const distributorsTotal = useAsyncData<number>(
    () => (customer ? Promise.resolve(1) : fetchDistributors({ pageSize: 20 }).then((r) => r.total)),
    [customer, refreshNonce],
    `dashboard:distributors-total:${scope}`,
  )

  // Active Products — never scoped by the distributor filter; the
  // catalogue is the same for every distributor.
  const productsTotal = useAsyncData<number>(
    () => fetchProducts({ activeOnly: true, pageSize: 20 }).then((r) => r.total),
    [refreshNonce],
    'dashboard:products-total',
  )

  const latestOrders = useAsyncData<OrderListItem[]>(
    () => fetchOrders({ customer: customer ?? undefined, page: 1, pageSize: 10 }).then((r) => r.items),
    [customer, refreshNonce],
    `dashboard:latest-orders:${scope}`,
  )

  const isRefreshing =
    revenue.loading ||
    todayWindow.loading ||
    ytdRevenue.loading ||
    fulfillment.loading ||
    topProducts.loading ||
    distributorsTotal.loading ||
    productsTotal.loading ||
    latestOrders.loading

  function handleRefresh() {
    clearAsyncDataCache('dashboard:')
    setRefreshNonce((n) => n + 1)
  }

  const monthlyOrders = useMemo(() => {
    const points = revenue.data?.points ?? []
    if (points.length === 0) return { count: 0, deltaPct: null as number | null }
    const last = points[points.length - 1]
    const prev = points.length >= 2 ? points[points.length - 2] : null
    const deltaPct = prev && prev.orderCount > 0 ? ((last.orderCount - prev.orderCount) / prev.orderCount) * 100 : null
    return { count: last.orderCount, deltaPct }
  }, [revenue.data])

  const todayOrders = useMemo(() => {
    const points = todayWindow.data?.points ?? []
    const todayCount = points.find((p) => p.bucket === today)?.orderCount ?? 0
    const yestCount = points.find((p) => p.bucket === yesterdayStr())?.orderCount ?? 0
    const deltaPct = yestCount > 0 ? ((todayCount - yestCount) / yestCount) * 100 : null
    return { count: todayCount, deltaPct }
  }, [todayWindow.data, today])

  const fulfillmentStats = useMemo(() => {
    const totals = fulfillment.data?.totals ?? []
    const total = totals.reduce((s, t) => s + t.count, 0)
    const completed = totals.find((t) => t.status === 'Completed')?.count ?? 0
    const cancelled = totals.find((t) => t.status === 'Cancelled')?.count ?? 0
    const pending = totals.filter((t) => PENDING_STATUSES.includes(t.status)).reduce((s, t) => s + t.count, 0)
    return {
      pending,
      fulfillmentRate: total > 0 ? (completed / total) * 100 : null,
      cancellationRate: total > 0 ? (cancelled / total) * 100 : null,
      avgLeadTimeDays: fulfillment.data?.avgLeadTimeDays ?? null,
    }
  }, [fulfillment.data])

  function handleQuickAction(action: string) {
    if (action === 'create-user') navigate('/admin/user-management', { state: { openAddUserModal: true } })
    else if (action === 'generate-report') navigate('/admin/reports')
    else if (action === 'view-orders') navigate('/admin/orders')
    else if (action === 'view-distributors') navigate('/admin/distributors')
  }

  return (
    <div className="p-5 lg:p-7 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-[#E8EAF0]">Overview</h1>
          <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-0.5">Real-time snapshot across all distributors</p>
        </div>
        <div className="flex items-center gap-2">
          <DistributorTypeahead
            value={customer}
            label={customerLabel}
            onSelect={(name, label) => {
              setCustomer(name)
              setCustomerLabel(label)
            }}
          />
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Refresh dashboard data"
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 dark:border-[#252836] rounded-[8px] text-gray-600 dark:text-[#96A0B4] hover:bg-gray-50 dark:hover:bg-[#1F2233] transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] p-5 border border-gray-100 dark:border-[#252836] shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0] mb-4">Quick Actions</h3>
        <div className="flex flex-wrap gap-3">
          {QUICK_ACTIONS.map(({ icon: Icon, label, color, action }) => (
            <button
              key={label}
              onClick={() => handleQuickAction(action)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-[8px] border border-gray-200 dark:border-[#252836] text-sm font-medium text-gray-700 dark:text-[#B0BAD0] hover:border-gray-300 dark:hover:border-[#353848] hover:shadow-sm transition"
            >
              <Icon size={15} style={{ color }} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard
          icon={TrendingUp}
          color="#147BA6"
          bg="#e8f4fa"
          value={ytdRevenue.data ? formatInr(ytdRevenue.data.currentTotal) : '—'}
          label="Total Revenue (YTD)"
          loading={ytdRevenue.loading}
          deltaPct={ytdRevenue.data?.changePct ?? null}
          deltaLabel="vs previous period"
        />
        <KpiCard
          icon={ShoppingCart}
          color="#1F8A70"
          bg="#e6f5f1"
          value={String(todayOrders.count)}
          label="Today's Orders"
          loading={todayWindow.loading}
          deltaPct={todayOrders.deltaPct}
          deltaLabel="vs yesterday"
        />
        <KpiCard
          icon={Clock}
          color="#4AA3FF"
          bg="#EFF6FF"
          value={String(monthlyOrders.count)}
          label="Monthly Orders"
          loading={revenue.loading}
          deltaPct={monthlyOrders.deltaPct}
          deltaLabel="vs last month"
        />
        <KpiCard
          icon={Users}
          color="#7C3AED"
          bg="#F5F3FF"
          value={distributorsTotal.data != null ? String(distributorsTotal.data) : '—'}
          label="Total Distributors"
          loading={distributorsTotal.loading}
        />
        <KpiCard
          icon={Clock}
          color="#F59E0B"
          bg="#FFFBEB"
          value={String(fulfillmentStats.pending)}
          label="Pending Orders"
          loading={fulfillment.loading}
        />
        <KpiCard
          icon={Package}
          color="#DC2626"
          bg="#FEF2F2"
          value={productsTotal.data != null ? String(productsTotal.data) : '—'}
          label="Active Products"
          loading={productsTotal.loading}
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2">
          <SectionCard title="Revenue Trend" subtitle="Monthly, trailing 12 months">
            {revenue.loading ? (
              <ChartSkeleton />
            ) : revenue.error ? (
              <ErrorBlock message={revenue.error} />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={revenue.data?.points ?? []} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dashRevGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#147BA6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#147BA6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={grid} />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: axis }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: axis }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => formatInr(v)}
                    width={55}
                  />
                  <Tooltip formatter={(v) => [formatInr(Number(v)), 'Revenue']} contentStyle={tooltip} />
                  <Area type="monotone" dataKey="revenue" stroke="#147BA6" strokeWidth={2} fill="url(#dashRevGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        </div>

        <SectionCard title="Order Fulfillment" subtitle="Trailing 12 months">
          {fulfillment.loading ? (
            <ChartSkeleton height={260} />
          ) : fulfillment.error ? (
            <ErrorBlock message={fulfillment.error} height={260} />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie
                    data={fulfillment.data?.totals ?? []}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={62}
                    paddingAngle={2}
                    dataKey="count"
                    nameKey="status"
                  >
                    {fulfillment.data?.totals.map((t) => (
                      <Cell key={t.status} fill={STATUS_COLORS[t.status] ?? '#6B7280'} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltip} />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-2 mt-3">
                {fulfillment.data?.totals.map((t) => (
                  <div key={t.status} className="flex items-center justify-between px-2 py-1.5 rounded-[6px] bg-gray-50 dark:bg-[#161921]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: STATUS_COLORS[t.status] ?? '#6B7280' }} />
                      <span className="text-[10px] text-gray-600 dark:text-[#8892A4] truncate">{t.status}</span>
                    </div>
                    <span className="text-xs font-semibold text-gray-900 dark:text-[#E8EAF0] flex-shrink-0">{t.count}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </SectionCard>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <SectionCard title="Top 10 Products" subtitle="By revenue · Trailing 12 months">
          {topProducts.loading ? (
            <ChartSkeleton height={240} />
          ) : topProducts.error ? (
            <ErrorBlock message={topProducts.error} height={240} />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={topProducts.data?.items.slice(0, 10).map((p) => ({
                  ...p,
                  label: (p.itemName ?? p.itemCode).length > 24 ? `${(p.itemName ?? p.itemCode).slice(0, 22)}…` : (p.itemName ?? p.itemCode),
                })) ?? []}
                layout="vertical"
                margin={{ left: 0, right: 10, top: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={grid} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: axis }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatInr(v)} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: axis }} axisLine={false} tickLine={false} width={120} />
                <Tooltip formatter={(v) => [formatInr(Number(v)), 'Revenue']} contentStyle={tooltip} />
                <Bar dataKey="revenue" fill="#147BA6" radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] p-4 border border-gray-100 dark:border-[#252836] shadow-sm text-center">
              {fulfillment.loading ? (
                <div className="animate-pulse h-6 w-12 mx-auto bg-gray-100 dark:bg-[#161921] rounded" />
              ) : (
                <p className="text-lg font-bold text-gray-900 dark:text-[#E8EAF0]">
                  {fulfillmentStats.fulfillmentRate != null ? `${fulfillmentStats.fulfillmentRate.toFixed(0)}%` : '—'}
                </p>
              )}
              <p className="text-[10px] text-gray-500 dark:text-[#8892A4] mt-0.5 leading-tight">Fulfillment Rate</p>
            </div>
            <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] p-4 border border-gray-100 dark:border-[#252836] shadow-sm text-center">
              {fulfillment.loading ? (
                <div className="animate-pulse h-6 w-12 mx-auto bg-gray-100 dark:bg-[#161921] rounded" />
              ) : (
                <p className="text-lg font-bold text-gray-900 dark:text-[#E8EAF0]">
                  {fulfillmentStats.cancellationRate != null ? `${fulfillmentStats.cancellationRate.toFixed(0)}%` : '—'}
                </p>
              )}
              <p className="text-[10px] text-gray-500 dark:text-[#8892A4] mt-0.5 leading-tight">Cancellation Rate</p>
            </div>
            <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] p-4 border border-gray-100 dark:border-[#252836] shadow-sm text-center">
              {fulfillment.loading ? (
                <div className="animate-pulse h-6 w-12 mx-auto bg-gray-100 dark:bg-[#161921] rounded" />
              ) : (
                <p className="text-lg font-bold text-gray-900 dark:text-[#E8EAF0]">
                  {fulfillmentStats.avgLeadTimeDays != null ? `${fulfillmentStats.avgLeadTimeDays}d` : '—'}
                </p>
              )}
              <p className="text-[10px] text-gray-500 dark:text-[#8892A4] mt-0.5 leading-tight">Avg. Planned Lead Time</p>
            </div>
          </div>
        </div>
      </div>

      {/* Latest Orders Table */}
      <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-[#252836]">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0]">Latest Orders</h3>
            <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-0.5">Most recent orders across all distributors</p>
          </div>
          <button
            onClick={() => navigate('/admin/orders')}
            className="text-xs text-white px-3 py-1.5 rounded-[8px] transition"
            style={{ background: '#147BA6' }}
          >
            View All Orders
          </button>
        </div>
        {latestOrders.loading ? (
          <div className="p-5">
            <ChartSkeleton height={200} />
          </div>
        ) : latestOrders.error ? (
          <ErrorBlock message={latestOrders.error} height={200} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-[#161921]">
                  {['Order ID', 'Distributor', 'Items', 'Value', 'Status', 'Delivery Date'].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-500 dark:text-[#8892A4] px-5 py-3 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-[#1E2130]">
                {(latestOrders.data ?? []).map((o) => (
                  <tr key={o.name} className="hover:bg-gray-50/60 dark:hover:bg-[#1F2233] transition">
                    <td className="px-5 py-3.5 text-xs font-mono font-semibold text-[#147BA6]">{o.name}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-800 dark:text-[#B0BAD0] whitespace-nowrap">
                      {o.customerName ?? o.customer}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-gray-700 dark:text-[#8892A4]">{o.itemCount} items</td>
                    <td className="px-5 py-3.5 text-xs font-semibold text-gray-900 dark:text-[#E8EAF0]">
                      {formatInr(o.grandTotal)}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          color: STATUS_COLORS[o.status] ?? '#6B7280',
                          background: `${STATUS_COLORS[o.status] ?? '#6B7280'}1A`,
                        }}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-gray-600 dark:text-[#8892A4]">{o.deliveryDate ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
