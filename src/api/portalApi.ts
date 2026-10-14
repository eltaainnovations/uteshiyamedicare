import { getStoredToken } from '../context/AuthContext'
import { ApiError } from '../types/auth'
import type { DistributorDetail } from './distributorsApi'
import type { OrderDetail, OrderInvoice, OrderListItem, OrderListPage } from './ordersApi'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export interface PortalWelcome {
  name: string
  company: string | null
  customerId: string
}

export interface PortalKpis {
  totalOrders: number
  pendingOrders: number
  pendingValue: number
  completedOrders: number
  fulfillmentPct: number | null
  totalPurchaseValue: number
  outstandingAmount: number
  overdueInvoiceCount: number
  outstandingAvailable: boolean
}

export interface PortalTrendPoint {
  bucket: string
  value: number
  orders: number
}

export interface PortalStatusSlice {
  status: string
  count: number
}

export interface PortalTopProduct {
  itemCode: string
  itemName: string | null
  qty: number
  revenue: number
}

export interface PortalDashboard {
  welcome: PortalWelcome
  kpis: PortalKpis
  monthlyTrend: PortalTrendPoint[]
  orderStatus: PortalStatusSlice[]
  topProducts: PortalTopProduct[]
}

interface PortalDashboardBody {
  welcome: { name: string; company: string | null; customer_id: string }
  kpis: {
    total_orders: number
    pending_orders: number
    pending_value: number
    completed_orders: number
    fulfillment_pct: number | null
    total_purchase_value: number
    outstanding_amount: number
    overdue_invoice_count: number
    outstanding_available: boolean
  }
  monthly_trend: { bucket: string; value: number; orders: number }[]
  order_status: { status: string; count: number }[]
  top_products: { item_code: string; item_name: string | null; qty: number; revenue: number }[]
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken()
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
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
      // no JSON body — keep the generic message
    }
    throw new ApiError(response.status, detail)
  }

  return (await response.json()) as T
}

function mapOrderRow(o: OrderListItemBody): OrderListItem {
  return {
    name: o.name,
    customer: o.customer,
    customerName: o.customer_name,
    transactionDate: o.transaction_date,
    deliveryDate: o.delivery_date,
    status: o.status,
    itemCount: o.item_count,
    grandTotal: o.grand_total,
  }
}

/** Display-only identity for the Profile screen — same shape as the
 * dashboard's `welcome` block, fetched on its own (no KPI/chart calls). */
export async function fetchDistributorProfile(): Promise<PortalWelcome> {
  const b = await request<{ name: string; company: string | null; customer_id: string }>('/portal/profile')
  return { name: b.name, company: b.company, customerId: b.customer_id }
}

export async function fetchPortalDashboard(): Promise<PortalDashboard> {
  const b = await request<PortalDashboardBody>('/portal/dashboard')
  return {
    welcome: { name: b.welcome.name, company: b.welcome.company, customerId: b.welcome.customer_id },
    kpis: {
      totalOrders: b.kpis.total_orders,
      pendingOrders: b.kpis.pending_orders,
      pendingValue: b.kpis.pending_value,
      completedOrders: b.kpis.completed_orders,
      fulfillmentPct: b.kpis.fulfillment_pct,
      totalPurchaseValue: b.kpis.total_purchase_value,
      outstandingAmount: b.kpis.outstanding_amount,
      overdueInvoiceCount: b.kpis.overdue_invoice_count,
      outstandingAvailable: b.kpis.outstanding_available,
    },
    monthlyTrend: b.monthly_trend.map((p) => ({ bucket: p.bucket, value: p.value, orders: p.orders })),
    orderStatus: b.order_status.map((s) => ({ status: s.status, count: s.count })),
    topProducts: b.top_products.map((p) => ({
      itemCode: p.item_code,
      itemName: p.item_name,
      qty: p.qty,
      revenue: p.revenue,
    })),
  }
}

export async function fetchPortalOrders(
  params: { page?: number; pageSize?: number; status?: string; search?: string } = {},
): Promise<OrderListPage> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.status) query.set('status', params.status)
  query.set('page', String(params.page ?? 1))
  query.set('page_size', String(params.pageSize ?? 20))

  const body = await request<OrderListResponseBody>(`/portal/orders?${query.toString()}`)
  return {
    items: body.items.map(mapOrderRow),
    total: body.total,
    page: body.page,
    pageSize: body.page_size,
    statuses: body.statuses,
  }
}

