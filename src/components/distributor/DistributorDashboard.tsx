import {
  AlertCircle,
  Archive,
  CheckCircle,
  Clock,
  FileText,
  Plus,
  ShoppingCart,
  Tag,
  TrendingUp,
  Truck,
  UserCheck,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
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
import { fetchActiveOffers, type ActiveOffer } from '../../api/offersApi'
import type { OrderListItem } from '../../api/ordersApi'
import {
  approvePendingOrder,
  fetchPendingApprovalOrders,
  fetchPortalDashboard,
  fetchPortalOrders,
  rejectPendingOrder,
  type PortalDashboard,
} from '../../api/portalApi'
import { useChartTheme } from '../../context/ThemeContext'
import { useAsyncData } from '../../hooks/useAsyncData'
import { ApiError } from '../../types/auth'
import { formatInr } from '../../utils/currency'
import ChartSkeleton from '../common/ChartSkeleton'
import ErrorBlock from '../common/ErrorBlock'
import SectionCard from '../common/SectionCard'

// Same status palette the Admin Dashboard uses, so a status reads the same
// colour on both dashboards.
const STATUS_COLORS: Record<string, string> = {
  Draft: '#9CA3AF',
  'To Deliver': '#4AA3FF',
  'To Bill': '#7C3AED',
  'To Deliver and Bill': '#F59E0B',
  Completed: '#1F8A70',
  Closed: '#6B7280',
  Cancelled: '#DC2626',
}

const OFFER_GRADIENTS = [
  'from-[#147BA6] to-[#0d4f70]',
  'from-[#1F8A70] to-[#155f4e]',
  'from-[#7C3AED] to-[#5b21b6]',
  'from-[#DC6803] to-[#b54708]',
]

const RECENT_STATUS_BADGE: Record<string, string> = {
  Completed: 'bg-green-100 text-green-700',
  'To Deliver': 'bg-blue-100 text-blue-700',
  'To Bill': 'bg-purple-100 text-purple-700',
  'To Deliver and Bill': 'bg-amber-100 text-amber-700',
  Draft: 'bg-gray-100 text-gray-600',
  Cancelled: 'bg-red-100 text-red-700',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

interface QuickAction {
  icon: LucideIcon
  label: string
  color: string
  bg: string
  path: string
}

const QUICK_ACTIONS: QuickAction[] = [
  { icon: Plus, label: 'New Order', color: '#147BA6', bg: '#e8f4fa', path: '/distributor/products' },
  { icon: Truck, label: 'Track Shipment', color: '#1F8A70', bg: '#e6f5f1', path: '/distributor/track-shipment' },
  { icon: FileText, label: 'Download Invoice', color: '#7C3AED', bg: '#F5F3FF', path: '/distributor/invoices' },
  { icon: Archive, label: 'Inventory', color: '#F59E0B', bg: '#FFFBEB', path: '/distributor/inventory' },
  { icon: Users, label: 'End User Records', color: '#DC2626', bg: '#FEF2F2', path: '/distributor/end-users' },
]

interface KpiCardProps {
  icon: LucideIcon
  color: string
  bg: string
  value: string
  label: string
  change?: string
  loading: boolean
}

function KpiCard({ icon: Icon, color, bg, value, label, change, loading }: KpiCardProps) {
  return (
    <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] p-4 border border-gray-100 dark:border-[#252836] shadow-sm hover:shadow-md transition">
      <div className="w-9 h-9 rounded-[8px] flex items-center justify-center mb-3" style={{ background: bg }}>
        <Icon size={17} style={{ color }} />
      </div>
      {loading ? (
        <div className="animate-pulse h-6 w-16 bg-gray-100 dark:bg-[#161921] rounded" />
      ) : (
        <p className="text-xl font-bold text-gray-900 dark:text-[#E8EAF0]">{value}</p>
      )}
      <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-0.5 leading-tight">{label}</p>
      {change && <p className="text-[10px] font-medium mt-1 text-gray-400 dark:text-[#5A6075]">{change}</p>}
    </div>
  )
}

function OffersCarousel() {
  const offers = useAsyncData<ActiveOffer[]>(() => fetchActiveOffers(), [], 'dist-dashboard:offers')

  if (offers.loading) return <ChartSkeleton height={168} />
  if (offers.error) return <ErrorBlock message={offers.error} height={120} />
  if (!offers.data || offers.data.length === 0) {
    return (
      <div className="text-xs text-gray-400 dark:text-[#5A6075] border border-dashed border-gray-200 dark:border-[#252836] rounded-[12px] px-5 py-6 text-center">
        No active offers right now.
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <Tag size={14} className="text-[#147BA6]" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0]">Exclusive Offers</h3>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#e8f4fa] dark:bg-[rgba(20,123,166,0.15)] text-[#147BA6]">
            {offers.data.length} active
          </span>
        </div>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-thin">
        {offers.data.map((offer, i) => (
          <div
            key={offer.id}
            className={`flex-shrink-0 w-72 rounded-[14px] bg-gradient-to-br ${OFFER_GRADIENTS[i % OFFER_GRADIENTS.length]} text-white p-5 snap-start relative overflow-hidden`}
          >
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/5 -translate-y-8 translate-x-8 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-20 h-20 rounded-full bg-white/5 translate-y-6 -translate-x-6 pointer-events-none" />
            <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-sm mb-3">
              {offer.discountPercent > 0 ? `${offer.discountPercent}% OFF` : 'OFFER'}
            </span>
            <h4 className="text-sm font-bold leading-tight">{offer.title}</h4>
            <p className="text-[11px] text-white/80 mt-1.5 leading-snug line-clamp-3">{offer.description}</p>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-[10px] text-white/60">Valid till {formatDate(offer.endDate)}</span>
              <span className="text-[10px] text-white/70">
                {offer.appliesToAll ? 'All products' : `${offer.productItemCodes.length} products`}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PendingApprovals() {
  const navigate = useNavigate()
  const pending = useAsyncData<OrderListItem[]>(
    () => fetchPendingApprovalOrders(),
    [],
    'dist-dashboard:pending-approval',
  )
  const [resolved, setResolved] = useState<Record<string, 'approved' | 'rejected'>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function act(name: string, action: 'approve' | 'reject') {
    setBusy(name)
    setActionError(null)
    try {
      await (action === 'approve' ? approvePendingOrder(name) : rejectPendingOrder(name))
      setResolved((prev) => ({ ...prev, [name]: action === 'approve' ? 'approved' : 'rejected' }))
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not update the order.')
    } finally {
      setBusy(null)
    }
  }

  const rows = (pending.data ?? []).filter((o) => !resolved[o.name])
  const count = rows.length

  return (
    <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-[#147BA6]/20 dark:border-[rgba(20,123,166,0.25)] shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-[#252836]">
        <div className="flex items-center gap-2">
          <UserCheck size={15} className="text-[#147BA6]" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0]">Orders Awaiting Your Approval</h3>
          {count > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#147BA6] text-white">{count}</span>
          )}
        </div>
        <span className="text-xs text-gray-400 dark:text-[#5A6075]">From your sales team</span>
      </div>

      {pending.loading ? (
        <div className="p-5">
          <ChartSkeleton height={120} />
        </div>
      ) : pending.error ? (
        <ErrorBlock message={pending.error} height={120} />
      ) : count === 0 ? (
        <p className="px-5 py-8 text-center text-xs text-gray-400 dark:text-[#5A6075]">
          No orders are waiting for your approval.
        </p>
      ) : (
        <div className="divide-y divide-gray-50 dark:divide-[#252836]">
          {actionError && <p className="px-5 py-2 text-[11px] text-red-600 bg-red-50 dark:bg-[rgba(220,38,38,0.1)]">{actionError}</p>}
          {rows.map((order) => (
            <div key={order.name} className="flex items-center justify-between px-5 py-3 gap-3">
              <div>
                <button
                  onClick={() => navigate(`/distributor/active-orders`)}
                  className="text-xs font-semibold text-[#147BA6] font-mono hover:underline"
                >
                  {order.name}
                </button>
                <p className="text-[10px] text-gray-400 dark:text-[#5A6075] mt-0.5">
                  {order.itemCount} items · {formatDate(order.transactionDate)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-900 dark:text-[#E8EAF0]">{formatInr(order.grandTotal)}</span>
                <button
                  onClick={() => act(order.name, 'approve')}
                  disabled={busy === order.name}
                  className="px-2.5 py-1 text-[10px] font-semibold text-white rounded-[6px] transition hover:brightness-95 disabled:opacity-50"
                  style={{ background: '#1F8A70' }}
                >
                  Approve
                </button>
                <button
                  onClick={() => act(order.name, 'reject')}
                  disabled={busy === order.name}
                  className="px-2.5 py-1 text-[10px] font-semibold text-red-600 bg-red-50 dark:bg-[rgba(220,38,38,0.1)] rounded-[6px] hover:bg-red-100 transition disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RecentOrders() {
  const navigate = useNavigate()
  const recent = useAsyncData(() => fetchPortalOrders({ page: 1, pageSize: 8 }), [], 'dist-dashboard:recent-orders')

  return (
    <SectionCard
      title="Recent Orders"
      action={
        <button onClick={() => navigate('/distributor/active-orders')} className="text-xs text-[#147BA6] hover:underline">
          View All
        </button>
      }
    >
      {recent.loading ? (
        <ChartSkeleton height={200} />
      ) : recent.error ? (
        <ErrorBlock message={recent.error} height={200} />
      ) : (recent.data?.items.length ?? 0) === 0 ? (
        <p className="py-8 text-center text-xs text-gray-400 dark:text-[#5A6075]">No orders yet.</p>
      ) : (
        <div className="space-y-3">
          {recent.data?.items.map((o) => (
            <div
              key={o.name}
              className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-[#252836] last:border-0"
            >
              <div>
                <p className="text-xs font-semibold text-[#147BA6] font-mono">{o.name}</p>
                <p className="text-[10px] text-gray-400 dark:text-[#5A6075]">
                  {o.itemCount} items · {formatDate(o.transactionDate)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-gray-900 dark:text-[#E8EAF0]">{formatInr(o.grandTotal)}</p>
                <span
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${RECENT_STATUS_BADGE[o.status] ?? 'bg-gray-100 text-gray-600'}`}
                >
                  {o.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

export default function DistributorDashboard() {
  const { grid, axis, tooltip } = useChartTheme()
  const navigate = useNavigate()
  const dashboard = useAsyncData<PortalDashboard>(() => fetchPortalDashboard(), [], 'dist-dashboard:main')

  const k = dashboard.data?.kpis
  const loading = dashboard.loading

  const kpiCards: KpiCardProps[] = [
    {
      icon: ShoppingCart,
      color: '#147BA6',
      bg: '#e8f4fa',
      value: k ? String(k.totalOrders) : '—',
      label: 'Total Orders',
      change: 'Trailing 12 months',
      loading,
    },
    {
      icon: Clock,
      color: '#F59E0B',
      bg: '#FFFBEB',
      value: k ? String(k.pendingOrders) : '—',
      label: 'Pending Orders',
      change: k ? `${formatInr(k.pendingValue)} pending value` : undefined,
      loading,
    },
    {
      icon: CheckCircle,
      color: '#16A34A',
      bg: '#F0FDF4',
      value: k ? String(k.completedOrders) : '—',
      label: 'Completed Orders',
      change: k?.fulfillmentPct != null ? `${k.fulfillmentPct}% fulfillment` : undefined,
      loading,
    },
    {
      icon: TrendingUp,
      color: '#1F8A70',
      bg: '#e6f5f1',
      value: k ? formatInr(k.totalPurchaseValue) : '—',
      label: 'Total Purchase Value',
      change: 'Trailing 12 months',
      loading,
    },
    {
      icon: AlertCircle,
      color: '#DC2626',
      bg: '#FEF2F2',
      value: k ? (k.outstandingAvailable ? formatInr(k.outstandingAmount) : 'Unavailable') : '—',
      label: 'Outstanding Amount',
      change: k
        ? k.outstandingAvailable
          ? `${k.overdueInvoiceCount} invoice${k.overdueInvoiceCount === 1 ? '' : 's'} overdue`
          : 'Invoice access pending'
        : undefined,
      loading,
    },
  ]

  const orderStatus = (dashboard.data?.orderStatus ?? []).filter((s) => s.count > 0)
  const topProducts = dashboard.data?.topProducts ?? []

  return (
    <div className="p-5 lg:p-7 space-y-6">
      {/* Welcome */}
      <div className="bg-gradient-to-r from-[#147BA6] to-[#0f5f82] rounded-[14px] p-5 text-white">
        <p className="text-sm font-medium text-blue-200">Welcome back,</p>
        {loading ? (
          <div className="animate-pulse h-6 w-40 bg-white/20 rounded mt-1" />
        ) : (
          <h2 className="text-xl font-bold mt-0.5">{dashboard.data?.welcome.name ?? 'Distributor'}</h2>
        )}
        {dashboard.data?.welcome.company && (
          <p className="text-sm text-blue-200 mt-1">{dashboard.data.welcome.company}</p>
        )}
      </div>

      {dashboard.error && <ErrorBlock message={dashboard.error} height={80} />}

      {/* Offers Carousel */}
      <OffersCarousel />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {kpiCards.map((card) => (
          <KpiCard key={card.label} {...card} />
        ))}
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] p-5 border border-gray-100 dark:border-[#252836] shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0] mb-4">Quick Actions</h3>
        <div className="flex flex-wrap gap-3">
          {QUICK_ACTIONS.map(({ icon: Icon, label, color, bg, path }) => (
            <button
              key={label}
              onClick={() => navigate(path)}
              className="flex items-center gap-2.5 px-4 py-3 rounded-[10px] border border-gray-100 dark:border-[#252836] hover:border-gray-200 dark:hover:border-[#353848] hover:shadow-sm transition"
              style={{ background: bg }}
            >
              <Icon size={16} style={{ color }} />
              <span className="text-sm font-medium" style={{ color }}>
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Pending Approvals */}
      <PendingApprovals />

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2">
          <SectionCard title="Monthly Purchase Trend" subtitle="Orders and purchase value · trailing 12 months">
            {loading ? (
              <ChartSkeleton height={200} />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={dashboard.data?.monthlyTrend ?? []} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="distGrad" x1="0" y1="0" x2="0" y2="1">
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
                  <Tooltip formatter={(v) => [formatInr(Number(v)), 'Purchase Value']} contentStyle={tooltip} />
                  <Area type="monotone" dataKey="value" stroke="#147BA6" strokeWidth={2} fill="url(#distGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        </div>

        <SectionCard title="Order Status" subtitle="Trailing 12 months">
          {loading ? (
            <ChartSkeleton height={200} />
          ) : orderStatus.length === 0 ? (
            <p className="py-12 text-center text-xs text-gray-400 dark:text-[#5A6075]">No orders in this period.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie
                    data={orderStatus}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={60}
                    paddingAngle={2}
                    dataKey="count"
                    nameKey="status"
                  >
                    {orderStatus.map((entry) => (
                      <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? '#6B7280'} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltip} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {orderStatus.map((s) => (
                  <div key={s.status} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[s.status] ?? '#6B7280' }} />
                      <span className="text-xs text-gray-600 dark:text-[#8892A4]">{s.status}</span>
                    </div>
                    <span className="text-xs font-bold text-gray-900 dark:text-[#E8EAF0]">{s.count}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </SectionCard>
      </div>

      {/* Top Products + Recent Orders */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <SectionCard title="Top Purchased Products" subtitle="By revenue · trailing 12 months">
          {loading ? (
            <ChartSkeleton height={160} />
          ) : topProducts.length === 0 ? (
            <p className="py-12 text-center text-xs text-gray-400 dark:text-[#5A6075]">No product data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart
                data={topProducts.map((p) => ({
                  ...p,
                  label: (p.itemName ?? p.itemCode).length > 22 ? `${(p.itemName ?? p.itemCode).slice(0, 21)}…` : p.itemName ?? p.itemCode,
                }))}
                layout="vertical"
                margin={{ left: 0, right: 10, top: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={grid} horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: axis }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => formatInr(v)}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ fontSize: 10, fill: axis }}
                  axisLine={false}
                  tickLine={false}
                  width={130}
                />
                <Tooltip formatter={(v) => [formatInr(Number(v)), 'Revenue']} contentStyle={tooltip} />
                <Bar dataKey="revenue" fill="#1F8A70" radius={[0, 4, 4, 0]} barSize={12} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <RecentOrders />
      </div>
    </div>
  )
}
