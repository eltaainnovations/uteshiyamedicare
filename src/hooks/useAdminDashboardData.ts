import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  CheckCircle,
  Clock,
  FileText,
  Mail,
  Package,
  Plus,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  UserPlus,
  Users,
  XCircle,
  Truck,
} from 'lucide-react'

export interface KpiCardData {
  label: string
  value: string
  change: string
  up: boolean
  icon: LucideIcon
  color: string
  bg: string
}

export interface RevenuePoint {
  month: string
  revenue: number
  forecast: number
}

export interface ProductRevenue {
  name: string
  value: number
}

export interface OrderStatusSlice {
  name: string
  value: number
  color: string
}

export interface FulfillmentStat {
  label: string
  value: string
  color: string
  icon: LucideIcon
}

export type OrderRowStatus = 'Shipped' | 'Confirmed' | 'Pending' | 'Delivered' | 'Cancelled'

export interface OrderRow {
  id: string
  distributor: string
  items: number
  value: number
  status: OrderRowStatus
  delivery: string
}

export interface ActivityItem {
  text: string
  time: string
  type: 'success' | 'info' | 'warning' | 'error'
}

export interface QuickAction {
  icon: LucideIcon
  label: string
  color: string
}

export interface AdminDashboardData {
  kpis: KpiCardData[]
  revenueTrend: RevenuePoint[]
  topProducts: ProductRevenue[]
  orderStatus: OrderStatusSlice[]
  fulfillmentStats: FulfillmentStat[]
  latestOrders: OrderRow[]
  activities: ActivityItem[]
  quickActions: QuickAction[]
}

