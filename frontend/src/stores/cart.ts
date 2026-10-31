import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** What the cart remembers for display. The server re-prices everything at checkout. */
export interface CartLine {
  variantId: number
  /** Link to the product page (perfume or pack). */
  path: string
  name: string
  label: string
  price: number
  image: string | null
  /** Perfume type slug, used to draw the flacon when there is no photo. */
  typeSlug: string | null
  /** Product type slug (Parfums, Montres...), to draw the right placeholder when there is no photo. */
  rayonSlug?: string | null
  qty: number
}

const MAX_QTY = 50

interface CartState {
  lines: CartLine[]
  add: (line: Omit<CartLine, 'qty'>, qty?: number) => void
  setQty: (variantId: number, qty: number) => void
  remove: (variantId: number) => void
  clear: () => void
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      add: (line, qty = 1) =>
        set((s) => {
          const existing = s.lines.find((l) => l.variantId === line.variantId)
          if (existing) {
            return { lines: s.lines.map((l) => (l.variantId === line.variantId ? { ...l, ...line, qty: Math.min(l.qty + qty, MAX_QTY) } : l)) }
          }
          return { lines: [...s.lines, { ...line, qty: Math.min(qty, MAX_QTY) }] }
        }),
      setQty: (variantId, qty) =>
        set((s) => ({
          lines: qty < 1 ? s.lines.filter((l) => l.variantId !== variantId) : s.lines.map((l) => (l.variantId === variantId ? { ...l, qty: Math.min(qty, MAX_QTY) } : l)),
        })),
      remove: (variantId) => set((s) => ({ lines: s.lines.filter((l) => l.variantId !== variantId) })),
      clear: () => set({ lines: [] }),
    }),
    { name: 'cart', version: 2, migrate: () => ({ lines: [] }) },
  ),
)

export const cartCount = (lines: CartLine[]) => lines.reduce((n, l) => n + l.qty, 0)

/** Whether the slide-over cart is open. Not persisted. */
interface CartUi {
  open: boolean
  setOpen: (open: boolean) => void
}

export const useCartUi = create<CartUi>()((set) => ({ open: false, setOpen: (open) => set({ open }) }))
