import { Trash2 } from 'lucide-react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useCart, type CartLine } from '@/stores/cart'
import { formatPrice } from '../format'
import type { QuoteLine } from '../types'
import { ProductVisual } from './ProductVisual'
import { QtyStepper } from './QtyStepper'

interface CartLineItemProps {
  line: CartLine
  /** What the server says about this line; the stored price is only a fallback. */
  quote?: QuoteLine
  onNavigate?: () => void
  compact?: boolean
}

export function CartLineItem({ line, quote, onNavigate, compact }: CartLineItemProps) {
  const { t } = useTranslation()
  const { setQty, remove } = useCart()

  const unitPrice = quote?.unit_price ?? line.price
  const total = quote?.line_total ?? unitPrice * line.qty
  const soldOut = quote ? !quote.available : false
  const max = quote ? Math.max(quote.max_qty, 1) : 50

  return (
    <li className="flex gap-4 py-5">
      <Link to={line.path} onClick={onNavigate} className="block w-20 shrink-0 overflow-hidden rounded-md bg-secondary" tabIndex={-1} aria-hidden>
        <div className="aspect-[4/5]">
          <ProductVisual image={line.image} name={line.name} type={line.typeSlug} rayon={line.rayonSlug} />
        </div>
      </Link>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link to={line.path} onClick={onNavigate} className="block truncate font-display text-base leading-snug hover:underline">
              {line.name}
            </Link>
            <p className="text-sm text-muted-foreground">{line.label}</p>
          </div>
          <p className="tnum shrink-0 text-sm font-medium">{formatPrice(total)}</p>
        </div>

        {soldOut && <p className="mt-1 text-sm text-destructive">{t('cart.lineSoldOut')}</p>}
        {!soldOut && quote && line.qty > quote.max_qty && <p className="mt-1 text-sm text-destructive">{t('cart.lineMax', { count: quote.max_qty })}</p>}

        <div className="mt-auto flex items-center justify-between pt-3">
          {soldOut ? <span /> : <QtyStepper value={line.qty} max={max} onChange={(q) => setQty(line.variantId, q)} className={compact ? 'scale-95 origin-left' : ''} />}
          <button
            type="button"
            onClick={() => remove(line.variantId)}
            className="flex items-center gap-1.5 rounded-md px-2 py-2 text-sm text-muted-foreground hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Trash2 className="size-4" aria-hidden />
            {t('common.remove')}
          </button>
        </div>
      </div>
    </li>
  )
}
