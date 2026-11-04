import { Check, Minus, Package, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createSalesOrder, type SalesOrderCreateResult } from '../../api/portalApi'
import { useCart } from '../../context/CartContext'
import { clearAsyncDataCache } from '../../hooks/useAsyncData'
import { refreshDistributorActiveOrdersBadge } from '../../hooks/useNavBadges'
import { ApiError } from '../../types/auth'
import { formatInr } from '../../utils/currency'
import QtyInput from '../common/QtyInput'

// Local date, not toISOString() — that's still yesterday before 05:30 IST.
function todayIso(): string {
  return new Date().toLocaleDateString('en-CA')
}

export default function CartDrawer() {
  const navigate = useNavigate()
  const { isOpen, closeCart, items, subtotal, setQty, remove, clear } = useCart()
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [placed, setPlaced] = useState<SalesOrderCreateResult | null>(null)

  if (!isOpen) return null

  function handleClose() {
    closeCart()
    setPlaced(null)
    setSubmitError(null)
  }

  function goTo(path: string) {
    handleClose()
    navigate(path)
  }

  async function handleCheckout() {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const result = await createSalesOrder({
        transactionDate: todayIso(),
        items: items.map((i) => ({ itemCode: i.itemCode, qty: i.qty })),
      })
      setPlaced(result)
      clear()
      clearAsyncDataCache('dist-dashboard:')
      refreshDistributorActiveOrdersBadge()
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Could not place the order.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={handleClose} />
      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white dark:bg-[#1A1D2E] shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-[#252836]">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0]">
            Your Cart{items.length > 0 && ` (${items.length})`}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 dark:text-[#5A6075] dark:hover:text-[#8892A4]"
          >
            <X size={18} />
          </button>
        </div>

        {placed ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-[#e6f5f1] dark:bg-[rgba(31,138,112,0.15)] flex items-center justify-center">
              <Check size={26} className="text-[#1F8A70]" />
            </div>
            <h3 className="text-base font-bold text-gray-900 dark:text-[#E8EAF0]">
              {placed.status === 'Draft' ? 'Order saved, not confirmed yet' : 'Order placed'}
            </h3>
            <p className="text-sm font-mono font-semibold text-gray-900 dark:text-[#E8EAF0]">{placed.name}</p>
            {placed.status === 'Draft' && (
              <p className="text-xs text-gray-500 dark:text-[#8892A4]">
                We couldn't confirm this order automatically. Approve it from Pending Approvals on your dashboard.
                There's no need to place it again.
              </p>
            )}
            <button
              onClick={() =>
                goTo(placed.status === 'Draft' ? '/distributor/dashboard' : '/distributor/active-orders')
              }
              className="mt-2 px-5 py-2.5 rounded-[8px] text-sm font-semibold text-white"
              style={{ background: 'linear-gradient(135deg, #147BA6, #1F8A70)' }}
            >
              {placed.status === 'Draft' ? 'Go to Dashboard' : 'View Active Orders'}
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-8 text-center">
            <p className="text-sm text-gray-500 dark:text-[#8892A4]">
              Your cart is empty. Add products from the catalogue to get started.
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto divide-y divide-gray-50 dark:divide-[#252836]">
              {items.map((line) => (
                <div key={line.itemCode} className="flex gap-3 p-4">
                  <div className="w-14 h-14 flex-shrink-0 rounded-[8px] bg-gray-50 dark:bg-[#161921] border border-gray-100 dark:border-[#252836] flex items-center justify-center overflow-hidden">
                    {line.image ? (
                      <img src={line.image} alt={line.name} className="w-full h-full object-contain p-1" />
                    ) : (
                      <Package size={20} className="text-gray-300 dark:text-[#353848]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-900 dark:text-[#E8EAF0] leading-tight">{line.name}</p>
                    <p className="text-[10px] font-mono text-gray-400 dark:text-[#5A6075] mt-0.5">{line.itemCode}</p>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center border border-gray-200 dark:border-[#252836] rounded-[6px] overflow-hidden">
                        <button
                          onClick={() => setQty(line.itemCode, line.qty - 1)}
                          className="px-1.5 py-1 text-gray-500 dark:text-[#8892A4] hover:bg-gray-50 dark:hover:bg-[#1F2233] transition"
                        >
                          <Minus size={11} />
                        </button>
                        <QtyInput value={line.qty} onChange={(q) => setQty(line.itemCode, q)} className="w-12 text-xs" />
                        <button
                          onClick={() => setQty(line.itemCode, line.qty + 1)}
                          className="px-1.5 py-1 text-gray-500 dark:text-[#8892A4] hover:bg-gray-50 dark:hover:bg-[#1F2233] transition"
                        >
                          <Plus size={11} />
                        </button>
                      </div>
                      <span className="text-xs font-bold text-gray-900 dark:text-[#E8EAF0]">
                        {formatInr(line.price * line.qty)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => remove(line.itemCode)}
                    className="text-gray-300 hover:text-red-500 dark:text-[#5A6075] self-start"
                    aria-label="Remove"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-100 dark:border-[#252836] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-[#8892A4]">Subtotal</span>
                <span className="text-base font-bold text-gray-900 dark:text-[#E8EAF0]">{formatInr(subtotal)}</span>
              </div>
              {submitError && <p className="text-xs text-red-600">{submitError}</p>}
              <button
                disabled={submitting}
                onClick={() => void handleCheckout()}
                className="w-full py-2.5 text-sm font-semibold rounded-[8px] text-white disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(135deg, #147BA6, #1F8A70)' }}
              >
                {submitting ? 'Placing order…' : 'Place Order'}
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  )
}