export async function fetchPendingApprovalOrders(): Promise<OrderListItem[]> {
  const body = await request<OrderListItemBody[]>('/portal/orders/pending-approval')
  return body.map(mapOrderRow)
}

// --- Sales Person Dashboard -----------------------------------------------

export interface SalesDashboard {
  distributorCount: number
  ordersCreated: number
  pendingApprovals: number
  recentOrders: OrderListItem[]
}

interface SalesDashboardBody {
  distributor_count: number
  orders_created: number
  pending_approvals: number
  recent_orders: OrderListItemBody[]
}

export async function fetchSalesDashboard(): Promise<SalesDashboard> {
  const b = await request<SalesDashboardBody>('/portal/sales/dashboard')
  return {
    distributorCount: b.distributor_count,
    ordersCreated: b.orders_created,
    pendingApprovals: b.pending_approvals,
    recentOrders: b.recent_orders.map(mapOrderRow),
  }
}

async function orderAction(name: string, action: 'approve' | 'reject'): Promise<void> {
  await request(`/portal/orders/${encodeURIComponent(name)}/${action}`, { method: 'PUT' })
}

export const approvePendingOrder = (name: string) => orderAction(name, 'approve')
export const rejectPendingOrder = (name: string) => orderAction(name, 'reject')

// --- Sales Person: Create Order -------------------------------------------

export interface SalesOrderCreateResult {
  name: string
  status: string
}

export async function createSalesOrder(params: {
  transactionDate: string
  deliveryDate: string
  items: { itemCode: string; qty: number }[]
}): Promise<SalesOrderCreateResult> {
  const body = await request<{ name: string; status: string }>('/portal/sales-orders', {
    method: 'POST',
    body: JSON.stringify({
      transaction_date: params.transactionDate,
      delivery_date: params.deliveryDate,
      items: params.items.map((i) => ({ item_code: i.itemCode, qty: i.qty })),
    }),
  })
  return { name: body.name, status: body.status }
}

// --- Sales Person: My Customers --------------------------------------------

export interface PortalCustomerListItem {
  name: string
  customerName: string
  territory: string | null
  disabled: boolean
  lastOrderDate: string | null
  totalOrders: number
}

interface PortalCustomerListItemBody {
  name: string
  customer_name: string
  territory: string | null
  disabled: boolean
  last_order_date: string | null
  total_orders: number
}

export async function fetchMyCustomers(): Promise<PortalCustomerListItem[]> {
  const body = await request<{ items: PortalCustomerListItemBody[] }>('/portal/customers')
  return body.items.map((c) => ({
    name: c.name,
    customerName: c.customer_name,
    territory: c.territory,
    disabled: c.disabled,
    lastOrderDate: c.last_order_date,
    totalOrders: c.total_orders,
  }))
}

interface PortalCustomerDetailBody {
  name: string
  customer_name: string
  customer_group: string | null
  territory: string | null
  customer_type: string | null
  disabled: boolean
  addresses: {
    name: string
    address_type: string | null
    address_line1: string | null
    address_line2: string | null
    city: string | null
    state: string | null
    country: string | null
    pincode: string | null
    is_primary_address: boolean
    is_shipping_address: boolean
  }[]
  contacts: {
    name: string
    first_name: string | null
    last_name: string | null
    email_id: string | null
    phone: string | null
    mobile_no: string | null
  }[]
}

// Same Customer + Address + Contact shape Admin's fetchDistributorDetail
// returns (backend reuses distributors_service.get_distributor_detail
// verbatim) — just fetched through the Sales-Person-scoped endpoint.
export async function fetchMyCustomerDetail(name: string): Promise<DistributorDetail> {
  const body = await request<PortalCustomerDetailBody>(`/portal/customers/${encodeURIComponent(name)}`)
  return {
    name: body.name,
    customerName: body.customer_name,
    customerGroup: body.customer_group,
    territory: body.territory,
    customerType: body.customer_type,
    disabled: body.disabled,
    addresses: body.addresses.map((a) => ({
      name: a.name,
      addressType: a.address_type,
      addressLine1: a.address_line1,
      addressLine2: a.address_line2,
      city: a.city,
      state: a.state,
      country: a.country,
      pincode: a.pincode,
      isPrimaryAddress: a.is_primary_address,
      isShippingAddress: a.is_shipping_address,
    })),
    contacts: body.contacts.map((c) => ({
      name: c.name,
      firstName: c.first_name,
      lastName: c.last_name,
      emailId: c.email_id,
      phone: c.phone,
      mobileNo: c.mobile_no,
    })),
  }
}

