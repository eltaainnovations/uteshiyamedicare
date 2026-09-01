import { getStoredToken } from '../context/AuthContext'
import { ApiError } from '../types/auth'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export interface OrderListItem {
  name: string
  customer: string
  customerName: string | null
  transactionDate: string | null
  deliveryDate: string | null
  status: string
  itemCount: number
  grandTotal: number
}

export interface OrderListPage {
  items: OrderListItem[]
  total: number
  page: number
  pageSize: number
  statuses: string[]
}

export interface OrderItem {
  itemCode: string
  itemName: string | null
  qty: number
  rate: number
  amount: number
}

export interface OrderSalesPerson {
  salesPerson: string
  allocatedPercentage: number
}

export interface OrderInvoice {
  name: string
  status: string
  grandTotal: number
}

export interface OrderDetail {
  name: string
  customer: string
  customerName: string | null
  transactionDate: string | null
  deliveryDate: string | null
  status: string
  items: OrderItem[]
  salesTeam: OrderSalesPerson[]
  invoice: OrderInvoice | null
}

interface OrderListItemBody {
  name: string
  customer: string
  customer_name: string | null
  transaction_date: string | null
  delivery_date: string | null
  status: string
  item_count: number
  grand_total: number
}

interface OrderListResponseBody {
  items: OrderListItemBody[]
  total: number
  page: number
  page_size: number
  statuses: string[]
}

interface OrderDetailBody {
  name: string
  customer: string
  customer_name: string | null
  transaction_date: string | null
  delivery_date: string | null
  status: string
  items: { item_code: string; item_name: string | null; qty: number; rate: number; amount: number }[]
  sales_team: { sales_person: string; allocated_percentage: number }[]
  invoice: { name: string; status: string; grand_total: number } | null
}

async function request<T>(path: string): Promise<T> {
  const token = getStoredToken()
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
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

export async function fetchOrders(
  params: {
    search?: string
    customer?: string
    status?: string
    page?: number
    pageSize?: number
  } = {},
): Promise<OrderListPage> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.customer) query.set('customer', params.customer)
  if (params.status) query.set('status', params.status)
  query.set('page', String(params.page ?? 1))
  query.set('page_size', String(params.pageSize ?? 20))

  const body = await request<OrderListResponseBody>(`/orders?${query.toString()}`)
  return {
    items: body.items.map((o) => ({
      name: o.name,
      customer: o.customer,
      customerName: o.customer_name,
      transactionDate: o.transaction_date,
      deliveryDate: o.delivery_date,
      status: o.status,
      itemCount: o.item_count,
      grandTotal: o.grand_total,
    })),
    total: body.total,
    page: body.page,
    pageSize: body.page_size,
    statuses: body.statuses,
  }
}

export async function fetchOrderDetail(name: string): Promise<OrderDetail> {
  const body = await request<OrderDetailBody>(`/orders/${encodeURIComponent(name)}`)
  return {
    name: body.name,
    customer: body.customer,
    customerName: body.customer_name,
    transactionDate: body.transaction_date,
    deliveryDate: body.delivery_date,
    status: body.status,
    items: body.items.map((i) => ({
      itemCode: i.item_code,
      itemName: i.item_name,
      qty: i.qty,
      rate: i.rate,
      amount: i.amount,
    })),
    salesTeam: body.sales_team.map((s) => ({
      salesPerson: s.sales_person,
      allocatedPercentage: s.allocated_percentage,
    })),
    invoice: body.invoice
      ? { name: body.invoice.name, status: body.invoice.status, grandTotal: body.invoice.grand_total }
      : null,
  }
}