// TODO(follow-up): replace every field below with a real API call once the
// Insights Dashboard endpoints exist (see PROJECT_CONTEXT.md §3.2). Nothing
// downstream should need to change — AdminDashboard only reads the shape
// returned here.
const MOCK_DATA: AdminDashboardData = {
  kpis: [
    {
      label: 'Total Revenue (YTD)',
      value: '₹7.21 Cr',
      change: '+18.4%',
      up: true,
      icon: TrendingUp,
      color: '#147BA6',
      bg: '#e8f4fa',
    },
    {
      label: "Today's Orders",
      value: '47',
      change: '+12 vs yesterday',
      up: true,
      icon: ShoppingCart,
      color: '#1F8A70',
      bg: '#e6f5f1',
    },
    {
      label: 'Monthly Orders',
      value: '842',
      change: '+8.2% vs last month',
      up: true,
      icon: Activity,
      color: '#4AA3FF',
      bg: '#EFF6FF',
    },
    {
      label: 'Total Distributors',
      value: '124',
      change: '+6 this month',
      up: true,
      icon: Users,
      color: '#7C3AED',
      bg: '#F5F3FF',
    },
    {
      label: 'Pending Orders',
      value: '63',
      change: '-14% vs last week',
      up: false,
      icon: Clock,
      color: '#F59E0B',
      bg: '#FFFBEB',
    },
    {
      label: 'Inventory Health',
      value: '91%',
      change: '18 low-stock items',
      up: false,
      icon: Package,
      color: '#DC2626',
      bg: '#FEF2F2',
    },
  ],
  revenueTrend: [
    { month: 'Jan', revenue: 4200000, forecast: 4000000 },
    { month: 'Feb', revenue: 3800000, forecast: 4100000 },
    { month: 'Mar', revenue: 5100000, forecast: 4800000 },
    { month: 'Apr', revenue: 4700000, forecast: 4900000 },
    { month: 'May', revenue: 5900000, forecast: 5400000 },
    { month: 'Jun', revenue: 6200000, forecast: 5800000 },
    { month: 'Jul', revenue: 5800000, forecast: 6100000 },
    { month: 'Aug', revenue: 6800000, forecast: 6400000 },
    { month: 'Sep', revenue: 7100000, forecast: 6900000 },
    { month: 'Oct', revenue: 6500000, forecast: 7000000 },
    { month: 'Nov', revenue: 7800000, forecast: 7300000 },
    { month: 'Dec', revenue: 8200000, forecast: 7800000 },
  ],
  topProducts: [
    { name: 'Knee Implant System', value: 2840000 },
    { name: 'Hip Replacement Kit', value: 2210000 },
    { name: 'Spinal Fixation', value: 1980000 },
    { name: 'Trauma Plate Set', value: 1650000 },
    { name: 'Bone Cement', value: 1420000 },
    { name: 'Arthroscopy Set', value: 1180000 },
    { name: 'Suture Anchor', value: 980000 },
    { name: 'Drill Bit Set', value: 840000 },
    { name: 'Ortho Screw', value: 720000 },
    { name: 'Cast Material', value: 610000 },
  ],
  orderStatus: [
    { name: 'Delivered', value: 458, color: '#16A34A' },
    { name: 'Shipped', value: 124, color: '#147BA6' },
    { name: 'Confirmed', value: 87, color: '#1F8A70' },
    { name: 'Pending', value: 63, color: '#F59E0B' },
    { name: 'Cancelled', value: 18, color: '#DC2626' },
  ],
  fulfillmentStats: [
    { label: 'Fulfillment Rate', value: '96.2%', color: '#16A34A', icon: CheckCircle },
    { label: 'Avg. Delivery', value: '2.4 days', color: '#147BA6', icon: Truck },
    { label: 'Cancellation', value: '2.4%', color: '#DC2626', icon: XCircle },
  ],
  latestOrders: [
    {
      id: 'ORD-2025-0891',
      distributor: 'Apex Medicals, Mumbai',
      items: 12,
      value: 284000,
      status: 'Shipped',
      delivery: '24 Jul 2025',
    },
    {
      id: 'ORD-2025-0890',
      distributor: 'Medline Pharma, Delhi',
      items: 8,
      value: 196000,
      status: 'Confirmed',
      delivery: '25 Jul 2025',
    },
    {
      id: 'ORD-2025-0889',
      distributor: 'HealthPlus, Bangalore',
      items: 5,
      value: 142000,
      status: 'Pending',
      delivery: '26 Jul 2025',
    },
    {
      id: 'ORD-2025-0888',
      distributor: 'Ortho Care, Chennai',
      items: 18,
      value: 421000,
      status: 'Delivered',
      delivery: '21 Jul 2025',
    },
    {
      id: 'ORD-2025-0887',
      distributor: 'MedWorld, Hyderabad',
      items: 3,
      value: 87000,
      status: 'Cancelled',
      delivery: '—',
    },
    {
      id: 'ORD-2025-0886',
      distributor: 'Surgi Supplies, Pune',
      items: 22,
      value: 538000,
      status: 'Delivered',
      delivery: '20 Jul 2025',
    },
  ],
  activities: [
    { text: 'New distributor Apex Medicals onboarded', time: '5m ago', type: 'success' },
    { text: 'ERP sync completed — 847 products updated', time: '1h ago', type: 'info' },
    { text: 'Low stock alert: Knee Implant (3 units)', time: '2h ago', type: 'warning' },
    { text: 'Invoice INV-2025-0442 overdue — ₹1,24,000', time: '3h ago', type: 'error' },
    { text: 'Order ORD-2025-0888 delivered successfully', time: '4h ago', type: 'success' },
    { text: 'New user Priya Sharma added as Manager', time: '6h ago', type: 'info' },
  ],
  quickActions: [
    { icon: Plus, label: 'Add Product', color: '#147BA6' },
    { icon: UserPlus, label: 'Create User', color: '#1F8A70' },
    { icon: Mail, label: 'Send Email', color: '#7C3AED' },
    { icon: FileText, label: 'Generate Report', color: '#F59E0B' },
    { icon: RefreshCw, label: 'ERP Sync', color: '#DC2626' },
  ],
}

export function useAdminDashboardData(): AdminDashboardData {
  return MOCK_DATA
}
