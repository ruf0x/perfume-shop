import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CartLine {
  variantId: number
  qty: number
  name: string
  label: string
  price: number
  image: string | null
}

interface CartState {
  lines: CartLine[]
  clear: () => void
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      clear: () => set({ lines: [] }),
    }),
    { name: 'cart' },
  ),
)
