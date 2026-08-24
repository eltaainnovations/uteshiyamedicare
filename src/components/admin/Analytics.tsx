import { TrendingDown, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
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
  Treemap,
  XAxis,
  YAxis,
} from 'recharts'
import {
  fetchDistributorCohort,
  fetchDistributorPerformance,
  fetchOrderFulfillment,
  fetchRevenueTrend,
  fetchTopProducts,
  type DistributorCohort,
  type DistributorPerformance,
  type DistributorPerformanceItem,
  type Granularity,
  type OrderFulfillment,
  type RevenueTrend,
  type TopProducts,
} from '../../api/analyticsApi'
import { useChartTheme } from '../../context/ThemeContext'
import { useAsyncData } from '../../hooks/useAsyncData'
import { formatInr } from '../../utils/currency'
import ChartSkeleton from '../common/ChartSkeleton'
import DistributorTypeahead from '../common/DistributorTypeahead'
import ErrorBlock from '../common/ErrorBlock'
import SectionCard from '../common/SectionCard'
import ToggleGroup from '../common/ToggleGroup'

const PALETTE = ['#147BA6', '#1F8A70', '#7C3AED', '#4AA3FF', '#F59E0B', '#DC2626', '#0EA5E9', '#84CC16']
const STATUS_COLORS: Record<string, string> = {
  Draft: '#9CA3AF',
  'To Deliver': '#4AA3FF',
  'To Bill': '#7C3AED',
  'To Deliver and Bill': '#F59E0B',
  Completed: '#1F8A70',
  Closed: '#6B7280',
  Cancelled: '#DC2626',
}
const GRANULARITIES: Granularity[] = ['daily', 'weekly', 'monthly']

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function defaultFromDate(): string {
  const d = new Date()
  d.setDate(d.getDate() - 89)
  return isoDate(d)
}
function defaultToDate(): string {
  return isoDate(new Date())
}
function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}


interface TreemapNodeProps {
  x?: number
  y?: number
  width?: number
  height?: number
  index?: number
  payload?: DistributorPerformanceItem
}

function TreemapNode({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  index = 0,
  payload,
  onSelect,
}: TreemapNodeProps & { onSelect: (customer: string, label: string) => void }) {
  if (!payload || width < 2 || height < 2) return null
  const color = PALETTE[index % PALETTE.length]
  const canLabel = width > 55 && height > 28
  const clickable = Boolean(payload.customer)
  const label = truncate(payload.distributor, 20)

  return (
    <g
      onClick={() => clickable && onSelect(payload.customer as string, payload.distributor)}
      style={{ cursor: clickable ? 'pointer' : 'default' }}
    >
      <rect x={x} y={y} width={width} height={height} fill={color} stroke="#fff" strokeWidth={2} rx={3} />
      {canLabel && (
        <>
          <text x={x + 6} y={y + 16} fontSize={11} fontWeight={600} fill="#fff">
            {label}
          </text>
          <text x={x + 6} y={y + 30} fontSize={10} fill="#fff" opacity={0.85}>
            {payload.revenueSharePct}%
          </text>
        </>
      )}
    </g>
  )
}

