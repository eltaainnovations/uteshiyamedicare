import { useEffect, useState } from 'react'
import { ApiError } from '../types/auth'

// Module-level (not component state) so it survives a component
// unmount/remount — e.g. navigating away from the Dashboard and back —
// for as long as the page itself stays loaded. Cleared only by
// clearAsyncDataCache (the Dashboard's Refresh button) or a full reload.
const dataCache = new Map<string, unknown>()

/** Drops cached entries so the next mount/deps-change fetches fresh.
 * Pass a prefix to clear only that section's keys (e.g. "dashboard:"),
 * or omit it to clear everything. */
export function clearAsyncDataCache(prefix?: string): void {
  if (!prefix) {
    dataCache.clear()
    return
  }
  for (const key of dataCache.keys()) {
    if (key.startsWith(prefix)) dataCache.delete(key)
  }
}

/** Generic fetch-with-loading-error hook — refetches whenever `deps`
 * change, ignores results from a stale in-flight call. Shared by
 * Analytics and the Admin Dashboard, both of which independently load
 * several chart/KPI sections rather than gating on one page-level spinner.
 *
 * Pass `cacheKey` to have the result persist across unmounts (module-level
 * cache, not per-component state): if that key is already cached when this
 * hook (re-)runs, it serves the cached value immediately with no fetch and
 * no loading flicker. Callers that want a "stale until explicitly
 * refreshed" section (e.g. a dashboard you navigate back to) should include
 * a cache-clearing call (clearAsyncDataCache) in their refresh handler,
 * paired with a dep that changes on refresh so the effect re-runs. Callers
 * that omit cacheKey get the original always-refetch-on-mount behavior.
 */
export function useAsyncData<T>(
  fetchFn: () => Promise<T>,
  deps: unknown[],
  cacheKey?: string,
): { data: T | null; loading: boolean; error: string | null } {
  const cached = cacheKey ? (dataCache.get(cacheKey) as T | undefined) : undefined
  const [data, setData] = useState<T | null>(cached ?? null)
  const [loading, setLoading] = useState(cached === undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const existing = cacheKey ? dataCache.get(cacheKey) : undefined
    if (existing !== undefined) {
      setData(existing as T)
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    fetchFn()
      .then((d) => {
        if (cancelled) return
        setData(d)
        if (cacheKey) dataCache.set(cacheKey, d)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load this section.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, loading, error }
}
