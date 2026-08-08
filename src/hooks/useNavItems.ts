import { ADMIN_NAV_ITEMS, DISTRIBUTOR_NAV_ITEMS, type NavItem } from '../config/navigation'

// Thin wrappers over the static config today. If nav ever needs to react to
// per-user permissions, this is the only place that needs to change — Layout
// and the portals just consume whatever NavItem[] comes back.
export function useAdminNavItems(): NavItem[] {
  return ADMIN_NAV_ITEMS
}

export function useDistributorNavItems(): NavItem[] {
  return DISTRIBUTOR_NAV_ITEMS
}
