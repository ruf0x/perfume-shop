import { useEffect } from 'react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { useCart } from '@/stores/cart'
import { useCartQuote } from './queries'

/**
 * Keeps the stored cart honest: drops lines that no longer exist and lowers quantities that
 * exceed the stock. Mount it once (ShopLayout); every cart view shares the same cached quote.
 */
export function useCartSync() {
  const { t } = useTranslation()
  const lines = useCart((s) => s.lines)
  const remove = useCart((s) => s.remove)
  const setQty = useCart((s) => s.setQty)
  const { data: quote } = useCartQuote(lines)

  useEffect(() => {
    if (!quote) return

    const gone = quote.removed.filter((id) => lines.some((l) => l.variantId === id))
    gone.forEach(remove)
    if (gone.length) toast.info(t('cart.removedNotice', { count: gone.length }))

    for (const q of quote.lines) {
      const line = lines.find((l) => l.variantId === q.variant_id)
      if (line && q.max_qty > 0 && line.qty > q.max_qty) {
        setQty(q.variant_id, q.max_qty)
        toast.info(t('cart.adjustedNotice', { name: q.product, count: q.max_qty }))
      }
    }
  }, [quote]) // eslint-disable-line react-hooks/exhaustive-deps
}
