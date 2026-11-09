import { Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { formatPrice } from '@/shop/format'
import { useCommunes, useWilayas } from '@/shop/queries'
import { QtyStepper } from '@/shop/components/QtyStepper'
import { apiError } from '../lib'
import { useUpdateOrder } from '../queries'
import type { Order } from '../types'
import { ClientPicker } from './ClientPicker'
import { inputClass } from './common'
import { VariantPicker } from './VariantPicker'

interface Line {
  variant_id: number | null
  name: string
  label: string
  unit_price: number
  quantity: number
}

const label = 'space-y-1 text-sm'
const hint = 'text-muted-foreground'

/**
 * Corrects an order: client details, items, delivery fee, discount while it is pending or confirmed. Once it is
 * shipped, delivered, sold or cancelled only the client (and, for a caisse sale, how it was paid) can still change.
 */
export function OrderEdit({ order, onDone }: { order: Order; onDone: () => void }) {
  const full = order.status === 'en_attente' || order.status === 'confirmee'
  const isPos = order.channel === 'pos'
  const [payment, setPayment] = useState<'especes' | 'carte' | 'ccp'>(order.payment_method === 'carte' || order.payment_method === 'ccp' ? order.payment_method : 'especes')
  const [received, setReceived] = useState(order.amount_received !== null ? String(order.amount_received) : '')
  const update = useUpdateOrder()
  const wilayas = useWilayas()
  const [picker, setPicker] = useState(false)

  const [f, setF] = useState({
    first_name: order.customer.first_name ?? '',
    last_name: order.customer.last_name ?? '',
    phone: order.customer.phone ?? '',
    phone2: order.customer.phone2 ?? '',
    wilaya_id: order.wilaya?.id ?? 0,
    commune_id: order.commune?.id ?? 0,
    address: order.address ?? '',
    delivery_mode: order.delivery_mode ?? 'domicile',
    delivery_fee: order.delivery_fee,
    discount: order.discount,
  })
  const original = useMemo<Line[]>(() => (order.items ?? []).map((i) => ({ variant_id: i.variant_id, name: i.product_name, label: i.variant_label, unit_price: i.unit_price, quantity: i.quantity })), [order])
  const [lines, setLines] = useState<Line[]>(original)
  const communes = useCommunes(f.wilaya_id || null)

  const locked = original.some((l) => l.variant_id === null)
  const changed = JSON.stringify(lines.map((l) => [l.variant_id, l.quantity])) !== JSON.stringify(original.map((l) => [l.variant_id, l.quantity]))
  const subtotal = lines.reduce((s, l) => s + l.unit_price * l.quantity, 0)
  const total = subtotal + f.delivery_fee - f.discount
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }))

  const addLine = (variantId: number, name: string, variantLabel: string, price: number) =>
    setLines((ls) => (ls.some((l) => l.variant_id === variantId) ? ls.map((l) => (l.variant_id === variantId ? { ...l, quantity: l.quantity + 1 } : l)) : [...ls, { variant_id: variantId, name, label: variantLabel, unit_price: price, quantity: 1 }]))

  const save = () => {
    if (!full) {
      const typed = [f.first_name, f.last_name, f.phone].some((v) => v.trim() !== '')
      if (isPos && typed && [f.first_name, f.last_name, f.phone].some((v) => v.trim() === '')) return toast.error('Pour enregistrer le client, indiquez son prénom, son nom et son téléphone.')
      // Only what can still change; empty fields are left out (a caisse sale may have no client yet).
      const body: Record<string, unknown> = { id: order.id }
      for (const [k, v] of Object.entries({ first_name: f.first_name, last_name: f.last_name, phone: f.phone, phone2: f.phone2 })) if (v.trim() !== '') body[k] = v.trim()
      if (f.phone2.trim() === '' && order.customer.phone2) body.phone2 = null
      if (f.wilaya_id) body.wilaya_id = f.wilaya_id
      if (f.commune_id) body.commune_id = f.commune_id
      if (f.address.trim() !== '') body.address = f.address.trim()
      if (isPos) {
        body.payment_method = payment
        if (payment === 'especes') body.amount_received = received === '' ? order.total : Number(received)
      }

      return update.mutate(body as { id: number } & Record<string, unknown>, { onSuccess: () => { toast.success('Informations modifiées.'); onDone() }, onError: (e) => toast.error(apiError(e)) })
    }
    if (lines.length === 0) return toast.error('La commande doit contenir au moins un article.')
    update.mutate(
      {
        id: order.id,
        first_name: f.first_name,
        last_name: f.last_name,
        phone: f.phone,
        phone2: f.phone2 || null,
        wilaya_id: f.wilaya_id || null,
        commune_id: f.commune_id || null,
        address: f.address || null,
        delivery_mode: f.delivery_mode,
        delivery_fee: f.delivery_fee,
        discount: f.discount,
        ...(changed ? { lines: lines.map((l) => ({ variant_id: l.variant_id, quantity: l.quantity })) } : {}),
      },
      { onSuccess: () => { toast.success('Commande modifiée.'); onDone() }, onError: (e) => toast.error(apiError(e)) },
    )
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="font-display text-lg">Client</h3>
        {!full && isPos ? (
          <ClientPicker
            value={{ first_name: f.first_name, last_name: f.last_name, phone: f.phone, wilaya_id: f.wilaya_id, commune_id: f.commune_id }}
            onChange={(c) => setF((s) => ({ ...s, ...c }))}
          />
        ) : (
        <div className="grid grid-cols-2 gap-3">
          <label className={label}><span className={hint}>Prénom</span><input className={inputClass} value={f.first_name} onChange={(e) => set('first_name', e.target.value)} /></label>
          <label className={label}><span className={hint}>Nom de famille</span><input className={inputClass} value={f.last_name} onChange={(e) => set('last_name', e.target.value)} /></label>
          <label className={label}><span className={hint}>Téléphone</span><input className={inputClass} inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></label>
          <label className={label}><span className={hint}>Second téléphone</span><input className={inputClass} inputMode="tel" value={f.phone2} onChange={(e) => set('phone2', e.target.value)} /></label>
          {full && <label className={label}>
            <span className={hint}>Livraison</span>
            <select className={inputClass} value={f.delivery_mode} onChange={(e) => set('delivery_mode', e.target.value as typeof f.delivery_mode)}>
              <option value="domicile">À domicile</option>
              <option value="stop_desk">Point relais</option>
              <option value="boutique">Retrait en boutique</option>
            </select>
          </label>}
          <label className={label}>
            <span className={hint}>Wilaya</span>
            <select className={inputClass} value={f.wilaya_id} onChange={(e) => setF((s) => ({ ...s, wilaya_id: Number(e.target.value), commune_id: 0 }))}>
              <option value={0}>—</option>
              {wilayas.data?.map((w) => <option key={w.id} value={w.id}>{w.code} – {w.name}</option>)}
            </select>
          </label>
          <label className={label}>
            <span className={hint}>Commune</span>
            <select className={inputClass} value={f.commune_id} disabled={!f.wilaya_id} onChange={(e) => set('commune_id', Number(e.target.value))}>
              <option value={0}>—</option>
              {communes.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className={`${label} col-span-2`}><span className={hint}>Adresse</span><input className={inputClass} value={f.address} onChange={(e) => set('address', e.target.value)} /></label>
        </div>
        )}
      </section>

      {!full && (
        <p className="rounded-md bg-secondary/60 p-3 text-sm text-muted-foreground">
          {`Les articles, la remise et la livraison ne se modifient plus une fois la commande expédiée, vendue ou annulée. Vous pouvez corriger le client${isPos ? ' et le mode de paiement' : ''}.`}
          {isPos && !order.customer.phone && <span className="mt-1 block">{"Ajoutez son téléphone pour l'enregistrer comme client (ses parfums comptent alors pour la fidélité)."}</span>}
        </p>
      )}

      {!full && isPos && (
        <section className="space-y-3">
          <h3 className="font-display text-lg">Paiement</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>
              <span className={hint}>Mode de paiement</span>
              <select className={inputClass} value={payment} onChange={(e) => setPayment(e.target.value as typeof payment)}>
                <option value="especes">Espèces</option>
                <option value="carte">Carte</option>
                <option value="ccp">CCP / BaridiMob</option>
              </select>
            </label>
            {payment === 'especes' && <label className={label}><span className={hint}>Montant reçu (DA)</span><input type="number" min={0} className={inputClass} value={received} placeholder={String(order.total)} onChange={(e) => setReceived(e.target.value)} /></label>}
          </div>
        </section>
      )}

      {full && <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg">Articles</h3>
          <Button variant="outline" className="h-9" onClick={() => setPicker(true)} disabled={locked}>
            <Plus className="size-4" aria-hidden /> Ajouter
          </Button>
        </div>
        {locked && <p className="text-sm text-muted-foreground">Un article de cette commande n'existe plus : ses lignes ne sont pas modifiables.</p>}
        <ul className="divide-y divide-border rounded-md border border-border">
          {lines.map((l, i) => (
            <li key={`${l.variant_id}-${i}`} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{l.name}</p>
                <p className="tnum text-sm text-muted-foreground">{l.label}, {formatPrice(l.unit_price)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <QtyStepper value={l.quantity} onChange={(q) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, quantity: q } : x)))} />
                <button type="button" disabled={locked} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="flex size-10 items-center justify-center rounded-md text-muted-foreground hover:text-destructive disabled:opacity-40" aria-label={`Retirer ${l.name}`}>
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
        {order.status === 'confirmee' && changed && <p className="text-sm text-amber-800">Commande confirmée : le stock sera remis puis retiré avec les nouvelles quantités.</p>}
      </section>}

      {full && <section className="grid grid-cols-2 gap-3">
        <label className={label}><span className={hint}>Frais de livraison (DA)</span><input type="number" min={0} className={inputClass} value={f.delivery_fee} onChange={(e) => set('delivery_fee', Math.max(0, Number(e.target.value) || 0))} /></label>
        <label className={label}><span className={hint}>Remise (DA)</span><input type="number" min={0} className={inputClass} value={f.discount} onChange={(e) => set('discount', Math.max(0, Number(e.target.value) || 0))} /></label>
        <p className="tnum col-span-2 flex items-baseline justify-between border-t border-border pt-3 text-lg">
          <span>Total</span>
          <span className="font-display text-2xl">{formatPrice(Math.max(0, total))}</span>
        </p>
      </section>}

      <div className="flex gap-2">
        <Button className="h-11 flex-1" onClick={save} disabled={update.isPending}>{update.isPending ? 'Enregistrement…' : 'Enregistrer'}</Button>
        <Button variant="outline" className="h-11" onClick={onDone} disabled={update.isPending}>Annuler</Button>
      </div>

      <VariantPicker open={picker} onOpenChange={setPicker} includePacks onPick={(v, p) => addLine(v.id, p.name, v.label, v.price)} />
    </div>
  )
}
