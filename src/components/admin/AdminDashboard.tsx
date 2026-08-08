import { Eye, TrendingDown, TrendingUp } from 'lucide-react'
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
import { useChartTheme } from '../../context/ThemeContext'
import { useAdminDashboardData, type OrderRowStatus } from '../../hooks/useAdminDashboardData'
import { formatInr } from '../../utils/currency'
import DistributorFilterSelect from '../layout/DistributorFilterSelect'

const STATUS_STYLE: Record<OrderRowStatus, string> = {
  Shipped: 'bg-blue-100 text-blue-700',
  Confirmed: 'bg-emerald-100 text-emerald-700',
  Pending: 'bg-amber-100 text-amber-700',
  Delivered: 'bg-green-100 text-green-700',
  Cancelled: 'bg-red-100 text-red-700',
}

export default function AdminDashboard() {
  const { grid, axis, tooltip } = useChartTheme()
  const { kpis, revenueTrend, topProducts, orderStatus, fulfillmentStats, latestOrders, activities, quickActions } =
    useAdminDashboardData()

  return (
    <div className="p-5 lg:p-7 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-[#E8EAF0]">Overview</h1>
          <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-0.5">Real-time snapshot across all distributors</p>
        </div>
        <DistributorFilterSelect />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map((k) => {
          const Icon = k.icon
          return (
            <div
              key={k.label}
              className="bg-white dark:bg-[#1A1D2E] rounded-[12px] p-4 border border-gray-100 dark:border-[#252836] shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-[8px] flex items-center justify-center" style={{ background: k.bg }}>
                  <Icon size={18} style={{ color: k.color }} />
                </div>
                <span className={`flex items-center gap-0.5 text-xs font-semibold ${k.up ? 'text-green-600' : 'text-red-500'}`}>
                  {k.up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                </span>
              </div>
              <p className="text-xl font-bold text-gray-900 dark:text-[#E8EAF0]">{k.value}</p>
              <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-1 leading-tight">{k.label}</p>
              <p className={`text-[10px] font-medium mt-1 ${k.up ? 'text-green-600' : 'text-red-500'}`}>{k.change}</p>
            </div>
          )
        })}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 bg-white dark:bg-[#1A1D2E] rounded-[12px] p-5 border border-gray-100 dark:border-[#252836] shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0]">Revenue Trend</h3>
              <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-0.5">Monthly revenue vs forecast · FY 2025–26</p>
            </div>
            <div className="flex gap-2">
              {['Monthly', 'Quarterly', 'Yearly'].map((t, i) => (
                <button
                  key={t}
                  className={`text-xs px-2.5 py-1 rounded-full transition ${i === 0 ? 'bg-[#147BA6] text-white' : 'text-gray-500 dark:text-[#8892A4] hover:bg-gray-100 dark:hover:bg-[#1F2233]'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={revenueTrend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#147BA6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#147BA6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="foreGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1F8A70" stopOpacity={0.1} />
                  <stop offset="95%" stopColor="#1F8A70" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={grid} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: axis }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: axis }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => formatInr(v)}
                width={55}
              />
              <Tooltip formatter={(v) => [formatInr(Number(v)), '']} contentStyle={tooltip} />
              <Area
                type="monotone"
                dataKey="forecast"
                stroke="#1F8A70"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                fill="url(#foreGrad)"
                name="Forecast"
              />
              <Area type="monotone" dataKey="revenue" stroke="#147BA6" strokeWidth={2} fill="url(#revGrad)" name="Revenue" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] p-5 border border-gray-100 dark:border-[#252836] shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0] mb-1">Order Fulfillment</h3>
          <p className="text-xs text-gray-500 dark:text-[#8892A4] mb-4">Current period status breakdown</p>
          <div className="flex justify-center">
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={orderStatus} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={2} dataKey="value">
                  {orderStatus.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => [Number(v), 'Orders']} contentStyle={tooltip} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2 mt-3">
            {orderStatus.map((s) => (
              <div key={s.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                  <span className="text-xs text-gray-600 dark:text-[#8892A4]">{s.name}</span>
                </div>
                <span className="text-xs font-semibold text-gray-900 dark:text-[#E8EAF0]">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] p-5 border border-gray-100 dark:border-[#252836] shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0] mb-1">Top 10 Products</h3>
          <p className="text-xs text-gray-500 dark:text-[#8892A4] mb-4">By revenue · This year</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={topProducts} layout="vertical" margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={grid} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: axis }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatInr(v)} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: axis }} axisLine={false} tickLine={false} width={120} />
              <Tooltip formatter={(v) => [formatInr(Number(v)), 'Revenue']} contentStyle={tooltip} />
              <Bar dataKey="value" fill="#147BA6" radius={[0, 4, 4, 0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            {fulfillmentStats.map(({ label, value, color, icon: Icon }) => (
              <div
                key={label}
                className="bg-white dark:bg-[#1A1D2E] rounded-[12px] p-4 border border-gray-100 dark:border-[#252836] shadow-sm text-center"
              >
                <Icon size={22} style={{ color }} className="mx-auto mb-2" />
                <p className="text-lg font-bold text-gray-900 dark:text-[#E8EAF0]">{value}</p>
                <p className="text-[10px] text-gray-500 dark:text-[#8892A4] mt-0.5 leading-tight">{label}</p>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] p-5 border border-gray-100 dark:border-[#252836] shadow-sm flex-1">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0] mb-4">Recent Activity</h3>
            <div className="space-y-3">
              {activities.map((a, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div
                    className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                      a.type === 'success'
                        ? 'bg-green-500'
                        : a.type === 'warning'
                          ? 'bg-amber-400'
                          : a.type === 'error'
                            ? 'bg-red-500'
                            : 'bg-[#147BA6]'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-700 dark:text-[#B0BAD0] leading-tight">{a.text}</p>
                    <p className="text-[10px] text-gray-400 dark:text-[#5A6075] mt-0.5">{a.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Latest Orders Table */}
      <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-[#252836]">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0]">Latest Orders</h3>
            <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-0.5">Real-time order tracking across all distributors</p>
          </div>
          <div className="flex gap-2">
            <button className="text-xs text-gray-600 dark:text-[#8892A4] border border-gray-200 dark:border-[#252836] px-3 py-1.5 rounded-[8px] hover:bg-gray-50 dark:hover:bg-[#1F2233] transition">
              Export CSV
            </button>
            <button className="text-xs text-white px-3 py-1.5 rounded-[8px] transition" style={{ background: '#147BA6' }}>
              View All Orders
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-[#161921]">
                {['Order ID', 'Distributor', 'Items', 'Value', 'Status', 'Delivery Date', 'Actions'].map((h) => (
                  <th
                    key={h}
                    className="text-left text-xs font-semibold text-gray-500 dark:text-[#8892A4] px-5 py-3 whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-[#1E2130]">
              {latestOrders.map((o) => (
                <tr key={o.id} className="hover:bg-gray-50/60 dark:hover:bg-[#1F2233] transition">
                  <td className="px-5 py-3.5 text-xs font-mono font-semibold text-[#147BA6]">{o.id}</td>
                  <td className="px-5 py-3.5 text-xs text-gray-800 dark:text-[#B0BAD0] whitespace-nowrap">{o.distributor}</td>
                  <td className="px-5 py-3.5 text-xs text-gray-700 dark:text-[#8892A4]">{o.items} items</td>
                  <td className="px-5 py-3.5 text-xs font-semibold text-gray-900 dark:text-[#E8EAF0]">
                    ₹{o.value.toLocaleString('en-IN')}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[o.status]}`}>
                      {o.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-gray-600 dark:text-[#8892A4]">{o.delivery}</td>
                  <td className="px-5 py-3.5">
                    <button className="text-gray-400 hover:text-[#147BA6] transition">
                      <Eye size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 dark:border-[#252836]">
          <span className="text-xs text-gray-500 dark:text-[#8892A4]">Showing {latestOrders.length} of 750 orders</span>
          <div className="flex gap-1">
            {[1, 2, 3, '...', 125].map((p, i) => (
              <button
                key={i}
                className={`w-7 h-7 text-xs rounded-[6px] transition ${p === 1 ? 'bg-[#147BA6] text-white' : 'text-gray-600 dark:text-[#8892A4] hover:bg-gray-100 dark:hover:bg-[#1F2233]'}`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] p-5 border border-gray-100 dark:border-[#252836] shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0] mb-4">Quick Actions</h3>
        <div className="flex flex-wrap gap-3">
          {quickActions.map(({ icon: Icon, label, color }) => (
            <button
              key={label}
              className="flex items-center gap-2 px-4 py-2.5 rounded-[8px] border border-gray-200 dark:border-[#252836] text-sm font-medium text-gray-700 dark:text-[#B0BAD0] hover:border-gray-300 dark:hover:border-[#353848] hover:shadow-sm transition"
            >
              <Icon size={15} style={{ color }} />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
