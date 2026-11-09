import { Gift } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { formatPrice } from '@/shop/format'
import { useIsOwner } from '../auth'
import { apiError, formatDate } from '../lib'
import { useLoyaltyDetail, useLoyaltySuggestions, useRedeemGift } from '../queries'
import type { AdminProduct, AdminVariant, Loyalty } from '../types'
import { ConfirmDialog } from './common'
import { VariantPicker } from './VariantPicker'

/**
 * "4 / 6 parfums achetés", the total, and when a gift is waiting how much it should be worth. With `customerId`
 * the owner also gets the detail: every round of six, its perfumes, its average and its gift.
 */
export function LoyaltyNote({ loyalty, adds = 0, customerId }: { loyalty: Loyalty; adds?: number; customerId?: number | null }) {
  const waiting = loyalty.pending.length
  const reaches = adds > 0 && loyalty.counted + adds >= loyalty.every
  const owner = useIsOwner()
  const [detail, setDetail] = useState(false)

  return (
    <div className="space-y-1 text-sm">
      <p className="flex flex-wrap items-center gap-2">
        <Gift className="size-4 text-muted-foreground" aria-hidden />
        <span className="tnum">{`Fidélité : ${loyalty.counted} / ${loyalty.every} parfums achetés`}</span>
        {waiting > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">{waiting > 1 ? `${waiting} cadeaux à offrir` : 'Cadeau à offrir'}</span>}
      </p>
      <p className="tnum text-muted-foreground">{`${loyalty.total} parfum${loyalty.total > 1 ? 's' : ''} acheté${loyalty.total > 1 ? 's' : ''} au total.`}</p>
      {waiting > 0 && <p className="tnum text-muted-foreground">{`Valeur conseillée du cadeau : ${formatPrice(loyalty.pending[0].average_price)} (moyenne des ${loyalty.every} parfums).`}</p>}
      {reaches && <p className="font-medium">{`Avec cette commande, ce client atteint ${loyalty.every} parfums : un cadeau l'attend.`}</p>}
      {loyalty.given > 0 && <p className="tnum text-muted-foreground">{`${loyalty.given} cadeau${loyalty.given > 1 ? 'x' : ''} déjà offert${loyalty.given > 1 ? 's' : ''}.`}</p>}
      {owner && customerId && loyalty.total > 0 && (
        <>
          <button type="button" className="font-medium underline underline-offset-4" onClick={() => setDetail(true)}>Voir le détail des parfums</button>
          {detail && <LoyaltyDetail customerId={customerId} onClose={() => setDetail(false)} />}
        </>
      )}
    </div>
  )
}

/** The perfumes of a customer in rounds: 0 to 6, 6 to 12, 12 to 18… with each round's average and gift. */
function LoyaltyDetail({ customerId, onClose }: { customerId: number; onClose: () => void }) {
  const q = useLoyaltyDetail(customerId)
  const tiers = q.data?.tiers ?? []

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Parfums achetés</DialogTitle>
          <DialogDescription>{q.data?.loyalty ? `${q.data.loyalty.total} parfum${q.data.loyalty.total > 1 ? 's' : ''} au total, par tranches de ${q.data.loyalty.every}. Chaque tranche complète donne un cadeau.` : 'Chargement…'}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {tiers.map((t) => (
            <section key={t.number} className={cn('rounded-xl border p-4', t.complete ? 'border-border' : 'border-dashed border-input')}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="tnum font-semibold">{`De ${t.from} à ${t.to}`}</h3>
                {t.complete ? (
                  t.reward?.status === 'given' ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900">Cadeau offert</span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Cadeau à offrir</span>
                  )
                ) : (
                  <span className="tnum text-xs text-muted-foreground">{`En cours : ${t.perfumes.length} / ${t.to - t.from}`}</span>
                )}
              </div>
              {t.average !== null && <p className="tnum mt-1 text-sm text-muted-foreground">{`${t.complete ? 'Moyenne des prix' : 'Moyenne pour le moment'} : ${formatPrice(t.average)}`}</p>}
              {t.reward?.status === 'given' && t.reward.gift_name && <p className="tnum mt-1 text-sm">{`Cadeau : ${t.reward.gift_name}${t.reward.gift_value ? `, ${formatPrice(t.reward.gift_value)}` : ''}`}</p>}
              {t.perfumes.length > 0 ? (
                <ul className="mt-3 divide-y divide-border text-sm">
                  {t.perfumes.map((p, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-3 py-1.5">
                      <span className="min-w-0 truncate">{p.name}</span>
                      <span className="tnum shrink-0 text-xs text-muted-foreground">{`${p.order ?? ''}${p.date ? `, ${formatDate(p.date)}` : ''}`}</span>
                      <span className="tnum shrink-0">{formatPrice(p.price)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Aucun parfum pour le moment.</p>
              )}
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface Pick {
  variantId: number
  name: string
  label: string
  price: number
}

/**
 * Choose the gift: a flacon or a decant size of a perfume. The perfumes worth about the round's average are
 * proposed first (a quarter above or below); the owner may pick anything else, even something dearer.
 */
export function GiftDialog({ customerId, name, loyalty, onClose }: { customerId: number; name: string; loyalty: Loyalty; onClose: () => void }) {
  const redeem = useRedeemGift()
  const suggestions = useLoyaltySuggestions(customerId)
  const [pick, setPick] = useState<Pick | null>(null)
  const [choosing, setChoosing] = useState(false)
  const suggested = loyalty.pending[0]?.average_price ?? 0
  const gap = pick ? pick.price - suggested : 0
  const items = suggestions.data?.items ?? []

  return (
    <>
      <ConfirmDialog
        open={!choosing}
        onOpenChange={(o) => !o && onClose()}
        title={`Offrir le cadeau à ${name}`}
        description={`Il a acheté ${loyalty.every} parfums. Valeur conseillée : ${formatPrice(suggested)} (la moyenne de leurs prix). Vous pouvez offrir un parfum plus cher.`}
        confirmLabel="Offrir ce parfum"
        loading={redeem.isPending}
        onConfirm={() => {
          if (!pick) return toast.error('Choisissez le parfum à offrir.')
          redeem.mutate({ customerId, variantId: pick.variantId }, { onSuccess: () => { toast.success('Cadeau enregistré.'); onClose() }, onError: (e) => toast.error(apiError(e)) })
        }}
      >
        <div className="space-y-3 text-sm">
          {suggestions.data && (
            <div>
              <p className="tnum mb-2 font-medium">{`Propositions entre ${formatPrice(suggestions.data.from)} et ${formatPrice(suggestions.data.to)}`}</p>
              {items.length === 0 ? (
                <p className="text-muted-foreground">Aucun parfum en stock dans cette fourchette : choisissez-en un autre ci-dessous.</p>
              ) : (
                <ul className="flex max-h-44 flex-wrap gap-2 overflow-y-auto">
                  {items.map((s) => (
                    <li key={s.variant_id}>
                      <button
                        type="button"
                        aria-pressed={pick?.variantId === s.variant_id}
                        onClick={() => setPick({ variantId: s.variant_id, name: s.product, label: s.label, price: s.price })}
                        className={cn('rounded-lg border px-3 py-2 text-start hover:border-primary focus-visible:outline-2 focus-visible:outline-ring', pick?.variantId === s.variant_id ? 'border-primary bg-accent' : 'border-input')}
                      >
                        <span className="block font-medium">{s.product}</span>
                        <span className="tnum block text-xs text-muted-foreground">{`${s.label}, ${formatPrice(s.price)}`}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <Button type="button" variant="outline" className="h-10 w-full" onClick={() => setChoosing(true)}>Choisir un autre parfum</Button>

          {pick && (
            <div className="rounded-md bg-secondary/60 p-3">
              <p className="font-medium">{pick.name}</p>
              <p className="tnum text-muted-foreground">{`${pick.label}, ${formatPrice(pick.price)}`}</p>
              <p className={cn('tnum mt-1', gap > 0 ? 'font-medium text-amber-800' : 'text-muted-foreground')}>
                {gap > 0 ? `${formatPrice(gap)} au-dessus de la valeur conseillée.` : 'Dans la valeur conseillée.'}
              </p>
            </div>
          )}
          <p className="text-muted-foreground">Le cadeau sort du stock (le flacon, ou les ml et une bouteille) et son prix d'achat compte dans le bénéfice.</p>
        </div>
      </ConfirmDialog>
      <VariantPicker
        open={choosing}
        onOpenChange={setChoosing}
        kind="perfume"
        variantFilter={(v: AdminVariant, p: AdminProduct) => (v.stock_mode === 'unit' && v.stock_qty > 0) || (v.stock_mode === 'pool' && p.stock_ml >= (v.ml ?? 0))}
        title="Parfum à offrir"
        onPick={(variant, product) => setPick({ variantId: variant.id, name: product.name, label: variant.label, price: variant.price })}
      />
    </>
  )
}
