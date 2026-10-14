import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchPortalOrderDetail,
  fetchSalesApprovals,
  type SalesApprovalOrder,
  type SalesApprovalStatus,
} from '../../api/portalApi'
import { useCart } from '../../context/CartContext'
import { ApiError } from '../../types/auth'
import { formatInr } from '../../utils/currency'

const statusBadge: Record<SalesApprovalStatus, string> = {
  'Awaiting Approval': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  Approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  Rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function PendingApprovals() {
  const navigate = useNavigate()
  const { add, clear } = useCart()

  const [filter, setFilter] = useState<'All' | SalesApprovalStatus>('All')
  const [items, setItems] = useState<SalesApprovalOrder[]>([])
  const [awaiting, setAwaiting] = useState(0)
  const [approved, setApproved] = useState(0)
  const [rejected, setRejected] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [resubmitting, setResubmitting] = useState<string | null>(null)
  const [resubmitError, setResubmitError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchSalesApprovals()
      .then((data) => {
        if (cancelled) return
        setItems(data.items)
        setAwaiting(data.awaiting)
        setApproved(data.approved)
        setRejected(data.rejected)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof ApiError ? err.message : 'Could not load your orders.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const visible = filter === 'All' ? items : items.filter((o) => o.status === filter)

  async function handleResubmit(name: string) {
    setResubmitting(name)
    setResubmitError(null)
    try {
      const detail = await fetchPortalOrderDetail(name)
      clear()
      for (const item of detail.items) {
        add({ itemCode: item.itemCode, name: item.itemName ?? item.itemCode, price: item.rate, listPrice: null, image: null }, item.qty)
      }
      navigate('/sales/create-order')
    } catch (err) {
      setResubmitError(err instanceof ApiError ? err.message : 'Could not load this order to resubmit.')
    } finally {
      setResubmitting(null)
    }
  }

  return (
    <div className="p-5 lg:p-7 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-[#E8EAF0]">Pending Approvals</h1>
        <p className="text-sm text-gray-500 dark:text-[#8892A4] mt-0.5">Status of orders you've created</p>
      </div>

      {/* Stat Chips */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setFilter(filter === 'Awaiting Approval' ? 'All' : 'Awaiting Approval')}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border transition-all ${
            filter === 'Awaiting Approval'
              ? 'bg-amber-500 border-amber-500 text-white'
              : 'bg-amber-100 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-400'
          }`}
        >
          <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center font-bold">
            {awaiting}
          </span>
          Awaiting
        </button>
        <button
          onClick={() => setFilter(filter === 'Approved' ? 'All' : 'Approved')}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border transition-all ${
            filter === 'Approved'
              ? 'bg-emerald-500 border-emerald-500 text-white'
              : 'bg-emerald-100 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400'
          }`}
        >
          <span className="w-5 h-5 rounded-full bg-emerald-500 text-white text-xs flex items-center justify-center font-bold">
            {approved}
          </span>
          Approved
        </button>
        <button
          onClick={() => setFilter(filter === 'Rejected' ? 'All' : 'Rejected')}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border transition-all ${
            filter === 'Rejected'
              ? 'bg-red-500 border-red-500 text-white'
              : 'bg-red-100 dark:bg-red-900/20 border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-400'
          }`}
        >
          <span className="w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold">
            {rejected}
          </span>
          Rejected
        </button>
      </div>

      {resubmitError && (
        <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-red-200 dark:border-red-900/40 shadow-sm p-4 text-center text-sm text-red-600">
          {resubmitError}
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-[#161921] border-b border-gray-100 dark:border-[#252836]">
                {['Order ID', 'Customer', 'Items', 'Amount', 'Sent On', 'Status', 'Actions'].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-[#8892A4] uppercase tracking-wide whitespace-nowrap"
                  >
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
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <p className="text-sm text-gray-400 dark:text-[#5A6075]">No orders match the selected filter.</p>
                      {filter !== 'All' && (
                        <button onClick={() => setFilter('All')} className="text-xs text-[#147BA6] font-medium hover:underline mt-1">
                          Show all orders
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                visible.map((order, i) => (
                  <tr
                    key={order.name}
                    className={`border-b border-gray-50 dark:border-[#252836] last:border-0 hover:bg-gray-50/50 dark:hover:bg-[#161921]/60 transition-colors ${i % 2 === 1 ? 'bg-gray-50/30 dark:bg-[#161921]/30' : ''}`}
                  >
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-[#147BA6] whitespace-nowrap">{order.name}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-[#E8EAF0] whitespace-nowrap">
                      {order.customerName ?? order.customer}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-[#8892A4]">
                      {order.itemCount} item{order.itemCount === 1 ? '' : 's'}
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-[#E8EAF0] whitespace-nowrap">
                      {formatInr(order.grandTotal)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-[#8892A4] whitespace-nowrap">{formatDate(order.transactionDate)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${statusBadge[order.status]}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {order.status === 'Rejected' ? (
                        <button
                          onClick={() => handleResubmit(order.name)}
                          disabled={resubmitting === order.name}
                          className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline whitespace-nowrap disabled:opacity-50"
                        >
                          {resubmitting === order.name ? 'Loading…' : 'Resubmit'}
                        </button>
                      ) : (
                        <span className="text-gray-300 dark:text-[#5A6075] text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
