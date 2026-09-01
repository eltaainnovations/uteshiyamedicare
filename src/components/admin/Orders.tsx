import { ChevronRight, Package, Search, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import { fetchOrderDetail, fetchOrders, type OrderDetail, type OrderListItem } from '../../api/ordersApi'
import { ApiError } from '../../types/auth'
import DistributorTypeahead from '../common/DistributorTypeahead'
import Pagination from '../common/Pagination'

const PAGE_SIZE = 20

const STATUS_BADGE_CLS: Record<string, string> = {
  Draft: 'text-gray-500 bg-gray-100 dark:bg-[#252836] dark:text-[#8892A4]',
  'To Deliver': 'text-blue-700 bg-blue-100',
  'To Bill': 'text-purple-700 bg-purple-100',
  'To Deliver and Bill': 'text-amber-700 bg-amber-50',
  Completed: 'text-green-700 bg-green-50',
  Closed: 'text-gray-500 bg-gray-100 dark:bg-[#252836] dark:text-[#8892A4]',
  Cancelled: 'text-red-600 bg-red-50',
}
const DEFAULT_STATUS_CLS = 'text-gray-600 bg-gray-100 dark:bg-[#252836] dark:text-[#8892A4]'

function formatInr(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`
}

export default function Orders() {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [customer, setCustomer] = useState<string | null>(null)
  const [customerLabel, setCustomerLabel] = useState<string | null>(null)
  const [status, setStatus] = useState('All')
  const [page, setPage] = useState(1)

  const [items, setItems] = useState<OrderListItem[]>([])
  const [total, setTotal] = useState(0)
  const [statuses, setStatuses] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [detail, setDetail] = useState<OrderDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => window.clearTimeout(t)
  }, [searchInput])

  // Any filter change invalidates the current page number.
  useEffect(() => {
    setPage(1)
  }, [search, customer, status])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchOrders({
      search: search || undefined,
      customer: customer || undefined,
      status: status === 'All' ? undefined : status,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((data) => {
        if (cancelled) return
        setItems(data.items)
        setTotal(data.total)
        setStatuses(data.statuses)
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
  }, [search, customer, status, page])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  useEffect(() => {
    if (!selectedName) return
    let cancelled = false
    setDetailLoading(true)
    setDetailError(null)
    setDetail(null)
    fetchOrderDetail(selectedName)
      .then((data) => {
        if (!cancelled) setDetail(data)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setDetailError(err instanceof ApiError ? err.message : 'Could not load this order.')
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedName])

  // ── Detail view ──────────────────────────────────────────────────────

  if (selectedName) {
    return (
      <div className="p-5 lg:p-7 space-y-5">
        <button
          onClick={() => setSelectedName(null)}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-[#8892A4] hover:text-[#147BA6] transition"
        >
          <ChevronRight size={14} className="rotate-180" /> Back to Orders
        </button>

        {detailLoading && (
          <div className="bg-white dark:bg-[#1A1D2E] rounded-[14px] border border-gray-100 dark:border-[#252836] shadow-sm p-16 text-center text-sm text-gray-500 dark:text-[#8892A4]">
            Loading order…
          </div>
        )}

        {detailError && !detailLoading && (
          <div className="bg-white dark:bg-[#1A1D2E] rounded-[14px] border border-red-200 dark:border-red-900/40 shadow-sm p-8 text-center text-sm text-red-600">
            {detailError}
          </div>
        )}

        {detail && !detailLoading && !detailError && (
          <>
            <div className="bg-white dark:bg-[#1A1D2E] rounded-[14px] border border-gray-100 dark:border-[#252836] shadow-sm p-6">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-[#E8EAF0]">{detail.name}</h2>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE_CLS[detail.status] ?? DEFAULT_STATUS_CLS}`}
                    >
                      {detail.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-[#8892A4] mt-1">
                    {detail.customerName ?? detail.customer}{' '}
                    <span className="text-xs font-mono text-gray-400 dark:text-[#5A6075]">({detail.customer})</span>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-5 pt-5 border-t border-gray-100 dark:border-[#252836]">
                {[
                  ['Order Date', detail.transactionDate ?? '—'],
                  ['Delivery Date', detail.deliveryDate ?? '—'],
                  ['Grand Total', formatInr(detail.items.reduce((s, i) => s + i.amount, 0))],
                ].map(([k, v]) => (
                  <div key={k} className="bg-gray-50 dark:bg-[#161921] rounded-[8px] p-3">
                    <p className="text-[10px] font-medium text-gray-400 dark:text-[#5A6075] uppercase tracking-wide">
                      {k}
                    </p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0] mt-0.5">{v}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-[#1A1D2E] rounded-[14px] border border-gray-100 dark:border-[#252836] shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100 dark:border-[#252836]">
                <Package size={15} className="text-[#147BA6]" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0]">Items</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-[#161921] border-b border-gray-100 dark:border-[#252836]">
                      {['Item Code', 'Item Name', 'Qty', 'Rate', 'Amount'].map((h) => (
                        <th
                          key={h}
                          className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-[#5A6075] whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-[#252836]">
                    {detail.items.map((item, i) => (
                      <tr key={`${item.itemCode}-${i}`}>
                        <td className="px-5 py-3 text-xs font-mono font-semibold text-[#147BA6] whitespace-nowrap">
                          {item.itemCode}
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-900 dark:text-[#E8EAF0]">
                          {item.itemName ?? '—'}
                        </td>
                        <td className="px-5 py-3 text-xs text-gray-600 dark:text-[#8892A4]">{item.qty}</td>
                        <td className="px-5 py-3 text-xs text-gray-600 dark:text-[#8892A4]">{formatInr(item.rate)}</td>
                        <td className="px-5 py-3 text-sm font-semibold text-[#1F8A70]">{formatInr(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="bg-white dark:bg-[#1A1D2E] rounded-[14px] border border-gray-100 dark:border-[#252836] shadow-sm p-6">
                <div className="flex items-center gap-2 mb-4">
                  <User size={15} className="text-[#147BA6]" />
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0]">Sales Person(s)</h3>
                </div>
                {detail.salesTeam.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-[#5A6075]">Not on file.</p>
                ) : (
                  <div className="space-y-3">
                    {detail.salesTeam.map((s, i) => (
                      <div key={`${s.salesPerson}-${i}`} className="flex items-center justify-between">
                        <span className="text-sm text-gray-700 dark:text-[#C4C9D8]">{s.salesPerson}</span>
                        <span className="text-xs font-semibold text-gray-500 dark:text-[#8892A4]">
                          {s.allocatedPercentage}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white dark:bg-[#1A1D2E] rounded-[14px] border border-gray-100 dark:border-[#252836] shadow-sm p-6">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0] mb-4">Invoice</h3>
                {detail.invoice ? (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0]">{detail.invoice.name}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#e8f4fa] dark:bg-[rgba(20,123,166,0.15)] text-[#147BA6]">
                        {detail.invoice.status}
                      </span>
                      <span className="text-sm font-semibold text-[#1F8A70]">
                        {formatInr(detail.invoice.grandTotal)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 dark:text-[#5A6075]">Not available yet.</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  // ── List view ────────────────────────────────────────────────────────

  return (
    <div className="p-5 lg:p-7 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-[#E8EAF0]">Orders</h2>
          <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-0.5">
            {loading ? 'Loading…' : `${total} order${total === 1 ? '' : 's'}`}
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] p-4 border border-gray-100 dark:border-[#252836] shadow-sm flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#5A6075]" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by order ID..."
            className="w-full pl-8 pr-4 py-2 text-sm border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] dark:text-[#E8EAF0] rounded-[8px] outline-none focus:border-[#147BA6] transition"
          />
        </div>
        <DistributorTypeahead
          value={customer}
          label={customerLabel}
          onSelect={(name, label) => {
            setCustomer(name)
            setCustomerLabel(label)
          }}
          placeholder="Filter by distributor..."
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] dark:text-[#E8EAF0] rounded-[8px] outline-none focus:border-[#147BA6] transition"
        >
          <option value="All">All Statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-red-200 dark:border-red-900/40 shadow-sm p-8 text-center text-sm text-red-600">
          {error}
        </div>
      )}

      {!error && loading && (
        <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm p-16 text-center text-sm text-gray-500 dark:text-[#8892A4]">
          Loading orders…
        </div>
      )}

      {!error && !loading && items.length === 0 && (
        <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm p-16 text-center text-sm text-gray-500 dark:text-[#8892A4]">
          No orders found.
        </div>
      )}

      {!error && !loading && items.length > 0 && (
        <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-[#161921] border-b border-gray-100 dark:border-[#252836]">
                  {['Order ID', 'Distributor', 'Items', 'Value', 'Status', 'Delivery Date'].map((h) => (
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
                {items.map((o) => (
                  <tr
                    key={o.name}
                    onClick={() => setSelectedName(o.name)}
                    className="hover:bg-gray-50/60 dark:hover:bg-[#1F2233] transition cursor-pointer"
                  >
                    <td className="px-5 py-3.5 text-xs font-mono font-semibold text-[#147BA6] whitespace-nowrap">
                      {o.name}
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-xs font-semibold text-gray-900 dark:text-[#E8EAF0]">
                        {o.customerName ?? o.customer}
                      </p>
                      <p className="text-[10px] font-mono text-gray-400 dark:text-[#5A6075]">{o.customer}</p>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-gray-600 dark:text-[#8892A4]">{o.itemCount}</td>
                    <td className="px-5 py-3.5 text-xs font-semibold text-gray-900 dark:text-[#E8EAF0]">
                      {formatInr(o.grandTotal)}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE_CLS[o.status] ?? DEFAULT_STATUS_CLS}`}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-gray-600 dark:text-[#8892A4]">{o.deliveryDate ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!error && !loading && total > 0 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      )}
    </div>
  )
}