// --- Sales Person: Pending Approvals ---------------------------------------

export type SalesApprovalStatus = 'Awaiting Approval' | 'Approved' | 'Rejected'

export interface SalesApprovalOrder {
  name: string
  customer: string
  customerName: string | null
  itemCount: number
  grandTotal: number
  transactionDate: string | null
  status: SalesApprovalStatus
}

export interface SalesApprovals {
  items: SalesApprovalOrder[]
  awaiting: number
  approved: number
  rejected: number
}

interface SalesApprovalOrderBody {
  name: string
  customer: string
  customer_name: string | null
  item_count: number
  grand_total: number
  transaction_date: string | null
  status: SalesApprovalStatus
}

export async function fetchSalesApprovals(): Promise<SalesApprovals> {
  const body = await request<{ items: SalesApprovalOrderBody[]; awaiting: number; approved: number; rejected: number }>(
    '/portal/sales/approvals',
  )
  return {
    items: body.items.map((o) => ({
      name: o.name,
      customer: o.customer,
      customerName: o.customer_name,
      itemCount: o.item_count,
      grandTotal: o.grand_total,
      transactionDate: o.transaction_date,
      status: o.status,
    })),
    awaiting: body.awaiting,
    approved: body.approved,
    rejected: body.rejected,
  }
}

// --- Sales Person: Order History -------------------------------------------

export interface SalesOrderHistoryItem {
  name: string
  customer: string
  customerName: string | null
  itemCount: number
  grandTotal: number
  transactionDate: string | null
  status: string
}

export interface SalesOrderHistoryDistributor {
  name: string
  customerName: string
}

export interface SalesOrderHistoryStats {
  total: number
  pending: number
  approvedAndConverted: number
}

export interface SalesOrderHistory {
  items: SalesOrderHistoryItem[]
  total: number
  page: number
  pageSize: number
  distributors: SalesOrderHistoryDistributor[]
  stats: SalesOrderHistoryStats
}

interface SalesOrderHistoryBody {
  items: {
    name: string
    customer: string
    customer_name: string | null
    item_count: number
    grand_total: number
    transaction_date: string | null
    status: string
  }[]
  total: number
  page: number
  page_size: number
  distributors: { name: string; customer_name: string }[]
  stats: { total: number; pending: number; approved_and_converted: number }
}

export async function fetchSalesOrderHistory(
  params: {
    search?: string
    status?: string
    customer?: string
    fromDate?: string
    toDate?: string
    page?: number
    pageSize?: number
  } = {},
): Promise<SalesOrderHistory> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.status) query.set('status', params.status)
  if (params.customer) query.set('customer', params.customer)
  if (params.fromDate) query.set('from_date', params.fromDate)
  if (params.toDate) query.set('to_date', params.toDate)
  query.set('page', String(params.page ?? 1))
  query.set('page_size', String(params.pageSize ?? 20))

  const body = await request<SalesOrderHistoryBody>(`/portal/sales/orders?${query.toString()}`)
  return {
    items: body.items.map((o) => ({
      name: o.name,
      customer: o.customer,
      customerName: o.customer_name,
      itemCount: o.item_count,
      grandTotal: o.grand_total,
      transactionDate: o.transaction_date,
      status: o.status,
    })),
    total: body.total,
    page: body.page,
    pageSize: body.page_size,
    distributors: body.distributors.map((d) => ({ name: d.name, customerName: d.customer_name })),
    stats: {
      total: body.stats.total,
      pending: body.stats.pending,
      approvedAndConverted: body.stats.approved_and_converted,
    },
  }
}

// --- Distributor Product Catalogue ---------------------------------------

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock'

