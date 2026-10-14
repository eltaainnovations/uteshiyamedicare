import { useEffect, useState } from 'react'
import { fetchActiveOrders } from '../api/portalApi'
import type { Screen } from '../config/navigation'
import { clearAsyncDataCache, useAsyncData } from './useAsyncData'

export type NavBadges = Partial<Record<Screen, number>>

// TODO(follow-up): back this with a real count (pending user approvals, ...)
// once there's an endpoint for it.
export function useAdminNavBadges(): NavBadges {
  return {}
}

const DIST_ACTIVE_ORDERS_BADGE_CACHE_KEY = 'nav:dist-active-orders-count'
// DistributorPortal (and its badge hook) stays mounted across every
// /distributor/* route change — a plain window event is the simplest way
// for a page like DistActiveOrders, rendered as its child route, to tell
// that persistent hook instance "the count may have changed" without
// threading a callback down through Layout.
const REFRESH_EVENT = 'dist-active-orders-badge-refresh'

/** Call after an action that changes this distributor's Active Orders count
 * (currently: cancelling an order) so the sidebar badge updates immediately
 * instead of waiting for the next full reload. */
export function refreshDistributorActiveOrdersBadge(): void {
  clearAsyncDataCache(DIST_ACTIVE_ORDERS_BADGE_CACHE_KEY)
  window.dispatchEvent(new Event(REFRESH_EVENT))
}

export function useDistributorNavBadges(): NavBadges {
  const [refreshNonce, setRefreshNonce] = useState(0)

  useEffect(() => {
    const onRefresh = () => setRefreshNonce((n) => n + 1)
    window.addEventListener(REFRESH_EVENT, onRefresh)
    return () => window.removeEventListener(REFRESH_EVENT, onRefresh)
  }, [])

  // page_size=1 — only `total` is used, so this is the lightest call that
  // still goes through the real scoped Active Orders endpoint.
  const active = useAsyncData(
    () => fetchActiveOrders({ pageSize: 1 }),
    [refreshNonce],
    DIST_ACTIVE_ORDERS_BADGE_CACHE_KEY,
  )
  return {
    // undefined while loading / on error — Layout's `Boolean(badge)` check
    // already hides it rather than flashing a 0.
    'dist-active-orders': active.data?.total,
  }
}
