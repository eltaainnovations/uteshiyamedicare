import { Minus, Package, Plus, Trash2, X } from 'lucide-react'
import { useCart } from '../../context/CartContext'
import { formatInr } from '../../utils/currency'

export default function CartDrawer() {
  const { isOpen, closeCart, items, subtotal, setQty, remove } = useCart()

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={closeCart} />
      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white dark:bg-[#1A1D2E] shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-[#252836]">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0]">
            Your Cart{items.length > 0 && ` (${items.length})`}
          </h2>
          <button
            onClick={closeCart}
            className="text-gray-400 hover:text-gray-600 dark:text-[#5A6075] dark:hover:text-[#8892A4]"
          >
            <X size={18} />
          </button>
        </div>

        {items.length === 0 ? (
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
                      <img src={line.image} alt={line.name} className="w-full h-full object-cover" />
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
                        <span className="px-2 text-xs font-bold text-gray-900 dark:text-[#E8EAF0]">{line.qty}</span>
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
              <button
                disabled
                title="Order placement is not wired up yet"
                className="w-full py-2.5 text-sm font-semibold rounded-[8px] bg-gray-100 dark:bg-[#1E2130] text-gray-400 dark:text-[#5A6075] cursor-not-allowed"
              >
                Checkout — coming soon
              </button>
              <p className="text-[10px] text-center text-gray-400 dark:text-[#5A6075]">
                Placing orders from the portal isn't available yet.
              </p>
            </div>
          </>
        )}
      </aside>
    </>
  )
}