export default function Analytics() {
  const { grid, axis, tooltip } = useChartTheme()

  const [fromDate, setFromDate] = useState(defaultFromDate())
  const [toDate, setToDate] = useState(defaultToDate())
  const [customer, setCustomer] = useState<string | null>(null)
  const [customerLabel, setCustomerLabel] = useState<string | null>(null)
  const [granularity, setGranularity] = useState<Granularity>('monthly')
  const [productMetric, setProductMetric] = useState<'revenue' | 'qty'>('revenue')

  function drillDown(name: string, label: string) {
    setCustomer(name)
    setCustomerLabel(label)
  }

  const filters = { fromDate, toDate, customer: customer ?? undefined, granularity }

  const revenue = useAsyncData<RevenueTrend>(() => fetchRevenueTrend(filters), [fromDate, toDate, customer, granularity])
  const distPerf = useAsyncData<DistributorPerformance>(
    () => fetchDistributorPerformance(filters),
    [fromDate, toDate, customer],
  )
  const topProducts = useAsyncData<TopProducts>(() => fetchTopProducts(filters), [fromDate, toDate, customer])
  const fulfillment = useAsyncData<OrderFulfillment>(
    () => fetchOrderFulfillment(filters),
    [fromDate, toDate, customer, granularity],
  )
  const cohort = useAsyncData<DistributorCohort>(() => fetchDistributorCohort(filters), [fromDate, toDate, customer])

  const topProductsSorted = useMemo(() => {
    if (!topProducts.data) return []
    return [...topProducts.data.items]
      .sort((a, b) => b[productMetric] - a[productMetric])
      .slice(0, 10)
      .map((p) => {
        const fullLabel = p.itemName ?? p.itemCode
        return { ...p, fullLabel, label: truncate(fullLabel, 26) }
      })
  }, [topProducts.data, productMetric])

  const top10Distributors = useMemo(
    () =>
      (distPerf.data?.items.slice(0, 10) ?? []).map((d) => ({ ...d, label: truncate(d.distributor, 22) })),
    [distPerf.data],
  )

  return (
    <div className="p-5 lg:p-7 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-[#E8EAF0]">Analytics</h2>
        <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-0.5">
          Deep, filterable views across every distributor and order — live from ERPNext
        </p>
      </div>

      {/* Global filter bar — affects every chart below */}
      <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] p-4 border border-gray-100 dark:border-[#252836] shadow-sm flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-[10px] font-medium text-gray-500 dark:text-[#8892A4] mb-1">From</label>
          <input
            type="date"
            value={fromDate}
            max={toDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] dark:text-[#E8EAF0] rounded-[8px] outline-none focus:border-[#147BA6] transition"
          />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-500 dark:text-[#8892A4] mb-1">To</label>
          <input
            type="date"
            value={toDate}
            min={fromDate}
            onChange={(e) => setToDate(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] dark:text-[#E8EAF0] rounded-[8px] outline-none focus:border-[#147BA6] transition"
          />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-500 dark:text-[#8892A4] mb-1">Distributor</label>
          <DistributorTypeahead
            value={customer}
            label={customerLabel}
            onSelect={(name, label) => {
              setCustomer(name)
              setCustomerLabel(label)
            }}
          />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-500 dark:text-[#8892A4] mb-1">Granularity</label>
          <ToggleGroup options={GRANULARITIES} value={granularity} onChange={setGranularity} />
        </div>
      </div>

      {/* 1. Revenue Trend */}
      <SectionCard
        title="Revenue Trend"
        subtitle={revenue.data ? `Total: ${formatInr(revenue.data.currentTotal)}` : undefined}
        action={
          revenue.data && revenue.data.changePct !== null ? (
            <span
              className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
                revenue.data.changePct >= 0 ? 'text-green-700 bg-green-50' : 'text-red-600 bg-red-50'
              }`}
            >
              {revenue.data.changePct >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {revenue.data.changePct >= 0 ? '+' : ''}
              {revenue.data.changePct}% vs previous period
            </span>
          ) : revenue.data ? (
            <span className="text-xs text-gray-400 dark:text-[#5A6075]">No prior-period data to compare</span>
          ) : undefined
        }
      >
        {revenue.loading ? (
          <ChartSkeleton />
        ) : revenue.error ? (
          <ErrorBlock message={revenue.error} />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={revenue.data?.points ?? []} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="analyticsRevGrad" x1="0" y1="0" x2="0" y2="1">
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
              <Area type="monotone" dataKey="revenue" stroke="#147BA6" strokeWidth={2} fill="url(#analyticsRevGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      {/* 2 + 3. Top 10 Distributors + Turnover treemap — one fetch, two views */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <SectionCard title="Top 10 Distributors" subtitle="Click a bar to filter every chart by that distributor">
          {distPerf.loading ? (
            <ChartSkeleton height={300} />
          ) : distPerf.error ? (
            <ErrorBlock message={distPerf.error} height={300} />
          ) : top10Distributors.length === 0 ? (
            <ErrorBlock message="No orders in this range." height={300} />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={top10Distributors} layout="vertical" margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
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
                <Tooltip
                  formatter={(v) => [formatInr(Number(v)), 'Value']}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.distributor ?? ''}
                  contentStyle={tooltip}
                />
                <Bar
                  dataKey="totalValue"
                  radius={[0, 4, 4, 0]}
                  barSize={14}
                  cursor="pointer"
                  onClick={(data: unknown) => {
                    const item = data as DistributorPerformanceItem
                    if (item.customer) drillDown(item.customer, item.distributor)
                  }}
                >
                  {top10Distributors.map((entry, i) => (
                    <Cell key={entry.distributor} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard title="Distributor-wise Turnover" subtitle="Sized by revenue share in range">
          {distPerf.loading ? (
            <ChartSkeleton height={300} />
          ) : distPerf.error ? (
            <ErrorBlock message={distPerf.error} height={300} />
          ) : !distPerf.data || distPerf.data.items.length === 0 ? (
            <ErrorBlock message="No orders in this range." height={300} />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <Treemap
                data={distPerf.data.items as unknown as Record<string, unknown>[]}
                dataKey="totalValue"
                stroke="#fff"
                content={(props: TreemapNodeProps) => <TreemapNode {...props} onSelect={drillDown} />}
              />
            </ResponsiveContainer>
          )}
        </SectionCard>
      </div>

      {/* 4. Top 10 Products + 6. New vs Repeat */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2">
          <SectionCard
            title="Top 10 Products"
            action={
              <ToggleGroup
                options={['revenue', 'qty'] as const}
                value={productMetric}
                onChange={setProductMetric}
                labels={{ revenue: 'By Revenue', qty: 'By Quantity' }}
              />
            }
          >
            {topProducts.loading ? (
              <ChartSkeleton height={300} />
            ) : topProducts.error ? (
              <ErrorBlock message={topProducts.error} height={300} />
            ) : topProductsSorted.length === 0 ? (
              <ErrorBlock message="No orders in this range." height={300} />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topProductsSorted} layout="vertical" margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={grid} horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: axis }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => (productMetric === 'revenue' ? formatInr(v) : String(v))}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    tick={{ fontSize: 10, fill: axis }}
                    axisLine={false}
                    tickLine={false}
                    width={150}
                  />
                  <Tooltip
                    formatter={(v) => [productMetric === 'revenue' ? formatInr(Number(v)) : v, productMetric === 'revenue' ? 'Revenue' : 'Qty']}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.fullLabel ?? ''}
                    contentStyle={tooltip}
                  />
                  <Bar dataKey={productMetric} fill="#7C3AED" radius={[0, 4, 4, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        </div>

        <SectionCard title="New vs. Repeat Distributors" subtitle="First order in range vs. returning">
          {cohort.loading ? (
            <ChartSkeleton height={180} />
          ) : cohort.error ? (
            <ErrorBlock message={cohort.error} height={180} />
          ) : (
            (() => {
              const total = (cohort.data?.newCount ?? 0) + (cohort.data?.repeatCount ?? 0)
              const newPct = total > 0 ? ((cohort.data?.newCount ?? 0) / total) * 100 : 0
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 dark:bg-[#161921] rounded-[10px] p-4 text-center">
                      <p className="text-2xl font-bold text-[#147BA6]">{cohort.data?.newCount ?? 0}</p>
                      <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-1">New</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-[#161921] rounded-[10px] p-4 text-center">
                      <p className="text-2xl font-bold text-[#1F8A70]">{cohort.data?.repeatCount ?? 0}</p>
                      <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-1">Repeat</p>
                    </div>
                  </div>
                  {total > 0 && (
                    <div className="h-2.5 rounded-full overflow-hidden flex bg-gray-100 dark:bg-[#161921]">
                      <div style={{ width: `${newPct}%`, background: '#147BA6' }} />
                      <div style={{ width: `${100 - newPct}%`, background: '#1F8A70' }} />
                    </div>
                  )}
                </div>
              )
            })()
          )}
        </SectionCard>
      </div>

      {/* 5. Order Fulfillment Breakdown */}
      <SectionCard title="Order Fulfillment Breakdown">
        {fulfillment.loading ? (
          <ChartSkeleton height={380} />
        ) : fulfillment.error ? (
          <ErrorBlock message={fulfillment.error} height={380} />
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3 mb-5">
              {fulfillment.data?.totals.map((t) => (
                <div key={t.status} className="bg-gray-50 dark:bg-[#161921] rounded-[8px] p-3 text-center">
                  <p className="text-lg font-bold" style={{ color: STATUS_COLORS[t.status] ?? '#6B7280' }}>
                    {t.count}
                  </p>
                  <p className="text-[10px] text-gray-500 dark:text-[#8892A4] mt-0.5 leading-tight">{t.status}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={fulfillment.data?.totals ?? []}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
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
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={fulfillment.data?.trend ?? []} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={grid} />
                  <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: axis }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: axis }} axisLine={false} tickLine={false} width={30} />
                  <Tooltip contentStyle={tooltip} />
                  {fulfillment.data?.totals.map((t) => (
                    <Area
                      key={t.status}
                      type="monotone"
                      dataKey={t.status}
                      stackId="1"
                      stroke={STATUS_COLORS[t.status] ?? '#6B7280'}
                      fill={STATUS_COLORS[t.status] ?? '#6B7280'}
                      fillOpacity={0.7}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </SectionCard>
    </div>
  )
}
