import { ClipboardList, PlusCircle, ShoppingCart, UserCheck, Users, type LucideIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { fetchSalesDashboard, type SalesDashboard } from '../../api/portalApi'
import { useAuth } from '../../context/AuthContext'
import { useAsyncData } from '../../hooks/useAsyncData'
import { formatInr } from '../../utils/currency'
import ChartSkeleton from '../common/ChartSkeleton'
import ErrorBlock from '../common/ErrorBlock'
import SectionCard from '../common/SectionCard'

// Same status palette the Distributor Dashboard uses, so a status badge
// reads the same colour everywhere in the app.
const STATUS_BADGE: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-600 dark:bg-[#252836] dark:text-[#8892A4]',
  'To Deliver': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  'To Bill': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  'To Deliver and Bill': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  Completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  Closed: 'bg-gray-100 text-gray-600 dark:bg-[#252836] dark:text-[#8892A4]',
  Cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

interface KpiCardProps {
  icon: LucideIcon
  color: string
  bg: string
  value: string
  label: string
  loading: boolean
}

function KpiCard({ icon: Icon, color, bg, value, label, loading }: KpiCardProps) {
  return (
    <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm p-4">
      <div className="w-9 h-9 rounded-[8px] flex items-center justify-center mb-3" style={{ background: bg }}>
        <Icon size={17} style={{ color }} />
      </div>
      {loading ? (
        <div className="animate-pulse h-7 w-14 bg-gray-100 dark:bg-[#161921] rounded" />
      ) : (
        <p className="text-3xl font-bold text-gray-900 dark:text-[#E8EAF0]">{value}</p>
      )}
      <p className="text-xs text-gray-500 dark:text-[#8892A4] font-medium uppercase tracking-wide mt-2">{label}</p>
    </div>
  )
}

interface QuickAction {
  icon: LucideIcon
  label: string
  path: string
}

const QUICK_ACTIONS: QuickAction[] = [
  { icon: PlusCircle, label: 'Create New Order', path: '/sales/create-order' },
  { icon: UserCheck, label: 'View Pending Approvals', path: '/sales/pending-approvals' },
  { icon: Users, label: 'My Customers', path: '/sales/customers' },
]

export default function SalesPersonDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const dashboard = useAsyncData<SalesDashboard>(() => fetchSalesDashboard(), [], 'sales-dashboard:main')
  const d = dashboard.data
  const loading = dashboard.loading

  return (
    <div className="p-5 lg:p-7 space-y-6">
      {/* Welcome Banner */}
      <div
        className="rounded-[12px] p-6 text-white"
        style={{ background: 'linear-gradient(135deg, #147BA6 0%, #1F8A70 100%)' }}
      >
        <p className="text-sm font-medium opacity-80 mb-1">Good morning,</p>
        <h1 className="text-2xl font-bold">{user?.name ?? 'Sales Person'}</h1>
      </div>

      {dashboard.error && <ErrorBlock message={dashboard.error} height={80} />}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          icon={Users}
          color="#147BA6"
          bg="#e8f4fa"
          value={d ? String(d.distributorCount) : '—'}
          label="My Customers"
          loading={loading}
        />
        <KpiCard
          icon={ShoppingCart}
          color="#1F8A70"
          bg="#e6f5f1"
          value={d ? String(d.ordersCreated) : '—'}
          label="Orders Created"
          loading={loading}
        />
        <KpiCard
          icon={ClipboardList}
          color="#DC6803"
          bg="#FFFBEB"
          value={d ? String(d.pendingApprovals) : '—'}
          label="Pending Approvals"
          loading={loading}
        />
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        {QUICK_ACTIONS.map(({ icon: Icon, label, path }) => (
          <button
            key={label}
            onClick={() => navigate(path)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-[8px] text-sm font-semibold text-white transition hover:brightness-95"
            style={{ background: 'linear-gradient(135deg, #147BA6, #1F8A70)' }}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* Recent Activity Table */}
      <SectionCard title="Recent Activity">
        {loading ? (
          <ChartSkeleton height={220} />
        ) : (d?.recentOrders.length ?? 0) === 0 ? (
          <p className="py-8 text-center text-xs text-gray-400 dark:text-[#5A6075]">No orders yet.</p>
        ) : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-[#161921] border-y border-gray-100 dark:border-[#252836]">
                  {['Order ID', 'Customer', 'Amount', 'Status', 'Sent On'].map((h) => (
                    <th
                      key={h}
                      className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-[#8892A4] uppercase tracking-wide"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d?.recentOrders.map((order) => (
                  <tr
                    key={order.name}
                    className="border-b border-gray-50 dark:border-[#252836] last:border-0 hover:bg-gray-50/50 dark:hover:bg-[#161921]/60 transition-colors"
                  >
                    <td className="px-5 py-3 font-mono text-xs font-semibold text-[#147BA6]">{order.name}</td>
                    <td className="px-5 py-3 text-gray-900 dark:text-[#E8EAF0] font-medium">
                      {order.customerName ?? order.customer}
                    </td>
                    <td className="px-5 py-3 text-gray-900 dark:text-[#E8EAF0] font-semibold">
                      {formatInr(order.grandTotal)}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[order.status] ?? 'bg-gray-100 text-gray-600'}`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500 dark:text-[#8892A4]">{formatDate(order.transactionDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