export interface PortalProduct {
  itemCode: string
  itemName: string
  itemGroup: string
  hasVariants: boolean
  image: string | null
  totalStock: number
  stockStatus: StockStatus
  price: number | null
  listPrice: number | null
}

export interface PortalProductPage {
  items: PortalProduct[]
  total: number
  page: number
  pageSize: number
  categories: string[]
}

export interface PortalProductAttribute {
  attribute: string
  value: string
}

export interface PortalProductVariant {
  itemCode: string
  itemName: string
  totalStock: number
  stockStatus: StockStatus
  price: number | null
  listPrice: number | null
  attributes: PortalProductAttribute[]
}

export interface PortalProductVariants {
  itemCode: string
  itemName: string
  hasVariants: boolean
  image: string | null
  variants: PortalProductVariant[]
}

interface PortalProductBody {
  item_code: string
  item_name: string
  item_group: string
  has_variants: boolean
  image: string | null
  total_stock: number
  stock_status: StockStatus
  price: number | null
  list_price: number | null
}

function mapProduct(p: PortalProductBody): PortalProduct {
  return {
    itemCode: p.item_code,
    itemName: p.item_name,
    itemGroup: p.item_group,
    hasVariants: p.has_variants,
    image: p.image,
    totalStock: p.total_stock,
    stockStatus: p.stock_status,
    price: p.price,
    listPrice: p.list_price,
  }
}

interface PortalVariantBody {
  item_code: string
  item_name: string
  total_stock: number
  stock_status: StockStatus
  price: number | null
  list_price: number | null
  attributes: PortalProductAttribute[]
}

function mapVariant(v: PortalVariantBody): PortalProductVariant {
  return {
    itemCode: v.item_code,
    itemName: v.item_name,
    totalStock: v.total_stock,
    stockStatus: v.stock_status,
    price: v.price,
    listPrice: v.list_price,
    attributes: v.attributes,
  }
}

export async function fetchPortalProducts(
  params: { search?: string; category?: string; page?: number; pageSize?: number } = {},
): Promise<PortalProductPage> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.category) query.set('category', params.category)
  query.set('page', String(params.page ?? 1))
  query.set('page_size', String(params.pageSize ?? 20))

  const body = await request<{
    items: PortalProductBody[]
    total: number
    page: number
    page_size: number
    categories: string[]
  }>(`/portal/products?${query.toString()}`)

  return {
    items: body.items.map(mapProduct),
    total: body.total,
    page: body.page,
    pageSize: body.page_size,
    categories: body.categories,
  }
}

export async function fetchPortalProductVariants(itemCode: string): Promise<PortalProductVariants> {
  const body = await request<{
    item_code: string
    item_name: string
    has_variants: boolean
    image: string | null
    variants: PortalVariantBody[]
  }>(`/portal/products/${encodeURIComponent(itemCode)}/variants`)

  return {
    itemCode: body.item_code,
    itemName: body.item_name,
    hasVariants: body.has_variants,
    image: body.image,
    variants: body.variants.map(mapVariant),
  }
}

// --- Distributor Inventory Ledger --------------------------------------

export interface PortalInventoryItem {
  itemCode: string
  itemName: string
  category: string | null
  unit: string | null
  quantity: number
  lowStockThreshold: number | null
  lowStock: boolean
  value: number | null
  updatedAt: string
}

interface PortalInventoryBody {
  item_code: string
  item_name: string
  category: string | null
  unit: string | null
  quantity: number
  low_stock_threshold: number | null
  low_stock: boolean
  value: number | null
  updated_at: string
}

export async function fetchPortalInventory(): Promise<PortalInventoryItem[]> {
  const body = await request<{ items: PortalInventoryBody[] }>('/portal/inventory')
  return body.items.map((i) => ({
    itemCode: i.item_code,
    itemName: i.item_name,
    category: i.category,
    unit: i.unit,
    quantity: i.quantity,
    lowStockThreshold: i.low_stock_threshold,
    lowStock: i.low_stock,
    value: i.value,
    updatedAt: i.updated_at,
  }))
}

