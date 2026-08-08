import type { Screen } from '../config/navigation'

export type NavBadges = Partial<Record<Screen, number>>

// TODO(follow-up): back these with real counts (pending user approvals,
// open orders, ...) once those endpoints exist.
export function useAdminNavBadges(): NavBadges {
  return {
    'user-management': 3,
    orders: 12,
  }
}

export function useDistributorNavBadges(): NavBadges {
  return {
    'dist-active-orders': 5,
  }
}
