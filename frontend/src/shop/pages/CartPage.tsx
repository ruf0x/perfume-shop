import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { cartCount, useCart } from '@/stores/cart'
import { CartLineItem } from '../components/CartLineItem'
import { linkButton } from '../components/ui'
import { formatPrice } from '../format'
import { useCartQuote, useSettings } from '../queries'
import { useDocumentTitle } from '../useDocumentTitle'

export default function CartPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('meta.cart'))
  const lines = useCart((s) => s.lines)
  const count = cartCount(lines)
  const { data: quote, isError } = useCartQuote(lines)
  const { data: settings } = useSettings()

  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h1 className="text-4xl sm:text-5xl">{t('cart.empty')}</h1>
        <p className="mt-3 text-lg text-muted-foreground">{t('cart.emptyHint')}</p>
        <Link to="/boutique" className={linkButton('default', 'mt-8')}>
          {t('cart.discover')}
        </Link>
      </div>
    )
  }

  const subtotal = quote?.subtotal ?? lines.reduce((sum, l) => sum + l.price * l.qty, 0)
  const blocked = quote ? !quote.all_available : false
  const freeOver = settings?.free_delivery_over

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:py-14">
      <h1 className="text-4xl sm:text-5xl">{t('cart.title')}</h1>

      <div className="mt-8 grid gap-12 lg:grid-cols-[1fr_360px]">
        <ul className="divide-y divide-border border-y border-border">
          {lines.map((line) => (
            <CartLineItem key={line.variantId} line={line} quote={quote?.lines.find((q) => q.variant_id === line.variantId)} />
          ))}
        </ul>

        <aside className="h-fit space-y-5 rounded-md bg-secondary/70 p-6 lg:sticky lg:top-24" aria-label={t('cart.summary')}>
          <h2 className="text-xl">{t('cart.summary')}</h2>
          <dl className="space-y-2 text-[0.95rem]">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t('cart.subtotal', { count })}</dt>
              <dd className="tnum">{formatPrice(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t('cart.delivery')}</dt>
              <dd className="text-right text-muted-foreground">{t('cart.deliveryNext')}</dd>
            </div>
          </dl>
          {freeOver ? <p className="text-sm text-primary">{t('cart.freeOver', { amount: formatPrice(freeOver) })}</p> : null}

          {isError && <p className="text-sm text-destructive">{t('cart.quoteError')}</p>}
          {blocked && <p className="text-sm text-destructive">{t('cart.blocked')}</p>}

          {blocked ? (
            <span aria-disabled className={cn(linkButton(), 'pointer-events-none w-full opacity-50')}>
              {t('cart.checkout')}
            </span>
          ) : (
            <Link to="/commande" className={linkButton('default', 'w-full')}>
              {t('cart.checkout')}
            </Link>
          )}
          <Link to="/boutique" className="block text-center text-sm underline underline-offset-4 hover:no-underline">
            {t('cart.continue')}
          </Link>
        </aside>
      </div>
    </div>
  )
}
