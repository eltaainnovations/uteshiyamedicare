import { createContext, useContext, useState, type ReactNode } from 'react'

interface CartContextValue {
  isOpen: boolean
  count: number
  openCart: () => void
  closeCart: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)

  // TODO(follow-up): back this with real line items once the Distributor
  // Product Catalogue "add to cart" flow exists.
  const count = 0

  return (
    <CartContext.Provider
      value={{ isOpen, count, openCart: () => setIsOpen(true), closeCart: () => setIsOpen(false) }}
    >
      {children}
    </CartContext.Provider>
  )
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within a CartProvider')
  return ctx
}
