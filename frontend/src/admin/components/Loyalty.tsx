import { Gift } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { formatPrice } from '@/shop/format'
import { apiError } from '../lib'
import { useRedeemGift } from '../queries'
import type { AdminProduct, AdminVariant, Loyalty } from '../types'
import { ConfirmDialog } from './common'
import { VariantPicker } from './VariantPicker'

/** "4 / 6 parfums achetés" and, when a gift is waiting, how much it should be worth. */
export function LoyaltyNote({ loyalty, adds = 0 }: { loyalty: Loyalty; adds?: number }) {
  const waiting = loyalty.pending.length
  const reaches = adds > 0 && loyalty.counted + adds >= loyalty.every

  return (
    <div className="space-y-1 text-sm">
      <p className="flex flex-wrap items-center gap-2">
        <Gift className="size-4 text-muted-foreground" aria-hidden />
        <span className="tnum">{`Fidélité : ${loyalty.counted} / ${loyalty.every} parfums achetés`}</span>
        {waiting > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">{waiting > 1 ? `${waiting} cadeaux à offrir` : 'Cadeau à offrir'}</span>}
      </p>
      {waiting > 0 && <p className="tnum text-muted-foreground">{`Valeur conseillée du cadeau : ${formatPrice(loyalty.pending[0].average_price)} (moyenne des ${loyalty.every} parfums).`}</p>}
      {reaches && <p className="font-medium">{`Avec cette commande, ce client atteint ${loyalty.every} parfums : un cadeau l'attend.`}</p>}
      {loyalty.given > 0 && <p className="tnum text-muted-foreground">{`${loyalty.given} cadeau${loyalty.given > 1 ? 'x' : ''} déjà offert${loyalty.given > 1 ? 's' : ''}.`}</p>}
    </div>
  )
}

/** Choose the sealed flacon to give; it may be worth more than the suggestion (the owner decides). */
export function GiftDialog({ customerId, name, loyalty, onClose }: { customerId: number; name: string; loyalty: Loyalty; onClose: () => void }) {
  const redeem = useRedeemGift()
  const [pick, setPick] = useState<{ variant: AdminVariant; product: AdminProduct } | null>(null)
  const [choosing, setChoosing] = useState(false)
  const suggested = loyalty.pending[0]?.average_price ?? 0
  const gap = pick ? pick.variant.price - suggested : 0

  return (
    <>
      <ConfirmDialog
        open={!choosing}
        onOpenChange={(o) => !o && onClose()}
        title={`Offrir le cadeau à ${name}`}
        description={`Il a acheté ${loyalty.every} parfums. Valeur conseillée : ${formatPrice(suggested)} (la moyenne de leurs prix). Vous pouvez offrir un flacon plus cher.`}
        confirmLabel="Offrir ce flacon"
        loading={redeem.isPending}
        onConfirm={() => {
          if (!pick) return toast.error('Choisissez le flacon à offrir.')
          redeem.mutate({ customerId, variantId: pick.variant.id }, { onSuccess: () => { toast.success('Cadeau enregistré.'); onClose() }, onError: (e) => toast.error(apiError(e)) })
        }}
      >
        <div className="space-y-2 text-sm">
          <button type="button" onClick={() => setChoosing(true)} className="w-full rounded-md border border-dashed border-input p-3 text-start hover:border-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
            {pick ? (
              <>
                <span className="block font-medium">{pick.product.name}</span>
                <span className="tnum block text-muted-foreground">{`${pick.variant.label}, ${formatPrice(pick.variant.price)}`}</span>
              </>
            ) : (
              'Choisir le flacon à offrir'
            )}
          </button>
          {pick && (
            <p className={gap > 0 ? 'tnum font-medium text-amber-800' : 'tnum text-muted-foreground'}>
              {gap > 0 ? `${formatPrice(gap)} au-dessus de la valeur conseillée.` : 'Dans la valeur conseillée.'}
            </p>
          )}
          <p className="text-muted-foreground">Le flacon sort du stock et son prix d'achat compte dans le bénéfice.</p>
        </div>
      </ConfirmDialog>
      <VariantPicker
        open={choosing}
        onOpenChange={setChoosing}
        kind="perfume"
        variantFilter={(v) => v.stock_mode === 'unit' && v.stock_qty > 0}
        title="Flacon à offrir"
        onPick={(variant, product) => setPick({ variant, product })}
      />
    </>
  )
}
