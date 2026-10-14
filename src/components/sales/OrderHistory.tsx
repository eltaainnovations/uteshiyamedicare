import { Eye, Plus, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchPortalOrderDetail, fetchSalesOrderHistory, type SalesOrderHistoryItem } from '../../api/portalApi'
import type { OrderDetail } from '../../api/ordersApi'
import { ApiError } from '../../types/auth'
import { formatInr } from '../../utils/currency'
import PageSizeSelect from '../common/PageSizeSelect'
import Pagination from '../common/Pagination'

const STATUS_LABEL_TO_RAW: Record<string, string> = { 'Awaiting Approval': 'Draft', Rejected: 'Cancelled' }

const STATUS_STYLE: Record<string, string> = {
  'Awaiting Approval': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  Rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  Completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  Closed: 'bg-gray-100 text-gray-600 dark:bg-[#252836] dark:text-[#8892A4]',
  'To Deliver': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  'To Bill': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  'To Deliver and Bill': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function DetailDrawer({ name, onClose }: { name: string; onClose: () => void }) {
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
    <div className="fixed inset-0 bg-black/30 z-40 flex justify-end">
      <div className="w-full max-w-md bg-white dark:bg-[#1A1D2E] h-full shadow-2xl overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-[#252836] sticky top-0 bg-white dark:bg-[#1A1D2E]">
          <h3 className="text-base font-semibold font-mono text-gray-900 dark:text-[#E8EAF0]">{name}</h3>
          <button onClick={onClose}>
            <X size={18} className="text-gray-400" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!detail && !error && <p className="text-sm text-gray-400 dark:text-[#5A6075]">Loading…</p>}
          {detail && (
            <>
              <div>
                <p className="text-xs font-semibold text-gray-700 dark:text-[#C4C9D8] mb-2">
                  Order Items ({detail.items.length})
                </p>
                <div className="space-y-2">
                  {detail.items.map((it) => (
                    <div
                      key={it.itemCode}
                      className="flex items-center gap-2 p-2.5 bg-gray-50 dark:bg-[#161921] rounded-[8px]"
                    >
                      <span className="text-xs text-gray-700 dark:text-[#C4C9D8] flex-1 leading-snug">
                        {it.itemName ?? it.itemCode}
                      </span>
                      <span className="text-xs font-semibold text-gray-500 dark:text-[#8892A4] whitespace-nowrap">
                        ×{it.qty}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Value', formatInr(detail.items.reduce((s, i) => s + i.amount, 0))],
                  ['Status', detail.status],
                  ['Order Date', detail.transactionDate ?? '—'],
                  ['Expected Delivery', detail.deliveryDate ?? '—'],
                ].map(([l, v]) => (
                  <div key={l} className="bg-gray-50 dark:bg-[#161921] rounded-[8px] p-3">
                    <p className="text-[10px] text-gray-400 dark:text-[#5A6075]">{l}</p>
                    <p className="text-xs font-semibold text-gray-900 dark:text-[#E8EAF0] mt-0.5">{v}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function OrderHistory() {
  const navigate = useNavigate()

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('All Status')
  const [customer, setCustomer] = useState('All Customers')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const [items, setItems] = useState<SalesOrderHistoryItem[]>([])
  const [total, setTotal] = useState(0)
  const [distributors, setDistributors] = useState<{ name: string; customerName: string }[]>([])
  const [stats, setStats] = useState({ total: 0, pending: 0, approvedAndConverted: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detailName, setDetailName] = useState<string | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => window.clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    setPage(1)
  }, [search, status, customer, fromDate, toDate, pageSize])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchSalesOrderHistory({
      search: search || undefined,
      status: status === 'All Status' ? undefined : (STATUS_LABEL_TO_RAW[status] ?? status),
      customer: customer === 'All Customers' ? undefined : customer,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      page,
      pageSize,
    })
      .then((data) => {
        if (cancelled) return
        setItems(data.items)
        setTotal(data.total)
        setDistributors(data.distributors)
        setStats(data.stats)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof ApiError ? err.message : 'Could not load orders.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [search, status, customer, fromDate, toDate, page, pageSize])

  // Real, currently-visible statuses — not an invented fixed list.
  const statusOptions = useMemo(() => {
    const seen = new Set(items.map((i) => i.status))
    return ['All Status', ...Array.from(seen)]
  }, [items])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const hasActiveFilters = Boolean(search || status !== 'All Status' || customer !== 'All Customers' || fromDate || toDate)

  function clearFilters() {
    setSearchInput('')
    setStatus('All Status')
    setCustomer('All Customers')
    setFromDate('')
    setToDate('')
  }

  return (
    <div className="p-5 lg:p-7 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-[#E8EAF0]">Order History</h2>
          <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-0.5">All orders you've created, all-time</p>
        </div>
        <button
          onClick={() => navigate('/sales/create-order')}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded-[10px] hover:brightness-95 transition"
          style={{ background: '#147BA6' }}
        >
          <Plus size={14} /> Create New Customer Order
        </button>
      </div>

      {/* Mini Stats + Filters */}
      <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] p-4 border border-gray-100 dark:border-[#252836] shadow-sm space-y-3">
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-[8px] bg-gray-50 dark:bg-[#161921]">
            <span className="text-xs text-gray-500 dark:text-[#8892A4]">Total Orders:</span>
            <span className="text-sm font-bold text-gray-900 dark:text-[#E8EAF0]">{stats.total}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-[8px] bg-amber-50 dark:bg-amber-900/20">
            <span className="text-xs text-amber-600 dark:text-amber-400">Pending:</span>
            <span className="text-sm font-bold text-amber-700 dark:text-amber-400">{stats.pending}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-[8px] bg-green-50 dark:bg-green-900/20">
            <span className="text-xs text-green-600 dark:text-green-400">Approved &amp; Converted:</span>
            <span className="text-sm font-bold text-green-700 dark:text-green-400">{stats.approvedAndConverted}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 pt-1 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#5A6075]" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by Order Ref..."
              className="w-full pl-8 pr-4 py-2 text-sm border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] dark:text-[#E8EAF0] dark:placeholder-[#5A6075] rounded-[8px] outline-none focus:border-[#147BA6] transition"
            />
          </div>
          <select
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 dark:border-[#252836] rounded-[8px] outline-none focus:border-[#147BA6] bg-white dark:bg-[#13161F] text-gray-700 dark:text-[#C4C9D8] transition"
          >
            <option>All Customers</option>
            {distributors.map((d) => (
              <option key={d.name} value={d.name}>
                {d.customerName}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 dark:border-[#252836] rounded-[8px] outline-none focus:border-[#147BA6] bg-white dark:bg-[#13161F] text-gray-700 dark:text-[#C4C9D8] transition"
          >
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-[#8892A4]">
            <input
              type="date"
              value={fromDate}
              max={toDate || todayIso()}
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
          <PageSizeSelect value={pageSize} onChange={setPageSize} label="Orders per page" />
          {hasActiveFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-[#E8EAF0] transition">
              <X size={12} /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-[#161921] border-b border-gray-100 dark:border-[#252836]">
                {['Order Ref', 'Customer', 'Items & Quantity', 'Total Value', 'Created On', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-[#8892A4] uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {error ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-red-600">
                    {error}
                  </td>
                </tr>
              ) : loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-500 dark:text-[#8892A4]">
                    Loading…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400 dark:text-[#5A6075]">
                    No orders match your filters.
                  </td>
                </tr>
              ) : (
                items.map((o, i) => (
                  <tr
                    key={o.name}
                    className={`border-b border-gray-50 dark:border-[#252836] last:border-0 hover:bg-gray-50/50 dark:hover:bg-[#161921]/60 transition-colors ${i % 2 === 1 ? 'bg-gray-50/30 dark:bg-[#161921]/30' : ''}`}
                  >
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-[#147BA6] whitespace-nowrap">{o.name}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-[#E8EAF0] whitespace-nowrap">
                      {o.customerName ?? o.customer}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-[#8892A4]">
                      {o.itemCount} item{o.itemCount === 1 ? '' : 's'}
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-[#E8EAF0] whitespace-nowrap">
                      {formatInr(o.grandTotal)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-[#8892A4] whitespace-nowrap">{formatDate(o.transactionDate)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_STYLE[o.status] ?? 'bg-gray-100 text-gray-600 dark:bg-[#252836] dark:text-[#8892A4]'}`}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setDetailName(o.name)}
                        title="View Summary"
                        className="w-7 h-7 flex items-center justify-center rounded-[6px] text-gray-400 hover:text-[#147BA6] hover:bg-[#e8f4fa] dark:hover:bg-[rgba(20,123,166,0.15)] transition"
                      >
                        <Eye size={13} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!error && !loading && total > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 dark:border-[#252836]">
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </div>

      {detailName && <DetailDrawer name={detailName} onClose={() => setDetailName(null)} />}
    </div>
  )
}
