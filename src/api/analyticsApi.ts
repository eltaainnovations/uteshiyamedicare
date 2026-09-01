import { getStoredToken } from '../context/AuthContext'
import { ApiError } from '../types/auth'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export type Granularity = 'daily' | 'weekly' | 'monthly'

export interface RevenuePoint {
  bucket: string
  revenue: number
  orderCount: number
}

export interface RevenueTrend {
  granularity: Granularity
  points: RevenuePoint[]
  currentTotal: number
  previousTotal: number
  changePct: number | null
}

export interface DistributorPerformanceItem {
  distributor: string
  customer: string | null
  orderCount: number
  totalValue: number
  revenueSharePct: number
}

export interface DistributorPerformance {
  items: DistributorPerformanceItem[]
  totalValue: number
}

export interface TopProductItem {
  itemCode: string
  itemName: string | null
  qty: number
  revenue: number
}

export interface TopProducts {
  items: TopProductItem[]
}

export interface StatusCount {
  status: string
  count: number
}

export interface FulfillmentTrendPoint {
  bucket: string
  [status: string]: string | number
}

export interface OrderFulfillment {
  totals: StatusCount[]
  granularity: Granularity
  trend: FulfillmentTrendPoint[]
  avgLeadTimeDays: number | null
}

export interface DistributorCohort {
  newCount: number
  repeatCount: number
}

export interface AnalyticsFilters {
  fromDate: string
  toDate: string
  customer?: string
  granularity?: Granularity
}

async function request<T>(path: string, params: Record<string, string | undefined>): Promise<T> {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value)
  }

  const token = getStoredToken()
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}?${query.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.')
  }

  if (!response.ok) {
    let detail = 'Something went wrong. Please try again.'
    try {
      const body = (await response.json()) as { detail?: string }
      if (body.detail) detail = body.detail
    } catch {
      // response had no JSON body — keep the generic message
    }
    throw new ApiError(response.status, detail)
  }

  return (await response.json()) as T
}

interface RevenueTrendBody {
  granularity: Granularity
  points: { bucket: string; revenue: number; order_count: number }[]
  current_total: number
  previous_total: number
  change_pct: number | null
}

export async function fetchRevenueTrend(filters: AnalyticsFilters): Promise<RevenueTrend> {
  const body = await request<RevenueTrendBody>('/analytics/revenue-trend', {
    from_date: filters.fromDate,
    to_date: filters.toDate,
    customer: filters.customer,
    granularity: filters.granularity ?? 'monthly',
  })
  return {
    granularity: body.granularity,
    points: body.points.map((p) => ({ bucket: p.bucket, revenue: p.revenue, orderCount: p.order_count })),
    currentTotal: body.current_total,
    previousTotal: body.previous_total,
    changePct: body.change_pct,
  }
}

interface DistributorPerformanceBody {
  items: {
    distributor: string
    customer: string | null
    order_count: number
    total_value: number
    revenue_share_pct: number
  }[]
  total_value: number
}

export async function fetchDistributorPerformance(filters: AnalyticsFilters): Promise<DistributorPerformance> {
  const body = await request<DistributorPerformanceBody>('/analytics/distributor-performance', {
    from_date: filters.fromDate,
    to_date: filters.toDate,
    customer: filters.customer,
  })
  return {
    items: body.items.map((i) => ({
      distributor: i.distributor,
      customer: i.customer,
      orderCount: i.order_count,
      totalValue: i.total_value,
      revenueSharePct: i.revenue_share_pct,
    })),
    totalValue: body.total_value,
  }
}

interface TopProductsBody {
  items: { item_code: string; item_name: string | null; qty: number; revenue: number }[]
}

export async function fetchTopProducts(filters: AnalyticsFilters): Promise<TopProducts> {
  const body = await request<TopProductsBody>('/analytics/top-products', {
    from_date: filters.fromDate,
    to_date: filters.toDate,
    customer: filters.customer,
  })
  return {
    items: body.items.map((i) => ({ itemCode: i.item_code, itemName: i.item_name, qty: i.qty, revenue: i.revenue })),
  }
}

interface OrderFulfillmentBody {
  totals: StatusCount[]
  granularity: Granularity
  trend: FulfillmentTrendPoint[]
  avg_lead_time_days: number | null
}

export async function fetchOrderFulfillment(filters: AnalyticsFilters): Promise<OrderFulfillment> {
  const body = await request<OrderFulfillmentBody>('/analytics/order-fulfillment', {
    from_date: filters.fromDate,
    to_date: filters.toDate,
    customer: filters.customer,
    granularity: filters.granularity ?? 'monthly',
  })
  return {
    totals: body.totals,
    granularity: body.granularity,
    trend: body.trend,
    avgLeadTimeDays: body.avg_lead_time_days,
  }
}

interface DistributorCohortBody {
  new_count: number
  repeat_count: number
}

export async function fetchDistributorCohort(filters: AnalyticsFilters): Promise<DistributorCohort> {
  const body = await request<DistributorCohortBody>('/analytics/distributor-cohort', {
    from_date: filters.fromDate,
    to_date: filters.toDate,
    customer: filters.customer,
  })
  return { newCount: body.new_count, repeatCount: body.repeat_count }
}