/** Set the low-stock threshold, or pass null to clear the reorder alert. */
export async function updatePortalThreshold(itemCode: string, threshold: number | null): Promise<void> {
  await request(`/portal/inventory/${encodeURIComponent(itemCode)}/threshold`, {
    method: 'PUT',
    body: JSON.stringify({ low_stock_threshold: threshold }),
  })
}

// --- End-User / Implant Records ---------------------------------------

export interface EndUserRecord {
  id: number
  recordId: string
  itemCode: string
  itemName: string
  quantity: number
  doctorName: string
  hospitalName: string
  location: string
  batchId: string
  implantationDate: string
  feedbackNotes: string | null
  satisfactionRating: number | null
  complication: boolean
  hasFeedback: boolean
  createdAt: string
}

export interface EndUserRecordStats {
  totalRecords: number
  topHospital: string | null
  topHospitalCount: number
  avgSatisfaction: number | null
  complicationAlerts: number
}

export interface EndUserRecordPage {
  items: EndUserRecord[]
  stats: EndUserRecordStats
}

export interface CreateEndUserRecordInput {
  itemCode: string
  quantity: number
  doctorName: string
  hospitalName: string
  location: string
  batchId: string
  implantationDate: string
  feedbackNotes?: string | null
  satisfactionRating?: number | null
  complication?: boolean
}

export interface EndUserFeedbackInput {
  feedbackNotes: string | null
  satisfactionRating: number | null
  complication: boolean
}

interface EndUserRecordBody {
  id: number
  record_id: string
  item_code: string
  item_name: string
  quantity: number
  doctor_name: string
  hospital_name: string
  location: string
  batch_id: string
  implantation_date: string
  feedback_notes: string | null
  satisfaction_rating: number | null
  complication: boolean
  has_feedback: boolean
  created_at: string
}

function mapRecord(r: EndUserRecordBody): EndUserRecord {
  return {
    id: r.id,
    recordId: r.record_id,
    itemCode: r.item_code,
    itemName: r.item_name,
    quantity: r.quantity,
    doctorName: r.doctor_name,
    hospitalName: r.hospital_name,
    location: r.location,
    batchId: r.batch_id,
    implantationDate: r.implantation_date,
    feedbackNotes: r.feedback_notes,
    satisfactionRating: r.satisfaction_rating,
    complication: r.complication,
    hasFeedback: r.has_feedback,
    createdAt: r.created_at,
  }
}

export async function fetchEndUserRecords(
  params: { search?: string; rating?: 'all' | '5' | 'complications' } = {},
): Promise<EndUserRecordPage> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.rating && params.rating !== 'all') query.set('rating', params.rating)
  const qs = query.toString()

  const body = await request<{
    items: EndUserRecordBody[]
    stats: {
      total_records: number
      top_hospital: string | null
      top_hospital_count: number
      avg_satisfaction: number | null
      complication_alerts: number
    }
  }>(`/portal/end-user-records${qs ? `?${qs}` : ''}`)

  return {
    items: body.items.map(mapRecord),
    stats: {
      totalRecords: body.stats.total_records,
      topHospital: body.stats.top_hospital,
      topHospitalCount: body.stats.top_hospital_count,
      avgSatisfaction: body.stats.avg_satisfaction,
      complicationAlerts: body.stats.complication_alerts,
    },
  }
}

export async function createEndUserRecord(input: CreateEndUserRecordInput): Promise<EndUserRecord> {
  const body = await request<EndUserRecordBody>('/portal/end-user-records', {
    method: 'POST',
    body: JSON.stringify({
      item_code: input.itemCode,
      quantity: input.quantity,
      doctor_name: input.doctorName,
      hospital_name: input.hospitalName,
      location: input.location,
      batch_id: input.batchId,
      implantation_date: input.implantationDate,
      feedback_notes: input.feedbackNotes ?? null,
      satisfaction_rating: input.satisfactionRating ?? null,
      complication: input.complication ?? false,
    }),
  })
  return mapRecord(body)
}

