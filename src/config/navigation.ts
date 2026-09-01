import type { LucideIcon } from 'lucide-react'
import {
  Archive,
  BarChart2,
  Building2,
  ClipboardList,
  FileText,
  Home,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingCart,
  TrendingUp,
  Truck,
  UserCircle,
  Users,
} from 'lucide-react'

export type Screen =
  | 'admin-dashboard'
  | 'user-management'
  | 'distributors'
  | 'product-catalogue'
  | 'orders'
  | 'email-management'
  | 'reports'
  | 'analytics'
  | 'erp-sync'
  | 'settings'
  | 'profile'
  | 'dist-dashboard'
  | 'dist-products'
  | 'dist-active-orders'
  | 'dist-completed-orders'
  | 'dist-track'
  | 'dist-invoices'
  | 'dist-inventory'
  | 'dist-end-users'
  | 'dist-profile'

export interface NavItem {
  icon: LucideIcon
  label: string
  screen: Screen
  /** Path segment relative to the portal's base route (e.g. '/admin'). */
  path: string
}

export const screenTitle: Record<Screen, string> = {
  'admin-dashboard': 'Dashboard',
  'user-management': 'User Management',
  distributors: 'Distributors',
  'product-catalogue': 'Product Catalogue',
  orders: 'Orders',
  'email-management': 'Email Management',
  reports: 'Reports',
  analytics: 'Analytics',
  'erp-sync': 'ERP Sync',
  settings: 'Settings',
  profile: 'Profile',
  'dist-dashboard': 'Dashboard',
  'dist-products': 'Product Catalogue',
  'dist-active-orders': 'Active Orders',
  'dist-completed-orders': 'Completed Orders',
  'dist-track': 'Track Shipment',
  'dist-invoices': 'Invoices',
  'dist-inventory': 'Inventory',
  'dist-end-users': 'End User Records',
  'dist-profile': 'Profile',
}

export const ADMIN_NAV_ITEMS: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', screen: 'admin-dashboard', path: 'dashboard' },
  { icon: Users, label: 'User Management', screen: 'user-management', path: 'user-management' },
  { icon: Building2, label: 'Distributors', screen: 'distributors', path: 'distributors' },
  { icon: Package, label: 'Product Catalogue', screen: 'product-catalogue', path: 'product-catalogue' },
  { icon: ShoppingCart, label: 'Orders', screen: 'orders', path: 'orders' },
  { icon: BarChart2, label: 'Reports', screen: 'reports', path: 'reports' },
  { icon: TrendingUp, label: 'Analytics', screen: 'analytics', path: 'analytics' },
  { icon: Settings, label: 'Settings', screen: 'settings', path: 'settings' },
]

export const DISTRIBUTOR_NAV_ITEMS: NavItem[] = [
  { icon: Home, label: 'Dashboard', screen: 'dist-dashboard', path: 'dashboard' },
  { icon: Package, label: 'Product Catalogue', screen: 'dist-products', path: 'products' },
  { icon: ClipboardList, label: 'Active Orders', screen: 'dist-active-orders', path: 'active-orders' },
  { icon: ShoppingCart, label: 'Completed Orders', screen: 'dist-completed-orders', path: 'completed-orders' },
  { icon: Truck, label: 'Track Shipment', screen: 'dist-track', path: 'track-shipment' },
  { icon: FileText, label: 'Invoices', screen: 'dist-invoices', path: 'invoices' },
  { icon: Archive, label: 'Inventory', screen: 'dist-inventory', path: 'inventory' },
  { icon: Users, label: 'End User Records', screen: 'dist-end-users', path: 'end-users' },
  { icon: UserCircle, label: 'Profile', screen: 'dist-profile', path: 'profile' },
]
