import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

export interface CartLine {
  /** ERPNext item_code of the exact SKU being ordered — the variant code
   * when a variant is chosen, otherwise the product's own code. This is
   * the cart key. */
  itemCode: string
  name: string
  price: number
  listPrice: number | null
  image: string | null
  qty: number
}

interface CartContextValue {
  isOpen: boolean
  items: CartLine[]
  /** Distinct line count — what the header badge shows. */
  count: number
  subtotal: number
  openCart: () => void
  closeCart: () => void
  add: (line: Omit<CartLine, 'qty'>, qty: number) => void
  setQty: (itemCode: string, qty: number) => void
  remove: (itemCode: string) => void
}

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  // In-memory only — the catalogue task scopes out cart persistence and
  // order placement; this holds a working basket for the current session.
  const [items, setItems] = useState<CartLine[]>([])

  const add: CartContextValue['add'] = (line, qty) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.itemCode === line.itemCode)
      if (existing) {
        return prev.map((i) => (i.itemCode === line.itemCode ? { ...i, qty: i.qty + qty } : i))
      }
      return [...prev, { ...line, qty }]
    })
  }

  const setQty: CartContextValue['setQty'] = (itemCode, qty) => {
    setItems((prev) =>
      qty <= 0
        ? prev.filter((i) => i.itemCode !== itemCode)
        : prev.map((i) => (i.itemCode === itemCode ? { ...i, qty } : i)),
    )
  }

  const remove: CartContextValue['remove'] = (itemCode) =>
    setItems((prev) => prev.filter((i) => i.itemCode !== itemCode))

  const subtotal = useMemo(() => items.reduce((s, i) => s + i.price * i.qty, 0), [items])

  return (
    <CartContext.Provider
      value={{
        isOpen,
        items,
        count: items.length,
        subtotal,
        openCart: () => setIsOpen(true),
        closeCart: () => setIsOpen(false),
        add,
        setQty,
        remove,
      }}
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