export async function updateEndUserFeedback(id: number, input: EndUserFeedbackInput): Promise<void> {
  await request(`/portal/end-user-records/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      feedback_notes: input.feedbackNotes,
      satisfaction_rating: input.satisfactionRating,
      complication: input.complication,
    }),
  })
}

// --- Active / Completed Orders ---------------------------------------

interface OrderListItemBodyFull {
  name: string
  customer: string
  customer_name: string | null
  transaction_date: string | null
  delivery_date: string | null
  status: string
  item_count: number
  grand_total: number
}

function mapOrderListItem(o: OrderListItemBodyFull): OrderListItem {
  return {
    name: o.name,
    customer: o.customer,
    customerName: o.customer_name,
    transactionDate: o.transaction_date,
    deliveryDate: o.delivery_date,
    status: o.status,
    itemCount: o.item_count,
    grandTotal: o.grand_total,
  }
}

export async function fetchActiveOrders(
  params: { search?: string; page?: number; pageSize?: number } = {},
): Promise<OrderListPage> {
  const q = new URLSearchParams()
  if (params.search) q.set('search', params.search)
  q.set('page', String(params.page ?? 1))
  q.set('page_size', String(params.pageSize ?? 50))
  const body = await request<{
    items: OrderListItemBodyFull[]
    total: number
    page: number
    page_size: number
    statuses: string[]
  }>(`/portal/orders/active?${q.toString()}`)
  return {
    items: body.items.map(mapOrderListItem),
    total: body.total,
    page: body.page,
    pageSize: body.page_size,
    statuses: body.statuses,
  }
}

export interface CompletedOrder {
  name: string
  customerName: string | null
  transactionDate: string | null
  deliveryDate: string | null
  status: string
  itemCount: number
  grandTotal: number
  itemNames: string[]
  invoice: OrderInvoice | null
}

export interface CompletedOrdersStats {
  totalCompleted: number
  totalValue: number
  avgOrderValue: number
}

export async function fetchCompletedOrders(range: {
  fromDate: string
  toDate: string
}): Promise<{ items: CompletedOrder[]; stats: CompletedOrdersStats }> {
  const q = new URLSearchParams({ from_date: range.fromDate, to_date: range.toDate })
  const body = await request<{
    items: {
      name: string
      customer_name: string | null
      transaction_date: string | null
      delivery_date: string | null
      status: string
      item_count: number
      grand_total: number
      item_names: string[]
      invoice: { name: string; status: string; grand_total: number } | null
    }[]
    stats: { total_completed: number; total_value: number; avg_order_value: number }
  }>(`/portal/orders/completed?${q.toString()}`)
  return {
    items: body.items.map((o) => ({
      name: o.name,
      customerName: o.customer_name,
      transactionDate: o.transaction_date,
      deliveryDate: o.delivery_date,
      status: o.status,
      itemCount: o.item_count,
      grandTotal: o.grand_total,
      itemNames: o.item_names,
      invoice: o.invoice ? { name: o.invoice.name, status: o.invoice.status, grandTotal: o.invoice.grand_total } : null,
    })),
    stats: {
      totalCompleted: body.stats.total_completed,
      totalValue: body.stats.total_value,
      avgOrderValue: body.stats.avg_order_value,
    },
  }
}

// Proxied through our backend, which holds the ERPNext credentials — the
// browser only ever gets a PDF blob, never a token to call ERPNext itself.
// Downloaded via fetch (not a plain <a href>) because the request needs
// our own Authorization header.
export async function downloadInvoicePdf(orderName: string): Promise<void> {
  const token = getStoredToken()
  let response: Response
  try {
    response = await fetch(`${API_URL}/portal/orders/${encodeURIComponent(orderName)}/invoice-pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.')
  }

  if (!response.ok) {
    let detail = 'Could not download the invoice.'
    try {
      const body = (await response.json()) as { detail?: string }
      if (body.detail) detail = body.detail
    } catch {
      // no JSON body — keep the generic message
    }
    throw new ApiError(response.status, detail)
  }

  const disposition = response.headers.get('content-disposition') ?? ''
  const filename = /filename="?([^"]+)"?/.exec(disposition)?.[1] ?? `${orderName}-invoice.pdf`
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export interface PortalInvoice {
  name: string
  salesOrder: string | null
  gstin: string | null
  postingDate: string | null
  grandTotal: number
  outstandingAmount: number
  status: string
}

export interface PortalInvoiceStats {
  totalInvoiced: number
  pending: number
  overdue: number
}

