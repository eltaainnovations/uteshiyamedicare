import { X } from 'lucide-react'
import { useCart } from '../../context/CartContext'

export default function CartDrawer() {
  const { isOpen, closeCart } = useCart()

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={closeCart} />
      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white dark:bg-[#1A1D2E] shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-[#252836]">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-[#E8EAF0]">Your Cart</h2>
          <button
            onClick={closeCart}
            className="text-gray-400 hover:text-gray-600 dark:text-[#5A6075] dark:hover:text-[#8892A4]"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center p-8 text-center">
          <p className="text-sm text-gray-500 dark:text-[#8892A4]">
            Your cart is empty. Add products from the catalogue to get started.
          </p>
        </div>
      </aside>
    </>
  )
}
