import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { cartCount, useCart, useCartUi } from '@/stores/cart'
import { formatPrice } from '../format'
import { useCartQuote } from '../queries'
import { CartLineItem } from './CartLineItem'
import { linkButton } from './ui'

/** The slide-over cart opened from the header. */
export function CartDrawer() {
  const { t } = useTranslation()
  const { open, setOpen } = useCartUi()
  const lines = useCart((s) => s.lines)
  const count = cartCount(lines)
  const { data: quote } = useCartQuote(lines)
  const close = () => setOpen(false)

  const subtotal = quote?.subtotal ?? lines.reduce((sum, l) => sum + l.price * l.qty, 0)
  const blocked = quote ? !quote.all_available : false

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border p-5">
          <SheetTitle className="font-display text-xl">{t('cart.title')}</SheetTitle>
          <SheetDescription className="sr-only">{t('cart.drawerDescription')}</SheetDescription>
        </SheetHeader>

        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-start justify-center gap-4 p-8">
            <p className="font-display text-2xl">{t('cart.empty')}</p>
            <p className="text-muted-foreground">{t('cart.emptyHint')}</p>
            <Link to="/boutique" onClick={close} className={linkButton()}>
              {t('cart.discover')}
            </Link>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-border overflow-y-auto px-5">
              {lines.map((line) => (
                <CartLineItem key={line.variantId} line={line} quote={quote?.lines.find((q) => q.variant_id === line.variantId)} onNavigate={close} compact />
              ))}
            </ul>

            <div className="space-y-4 border-t border-border p-5">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">{t('cart.subtotal', { count })}</span>
                <span className="tnum text-lg font-medium">{formatPrice(subtotal)}</span>
              </div>
              <p className="text-sm text-muted-foreground">{blocked ? t('cart.blocked') : t('cart.deliveryNote')}</p>
              <div className="grid gap-2">
                {blocked ? (
                  <span aria-disabled className={cn(linkButton(), 'pointer-events-none opacity-50')}>
                    {t('cart.checkout')}
                  </span>
                ) : (
                  <Link to="/commande" onClick={close} className={linkButton()}>
                    {t('cart.checkout')}
                  </Link>
                )}
                <Link to="/panier" onClick={close} className={linkButton('outline')}>
                  {t('cart.viewCart')}
                </Link>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