export async function fetchPortalInvoices(): Promise<{ items: PortalInvoice[]; stats: PortalInvoiceStats }> {
  const body = await request<{
    items: {
      name: string
      sales_order: string | null
      gstin: string | null
      posting_date: string | null
      grand_total: number
      outstanding_amount: number
      status: string
    }[]
    stats: { total_invoiced: number; pending: number; overdue: number }
  }>('/portal/invoices')
  return {
    items: body.items.map((i) => ({
      name: i.name,
      salesOrder: i.sales_order,
      gstin: i.gstin,
      postingDate: i.posting_date,
      grandTotal: i.grand_total,
      outstandingAmount: i.outstanding_amount,
      status: i.status,
    })),
    stats: {
      totalInvoiced: body.stats.total_invoiced,
      pending: body.stats.pending,
      overdue: body.stats.overdue,
    },
  }
}

export async function fetchPortalOrderDetail(name: string): Promise<OrderDetail> {
  const b = await request<{
    name: string
    customer: string
    customer_name: string | null
    transaction_date: string | null
    delivery_date: string | null
    status: string
    items: { item_code: string; item_name: string | null; qty: number; rate: number; amount: number }[]
    sales_team: { sales_person: string; allocated_percentage: number }[]
    invoice: { name: string; status: string; grand_total: number } | null
  }>(`/portal/orders/${encodeURIComponent(name)}`)
  return {
    name: b.name,
    customer: b.customer,
    customerName: b.customer_name,
    transactionDate: b.transaction_date,
    deliveryDate: b.delivery_date,
    status: b.status,
    items: b.items.map((i) => ({
      itemCode: i.item_code,
      itemName: i.item_name,
      qty: i.qty,
      rate: i.rate,
      amount: i.amount,
    })),
    salesTeam: b.sales_team.map((s) => ({
      salesPerson: s.sales_person,
      allocatedPercentage: s.allocated_percentage,
    })),
    invoice: b.invoice
      ? { name: b.invoice.name, status: b.invoice.status, grandTotal: b.invoice.grand_total }
      : null,
  }
}

export interface ReorderLine {
  itemCode: string
  itemName: string | null
  quantity: number
  price: number | null
}

export async function fetchReorderItems(name: string): Promise<ReorderLine[]> {
  const b = await request<{
    order_name: string
    items: { item_code: string; item_name: string | null; quantity: number; price: number | null }[]
  }>(`/portal/orders/${encodeURIComponent(name)}/reorder`)
  return b.items.map((i) => ({
    itemCode: i.item_code,
    itemName: i.item_name,
    quantity: i.quantity,
    price: i.price,
  }))
}

export async function cancelPortalOrder(name: string): Promise<void> {
  await request(`/portal/orders/${encodeURIComponent(name)}/cancel`, { method: 'PUT' })
}

// --- Track Shipment (Shree Maruti, manual docket) ---------------------

export type TrackState = 'found' | 'pending' | 'error'

export interface TrackEvent {
  label: string
  description: string
  location: string
  timestamp: string
  category: string
  done: boolean
  current: boolean
}

export interface TrackShipmentResult {
  docket: string
  state: TrackState
  message: string | null
  latest: TrackEvent | null
  events: TrackEvent[]
  podImages: string[]
  trackingUrl: string
}

interface TrackEventBody {
  label: string
  description: string
  location: string
  timestamp: string
  category: string
  done: boolean
  current: boolean
}

function mapTrackEvent(e: TrackEventBody): TrackEvent {
  return {
    label: e.label,
    description: e.description,
    location: e.location,
    timestamp: e.timestamp,
    category: e.category,
    done: e.done,
    current: e.current,
  }
}

export async function fetchTrackShipment(docket: string): Promise<TrackShipmentResult> {
  const b = await request<{
    docket: string
    state: TrackState
    message: string | null
    latest: TrackEventBody | null
    events: TrackEventBody[]
    pod_images: string[]
    tracking_url: string
  }>(`/portal/track-shipment?docket=${encodeURIComponent(docket)}`)
  return {
    docket: b.docket,
    state: b.state,
    message: b.message,
    latest: b.latest ? mapTrackEvent(b.latest) : null,
    events: b.events.map(mapTrackEvent),
    podImages: b.pod_images,
    trackingUrl: b.tracking_url,
  }
}
