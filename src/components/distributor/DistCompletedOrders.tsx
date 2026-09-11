import { CheckCircle, Eye, FileText, Lock, RotateCcw, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  fetchCompletedOrders,
  fetchPortalOrderDetail,
  fetchReorderItems,
  type CompletedOrder,
  type CompletedOrdersStats,
} from '../../api/portalApi'
import { useCart } from '../../context/CartContext'
import { ApiError } from '../../types/auth'
import type { OrderDetail } from '../../api/ordersApi'
import { formatInr } from '../../utils/currency'
import Pagination from '../common/Pagination'

const PAGE_SIZE = 20

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}
const todayIso = () => new Date().toISOString().slice(0, 10)

function StatusBadge({ status }: { status: string }) {
  const closed = status === 'Closed'
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
        closed
          ? 'bg-gray-100 dark:bg-[#252836] text-gray-600 dark:text-[#8892A4]'
          : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
      }`}
    >
      {closed ? <Lock size={9} /> : <CheckCircle size={9} />}
      {status}
    </span>
  )
}

function DetailModal({ name, onClose }: { name: string; onClose: () => void }) {
  const [detail, setDetail] = useState<OrderDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    fetchPortalOrderDetail(name)
      .then((d) => !cancelled && setDetail(d))
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : 'Could not load order.'))
    return () => {
      cancelled = true
    }
  }, [name])

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#1A1D2E] rounded-[16px] shadow-xl w-full max-w-lg border border-gray-100 dark:border-[#252836] max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-[#252836] sticky top-0 bg-white dark:bg-[#1A1D2E]">
          <h3 className="text-sm font-semibold font-mono text-gray-900 dark:text-[#E8EAF0]">{name}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!detail && !error && <p className="text-sm text-gray-400 dark:text-[#5A6075]">Loading…</p>}
          {detail && (
            <>
              <div className="grid grid-cols-3 gap-3">
                {[
                  ['Status', detail.status],
                  ['Order Date', detail.transactionDate ?? '—'],
                  ['Delivered', detail.deliveryDate ?? '—'],
                ].map(([l, v]) => (
                  <div key={l} className="bg-gray-50 dark:bg-[#161921] rounded-[8px] p-2.5">
                    <p className="text-[10px] text-gray-400 dark:text-[#5A6075]">{l}</p>
                    <p className="text-xs font-semibold text-gray-900 dark:text-[#E8EAF0] mt-0.5">{v}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-700 dark:text-[#C4C9D8] mb-2">
                  Items ({detail.items.length})
                </p>
                <table className="w-full">
                  <tbody className="divide-y divide-gray-50 dark:divide-[#252836]">
                    {detail.items.map((it) => (
                      <tr key={it.itemCode}>
                        <td className="py-2 pr-3 text-xs text-gray-800 dark:text-[#C4C9D8]">
                          {it.itemName ?? it.itemCode}
                        </td>
                        <td className="py-2 px-2 text-xs text-gray-500 dark:text-[#8892A4] whitespace-nowrap text-right">
                          ×{it.qty}
                        </td>
                        <td className="py-2 pl-3 text-xs font-semibold text-gray-900 dark:text-[#E8EAF0] whitespace-nowrap text-right">
                          {formatInr(it.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function DistCompletedOrders() {
  const { add, openCart } = useCart()
  const [orders, setOrders] = useState<CompletedOrder[]>([])
  const [stats, setStats] = useState<CompletedOrdersStats>({ totalCompleted: 0, totalValue: 0, avgOrderValue: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [fromDate, setFromDate] = useState(isoDaysAgo(365))
  const [toDate, setToDate] = useState(todayIso())
  const [page, setPage] = useState(1)

  const [detailName, setDetailName] = useState<string | null>(null)
  const [reordered, setReordered] = useState<Set<string>>(new Set())
  const [reordering, setReordering] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchCompletedOrders({ fromDate, toDate })
      .then((d) => {
        if (cancelled) return
        setOrders(d.items)
        setStats(d.stats)
      })
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : 'Could not load orders.'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [fromDate, toDate])

  useEffect(() => {
    setPage(1)
  }, [search, fromDate, toDate])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return orders
    return orders.filter(
      (o) => o.name.toLowerCase().includes(q) || o.itemNames.some((n) => n.toLowerCase().includes(q)),
    )
  }, [orders, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  async function handleReorder(name: string) {
    setReordering(name)
    try {
      const lines = await fetchReorderItems(name)
      const priced = lines.filter((l) => l.price != null)
      priced.forEach((l) =>
        add(
          { itemCode: l.itemCode, name: l.itemName ?? l.itemCode, price: l.price as number, listPrice: null, image: null },
          Math.max(1, Math.round(l.quantity)),
        ),
      )
      setReordered((s) => new Set([...s, name]))
      openCart()
    } catch {
      /* surfaced by the button staying in its normal state */
    } finally {
      setReordering(null)
    }
  }

  const kpis = [
    { label: 'Total Completed', value: String(stats.totalCompleted), color: '#16A34A' },
    { label: 'Total Value', value: formatInr(stats.totalValue), color: '#147BA6' },
    { label: 'Avg Order Value', value: formatInr(stats.avgOrderValue), color: '#7C3AED' },
  ]

  return (
    <div className="p-5 lg:p-7 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-[#E8EAF0]">Completed Orders</h2>
        <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-0.5">
          Past delivered &amp; closed orders — review items and reorder at current prices
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="bg-white dark:bg-[#1A1D2E] rounded-[12px] p-4 border border-gray-100 dark:border-[#252836] shadow-sm text-center"
          >
            <p className="text-lg font-bold" style={{ color: k.color }}>
              {loading ? '…' : k.value}
            </p>
            <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] p-4 border border-gray-100 dark:border-[#252836] shadow-sm flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#5A6075]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Order ID or item name…"
            className="w-full pl-8 pr-4 py-2 text-sm border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] dark:text-[#E8EAF0] rounded-[8px] outline-none focus:border-[#147BA6] transition"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-[#8892A4]">
          <input
            type="date"
            value={fromDate}
            max={toDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="px-2 py-1.5 border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] dark:text-[#E8EAF0] rounded-[8px] outline-none focus:border-[#147BA6]"
          />
          <span>–</span>
          <input
            type="date"
            value={toDate}
            min={fromDate}
            max={todayIso()}
            onChange={(e) => setToDate(e.target.value)}
            className="px-2 py-1.5 border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] dark:text-[#E8EAF0] rounded-[8px] outline-none focus:border-[#147BA6]"
          />
        </div>
        {search && (
          <button
            onClick={() => setSearch('')}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-[#E8EAF0] transition"
          >
            <X size={12} /> Clear
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-[#161921] border-b border-gray-100 dark:border-[#252836]">
                {['Order ID', 'Delivered', 'Items', 'Amount', 'Invoice No', 'Status', 'Actions'].map((h) => (
                  <th
                    key={h}
                    className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-[#5A6075] whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-[#252836]">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center text-sm text-gray-400 dark:text-[#5A6075]">
                    Loading orders…
                  </td>
                </tr>
              )}
              {error && !loading && (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center text-sm text-red-600">
                    {error}
                  </td>
                </tr>
              )}
              {!loading &&
                !error &&
                pageRows.map((o) => (
                  <tr key={o.name} className="hover:bg-gray-50/60 dark:hover:bg-[#1F2233] transition">
                    <td className="px-5 py-3.5">
                      <span className="text-xs font-mono font-semibold text-[#147BA6]">{o.name}</span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-gray-600 dark:text-[#96A0B4] whitespace-nowrap">
                      {o.deliveryDate ?? o.transactionDate ?? '—'}
                    </td>
                    <td className="px-5 py-3.5 min-w-[220px]">
                      <button
                        onClick={() => setDetailName(o.name)}
                        className="text-xs font-medium text-gray-900 dark:text-[#E8EAF0] hover:text-[#147BA6] text-left leading-snug"
                      >
                        {o.itemCount} item{o.itemCount === 1 ? '' : 's'}
                      </button>
                      <p className="text-[10px] text-gray-400 dark:text-[#5A6075] mt-0.5 max-w-[280px] truncate">
                        {o.itemNames.slice(0, 2).join(', ')}
                        {o.itemNames.length > 2 ? ` +${o.itemNames.length - 2} more` : ''}
                      </p>
                    </td>
                    <td className="px-5 py-3.5 text-xs font-bold text-gray-900 dark:text-[#E8EAF0] whitespace-nowrap">
                      {formatInr(o.grandTotal)}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-gray-400 dark:text-[#5A6075] whitespace-nowrap italic">
                      Unavailable
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleReorder(o.name)}
                          disabled={reordering === o.name || reordered.has(o.name)}
                          className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-[6px] transition whitespace-nowrap disabled:opacity-60 ${
                            reordered.has(o.name)
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                              : 'text-white hover:brightness-95'
                          }`}
                          style={!reordered.has(o.name) ? { background: '#147BA6' } : undefined}
                        >
                          <RotateCcw size={10} />
                          {reordered.has(o.name) ? 'Added' : reordering === o.name ? 'Adding…' : 'Reorder'}
                        </button>
                        <button
                          disabled
                          title="Invoice download unavailable — Sales Invoice access pending"
                          className="w-7 h-7 flex items-center justify-center rounded-[6px] text-gray-300 dark:text-[#3A3F52] cursor-not-allowed"
                        >
                          <FileText size={13} />
                        </button>
                        <button
                          onClick={() => setDetailName(o.name)}
                          className="w-7 h-7 flex items-center justify-center rounded-[6px] text-gray-400 hover:text-[#147BA6] hover:bg-[#e8f4fa] dark:hover:bg-[rgba(20,123,166,0.15)] transition"
                          title="View details"
                        >
                          <Eye size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              {!loading && !error && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center text-sm text-gray-400 dark:text-[#5A6075]">
                    {orders.length === 0
                      ? 'No completed orders in this date range.'
                      : 'No orders match your search.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {!loading && !error && filtered.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 dark:border-[#252836]">
            <span className="text-xs text-gray-500 dark:text-[#8892A4]">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </div>

      {detailName && <DetailModal name={detailName} onClose={() => setDetailName(null)} />}
    </div>
  )
}
