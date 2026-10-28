import { toast } from 'sonner'
import { printOrderSlip, printReceipt } from './print'
import type { Order } from './types'

/** Prints the slip, or explains why nothing opened (pop-up blocker). */
export function print(order: Order, shopName: string) {
  if (!printOrderSlip(order, shopName)) toast.error("Impossible d'ouvrir la fenêtre d'impression. Autorisez les pop-ups pour ce site.")
}

export function printTicket(order: Order, shop: { name: string; phone?: string | null; address?: string | null }) {
  if (!printReceipt(order, shop)) toast.error("Impossible d'ouvrir la fenêtre d'impression. Autorisez les pop-ups pour ce site.")
}
