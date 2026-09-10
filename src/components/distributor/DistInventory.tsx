import { AlertTriangle, ChevronDown, Minus, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchPortalInventory, updatePortalThreshold, type PortalInventoryItem } from '../../api/portalApi'
import { ApiError } from '../../types/auth'
import { formatInr } from '../../utils/currency'
import Pagination from '../common/Pagination'

type AlertLevel = 'out-of-stock' | 'critical' | 'low' | null

const ALERT_BADGE: Record<Exclude<AlertLevel, null>, { label: string; cls: string }> = {
  'out-of-stock': { label: 'Out of Stock', cls: 'bg-red-100 text-red-700' },
  critical: { label: 'Critical', cls: 'bg-red-100 text-red-700' },
  low: { label: 'Low Stock', cls: 'bg-amber-100 text-amber-700' },
}

const PAGE_SIZE = 20

function alertLevel(it: PortalInventoryItem): AlertLevel {
  if (it.quantity <= 0) return 'out-of-stock'
  if (it.lowStockThreshold == null) return null
  if (it.quantity <= Math.ceil(it.lowStockThreshold * 0.5)) return 'critical'
  if (it.quantity <= it.lowStockThreshold) return 'low'
  return null
}

function stockPct(threshold: number, quantity: number): number {
  // The reference's "how close to 2× reorder level" fill. Only meaningful
  // when a threshold is set — otherwise the bar is hidden entirely.
  return Math.min(100, Math.round((quantity / Math.max(threshold * 2, 1)) * 100))
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function DistInventory() {
  const navigate = useNavigate()
  const [items, setItems] = useState<PortalInventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [cat, setCat] = useState('All Categories')
  const [alertFilter, setAlertFilter] = useState<'all' | 'alerts'>('all')
  const [dismissed, setDismissed] = useState(false)
  const [page, setPage] = useState(1)

  const [editingCode, setEditingCode] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [savingCode, setSavingCode] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchPortalInventory()
      .then((data) => {
        if (!cancelled) setItems(data)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load inventory.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setPage(1)
  }, [search, cat, alertFilter])

  const categories = useMemo(
    () => ['All Categories', ...[...new Set(items.map((i) => i.category).filter((c): c is string => !!c))].sort()],
    [items],
  )

  const alertItems = useMemo(() => items.filter((i) => alertLevel(i) !== null), [items])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((i) => {
      const matchSearch =
        !q || i.itemName.toLowerCase().includes(q) || i.itemCode.toLowerCase().includes(q)
      const matchCat = cat === 'All Categories' || i.category === cat
      const matchAlert = alertFilter === 'all' || alertLevel(i) !== null
      return matchSearch && matchCat && matchAlert
    })
  }, [items, search, cat, alertFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  async function commitThreshold(item: PortalInventoryItem) {
    setEditingCode(null)
    const trimmed = editValue.trim()
    const next = trimmed === '' ? null : Math.max(0, Math.round(Number(trimmed)))
    if (trimmed !== '' && Number.isNaN(Number(trimmed))) return
    if (next === item.lowStockThreshold) return

    setSavingCode(item.itemCode)
    const prev = items
    setItems((cur) =>
      cur.map((i) => (i.itemCode === item.itemCode ? { ...i, lowStockThreshold: next } : i)),
    )
    try {
      await updatePortalThreshold(item.itemCode, next)
    } catch {
      setItems(prev) // roll back
    } finally {
      setSavingCode(null)
    }
  }

  function startSubtract(item: PortalInventoryItem) {
    // Subtraction happens by recording an End User Record for this item —
    // that form (separate task) performs the decrement. Hand it the
    // pre-fill via router state; until it exists this lands on the
    // End User Records placeholder.
    navigate('/distributor/end-users', {
      state: {
        fromInventory: {
          itemCode: item.itemCode,
          itemName: item.itemName,
          unit: item.unit,
          maxQuantity: item.quantity,
        },
      },
    })
  }

  return (
    <div className="p-5 lg:p-7 space-y-5">
      {!dismissed && alertItems.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-[10px] bg-amber-50 dark:bg-[rgba(245,158,11,0.12)] border border-amber-200 dark:border-[rgba(245,158,11,0.3)]">
          <AlertTriangle size={18} className="text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-300 font-medium flex-1">
            <span className="font-bold">
              {alertItems.length} item{alertItems.length === 1 ? '' : 's'}
            </span>{' '}
            {alertItems.length === 1 ? 'has' : 'have'} reached or fallen below reorder level and{' '}
            {alertItems.length === 1 ? 'needs' : 'need'} attention.
          </p>
          <button
            onClick={() => setAlertFilter(alertFilter === 'alerts' ? 'all' : 'alerts')}
            className="text-xs font-semibold text-amber-700 dark:text-amber-400 underline whitespace-nowrap"
          >
            {alertFilter === 'alerts' ? 'Show all' : 'View alerts'}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 ml-1"
          >
            <X size={15} />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-[#E8EAF0]">Inventory</h2>
          <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-0.5">
            {loading
              ? 'Loading…'
              : `${items.length} product${items.length === 1 ? '' : 's'} · ${alertItems.length} reorder alert${alertItems.length === 1 ? '' : 's'}`}
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] p-4 border border-gray-100 dark:border-[#252836] shadow-sm flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#5A6075]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by product name or SKU..."
            className="w-full pl-8 pr-4 py-2 text-sm border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] dark:text-[#E8EAF0] rounded-[8px] outline-none focus:border-[#147BA6] transition"
          />
        </div>
        <div className="relative">
          <select
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] dark:text-[#E8EAF0] rounded-[8px] outline-none focus:border-[#147BA6] transition cursor-pointer"
          >
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <ChevronDown
            size={13}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
        </div>
        <button
          onClick={() => setAlertFilter(alertFilter === 'alerts' ? 'all' : 'alerts')}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-[8px] border transition ${
            alertFilter === 'alerts'
              ? 'bg-amber-500 text-white border-amber-500'
              : 'border-amber-300 text-amber-700 dark:text-amber-400 dark:border-amber-600 hover:bg-amber-50 dark:hover:bg-[rgba(245,158,11,0.1)]'
          }`}
        >
          <AlertTriangle size={12} />
          Reorder Alerts ({alertItems.length})
        </button>
      </div>

      <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-[#161921] border-b border-gray-100 dark:border-[#252836]">
                {['Product', 'SKU', 'Category', 'Stock', 'Reorder Level', 'Reorder Alert', 'Stock Value', 'Last Updated', 'Actions'].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-[#5A6075] whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-[#252836]">
              {loading && (
                <tr>
                  <td colSpan={9} className="px-4 py-14 text-center text-sm text-gray-400 dark:text-[#5A6075]">
                    Loading inventory…
                  </td>
                </tr>
              )}
              {error && !loading && (
                <tr>
                  <td colSpan={9} className="px-4 py-14 text-center text-sm text-red-600">
                    {error}
                  </td>
                </tr>
              )}
              {!loading &&
                !error &&
                pageRows.map((item) => {
                  const level = alertLevel(item)
                  const badge = level ? ALERT_BADGE[level] : null
                  const pct = item.lowStockThreshold != null ? stockPct(item.lowStockThreshold, item.quantity) : null
                  const unit = item.unit ?? ''
                  return (
                    <tr
                      key={item.itemCode}
                      className={`hover:bg-gray-50/60 dark:hover:bg-[#1F2233] transition ${
                        level ? 'bg-red-50/20 dark:bg-[rgba(220,38,38,0.03)]' : ''
                      }`}
                    >
                      <td className="px-4 py-3.5">
                        <p className="text-xs font-semibold text-gray-900 dark:text-[#E8EAF0] max-w-[220px] leading-tight">
                          {item.itemName}
                        </p>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-[10px] font-mono text-gray-500 dark:text-[#5A6075]">{item.itemCode}</span>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-gray-600 dark:text-[#8892A4] whitespace-nowrap">
                        {item.category ?? '—'}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2 min-w-[90px]">
                          {pct != null && (
                            <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-[#252836] overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  pct < 30 ? 'bg-red-500' : pct < 60 ? 'bg-amber-400' : 'bg-[#1F8A70]'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          )}
                          <span
                            className={`text-xs font-bold tabular-nums ${
                              item.quantity <= 0 ? 'text-red-600' : 'text-gray-900 dark:text-[#E8EAF0]'
                            } ${pct == null ? 'flex-1' : ''}`}
                          >
                            {item.quantity} {unit}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-xs whitespace-nowrap">
                        {editingCode === item.itemCode ? (
                          <input
                            autoFocus
                            type="number"
                            min={0}
                            defaultValue={item.lowStockThreshold ?? ''}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => commitThreshold(item)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                              if (e.key === 'Escape') setEditingCode(null)
                            }}
                            className="w-16 px-1.5 py-1 text-xs border border-[#147BA6] rounded-[6px] outline-none dark:bg-[#13161F] dark:text-[#E8EAF0]"
                          />
                        ) : (
                          <button
                            onClick={() => {
                              setEditingCode(item.itemCode)
                              setEditValue(item.lowStockThreshold?.toString() ?? '')
                            }}
                            className="text-gray-500 dark:text-[#8892A4] hover:text-[#147BA6] hover:underline decoration-dotted"
                            title="Click to edit reorder threshold"
                          >
                            {savingCode === item.itemCode
                              ? 'saving…'
                              : item.lowStockThreshold != null
                                ? `${item.lowStockThreshold} ${unit}`
                                : 'Set alert'}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {badge ? (
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}
                          >
                            <AlertTriangle size={9} />
                            {badge.label}
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-400 dark:text-[#5A6075]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs font-medium text-gray-700 dark:text-[#C4C9D8] whitespace-nowrap">
                        {item.value == null ? '—' : formatInr(item.value)}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-gray-500 dark:text-[#5A6075] whitespace-nowrap">
                        {formatDate(item.updatedAt)}
                      </td>
                      <td className="px-4 py-3.5">
                        <button
                          onClick={() => startSubtract(item)}
                          disabled={item.quantity <= 0}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-semibold text-amber-700 bg-amber-50 dark:bg-[rgba(245,158,11,0.1)] hover:bg-amber-100 dark:hover:bg-[rgba(245,158,11,0.18)] rounded-[6px] transition whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Record an End-User / Implant entry — this reduces stock"
                        >
                          <Minus size={10} /> Subtract
                        </button>
                      </td>
                    </tr>
                  )
                })}
              {!loading && !error && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-14 text-center">
                    <p className="text-sm font-medium text-gray-400 dark:text-[#5A6075]">
                      {items.length === 0
                        ? 'No inventory yet — stock is credited automatically when your orders are completed.'
                        : 'No inventory items match your filters'}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {!loading && !error && filtered.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-[#252836]">
            <span className="text-xs text-gray-400 dark:text-[#5A6075]">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </div>
    </div>
  )
}
