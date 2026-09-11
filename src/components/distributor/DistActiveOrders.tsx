import {
  CheckCircle,
  Clock,
  FileText,
  Lock,
  Package,
  Search,
  Truck,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cancelPortalOrder, fetchActiveOrders, fetchPortalOrderDetail } from '../../api/portalApi'
import type { OrderDetail, OrderListItem } from '../../api/ordersApi'
import { ApiError } from '../../types/auth'
import { formatInr } from '../../utils/currency'

const STATUS_CONFIG: Record<string, { icon: LucideIcon; cls: string }> = {
  'To Deliver': { icon: Truck, cls: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' },
  'To Bill': { icon: FileText, cls: 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400' },
  'To Deliver and Bill': {
    icon: Package,
    cls: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400',
  },
  Completed: { icon: CheckCircle, cls: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' },
  Closed: { icon: Lock, cls: 'bg-gray-100 dark:bg-[#252836] text-gray-600 dark:text-[#8892A4]' },
  Cancelled: { icon: XCircle, cls: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' },
}
const DEFAULT_STATUS = { icon: Clock, cls: 'bg-gray-100 dark:bg-[#252836] text-gray-600 dark:text-[#8892A4]' }

const CANCELLABLE = new Set(['To Deliver', 'To Bill', 'To Deliver and Bill'])

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? DEFAULT_STATUS
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.cls}`}>
      <Icon size={11} />
      {status}
    </span>
  )
}

function DetailDrawer({ name, onClose }: { name: string; onClose: () => void }) {
  const navigate = useNavigate()
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
                      <Package size={13} className="text-gray-400 flex-shrink-0" />
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
              <button
                onClick={() => navigate('/distributor/track-shipment')}
                className="w-full py-2.5 text-sm text-white rounded-[10px] font-semibold hover:brightness-95 transition"
                style={{ background: '#147BA6' }}
              >
                Track Shipment
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function DistActiveOrders() {
  const [orders, setOrders] = useState<OrderListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [detailName, setDetailName] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  function load() {
    setLoading(true)
    setError(null)
    return fetchActiveOrders({ pageSize: 100 })
      .then((r) => setOrders(r.items))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load orders.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? orders.filter((o) => o.name.toLowerCase().includes(q)) : orders
  }, [orders, search])

  async function handleCancel(name: string) {
    if (!window.confirm(`Cancel order ${name}? This can't be undone.`)) return
    setCancelling(name)
    setActionError(null)
    try {
      await cancelPortalOrder(name)
      await load()
    } catch (e) {
      setActionError(
        e instanceof ApiError
          ? `${name}: ${e.message}`
          : `Could not cancel ${name}.`,
      )
    } finally {
      setCancelling(null)
    }
  }

  return (
    <div className="p-5 lg:p-7 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-[#E8EAF0]">Active Orders</h2>
        <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-0.5">
          {loading ? 'Loading…' : `${orders.length} order${orders.length === 1 ? '' : 's'} in progress`}
        </p>
      </div>

      <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] p-4 border border-gray-100 dark:border-[#252836] shadow-sm">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#5A6075]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by order ID…"
            className="w-full pl-8 pr-4 py-2 text-sm border border-gray-200 dark:border-[#252836] dark:bg-[#13161F] dark:text-[#E8EAF0] rounded-[8px] outline-none focus:border-[#147BA6] transition"
          />
        </div>
      </div>

      {actionError && (
        <p className="text-xs text-red-600 bg-red-50 dark:bg-[rgba(220,38,38,0.1)] rounded-[8px] px-3 py-2">
          {actionError}
        </p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!error && !loading && filtered.length === 0 && (
        <div className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm p-14 text-center text-sm text-gray-400 dark:text-[#5A6075]">
          {orders.length === 0 ? 'No orders in progress.' : 'No orders match your search.'}
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((o) => (
          <div
            key={o.name}
            className="bg-white dark:bg-[#1A1D2E] rounded-[12px] border border-gray-100 dark:border-[#252836] shadow-sm p-5 hover:shadow-md transition"
          >
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm font-bold font-mono text-[#147BA6]">{o.name}</p>
                <p className="text-xs text-gray-500 dark:text-[#8892A4] mt-0.5">
                  Placed {o.transactionDate ?? '—'} · {o.itemCount} item{o.itemCount === 1 ? '' : 's'}
                </p>
              </div>
              <StatusBadge status={o.status} />
            </div>
            <div className="flex items-center justify-between mt-4">
              <div>
                <p className="text-xs text-gray-400 dark:text-[#5A6075]">Order Value</p>
                <p className="text-base font-bold text-gray-900 dark:text-[#E8EAF0]">{formatInr(o.grandTotal)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400 dark:text-[#5A6075]">Expected Delivery</p>
                <p className="text-sm font-semibold text-gray-700 dark:text-[#C4C9D8]">{o.deliveryDate ?? '—'}</p>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setDetailName(o.name)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 dark:border-[#252836] rounded-[8px] text-gray-600 dark:text-[#96A0B4] hover:bg-gray-50 dark:hover:bg-[#1F2233] transition"
              >
                View Details
              </button>
              {CANCELLABLE.has(o.status) && (
                <button
                  onClick={() => handleCancel(o.name)}
                  disabled={cancelling === o.name}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-red-200 dark:border-red-900/40 rounded-[8px] text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition disabled:opacity-50"
                >
                  <XCircle size={12} />
                  {cancelling === o.name ? 'Cancelling…' : 'Cancel'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {detailName && <DetailDrawer name={detailName} onClose={() => setDetailName(null)} />}
    </div>
  )
}
