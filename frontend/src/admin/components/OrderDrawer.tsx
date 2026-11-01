import { MessageCircle, Pencil, Phone, Printer } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { formatPhone, formatPrice, phoneHref } from '@/shop/format'
import { useSettings } from '@/shop/queries'
import { apiError, formatDateTime } from '../lib'
import { print } from '../printHelper'
import { useOrder, useOrderAction, useUpdateOrder, type TransitionPayload } from '../queries'
import type { Order, OrderAction } from '../types'
import { AwaitingBadge, ConfirmDialog, ErrorState, Loading, STATUS_LABEL, StatusBadge, inputClass } from './common'
import { useIsOwner } from '../auth'
import { GiftDialog, LoyaltyNote } from './Loyalty'
import { OrderEdit } from './OrderEdit'

const MODE = { domicile: 'À domicile', stop_desk: 'Point relais', boutique: 'Retrait en boutique' } as const
const PAYMENT = { cod: 'Paiement à la livraison', especes: 'Espèces', carte: 'Carte', ccp: 'CCP / BaridiMob' } as const
const COMPANIES = ['Yalidine', 'ZR Express', 'Noest', 'Ecotrack', 'Procolis', 'Autre']

const BUTTON: Record<OrderAction, { label: string; primary?: boolean; danger?: boolean }> = {
  confirm: { label: 'Confirmer', primary: true },
  no_answer: { label: 'Ne répond pas' },
  cancel: { label: 'Annuler', danger: true },
  ship: { label: 'Expédier', primary: true },
  deliver: { label: 'Livrée', primary: true },
  return: { label: 'Retour', danger: true },
  sell_in_store: { label: 'Vendue en boutique', primary: true },
  reopen: { label: 'Rouvrir la commande', primary: true },
}

const whatsapp = (phone: string) => `https://wa.me/213${phone.replace(/\D/g, '').replace(/^0/, '')}`

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

const stockLine = (order: Order, itemId: number) => order.stock_check?.lines.find((l) => l.item_id === itemId)

function Detail({ order, onEdit }: { order: Order; onEdit: () => void }) {
  const act = useOrderAction()
  const saveNote = useUpdateOrder()
  const { data: settings } = useSettings()
  const [dialog, setDialog] = useState<OrderAction | null>(null)
  const [reason, setReason] = useState('')
  const [company, setCompany] = useState(COMPANIES[0])
  const [tracking, setTracking] = useState('')
  const [restock, setRestock] = useState(false)
  const [note, setNote] = useState(order.admin_note ?? '')
  const owner = useIsOwner()
  const [gift, setGift] = useState(false)

  const c = order.customer
  const name = [c.first_name, c.last_name].filter(Boolean).join(' ')
  const place = [order.address, order.commune?.name, order.wilaya?.name].filter(Boolean).join(', ')

  const run = (action: OrderAction, extra: Omit<TransitionPayload, 'action'> = {}, done?: string) =>
    act.mutate(
      { id: order.id, action, ...extra },
      {
        onSuccess: () => {
          toast.success(done ?? 'Commande mise à jour.')
          setDialog(null)
          setReason('')
          setTracking('')
          setRestock(false)
        },
        onError: (e) => toast.error(apiError(e)),
      },
    )

  const click = (a: OrderAction) => (a === 'no_answer' ? run('no_answer', {}, 'Tentative d’appel enregistrée.') : setDialog(a))
  const pending = act.isPending

  return (
    <>
      <div className="flex-1 space-y-7 overflow-y-auto p-5">
        <section aria-label="Client">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="font-display text-lg">{name || 'Client de passage'}</h3>
            {order.channel === 'pos' && <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">Caisse</span>}
          </div>
          <dl>
            <Row label="Téléphone">
              {c.phone ? (
                <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <a href={phoneHref(c.phone)} className="tnum inline-flex items-center gap-1.5 underline underline-offset-4"><Phone className="size-3.5" aria-hidden />{formatPhone(c.phone)}</a>
                  <a href={whatsapp(c.phone)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 underline underline-offset-4"><MessageCircle className="size-3.5" aria-hidden />WhatsApp</a>
                </span>
              ) : '—'}
              {c.phone2 && <a href={phoneHref(c.phone2)} className="tnum mt-1 block underline underline-offset-4">{formatPhone(c.phone2)}</a>}
            </Row>
            {order.delivery_mode && <Row label="Livraison">{MODE[order.delivery_mode]}</Row>}
            {place && <Row label="Adresse">{place}</Row>}
            {order.customer_note && <Row label="Note du client"><span className="rounded bg-amber-50 px-2 py-1">{order.customer_note}</span></Row>}
            {order.call_attempts > 0 && <Row label="Appels">{order.call_attempts} sans réponse</Row>}
            {order.tracking_number && <Row label="Suivi">{order.delivery_company} {order.tracking_number}</Row>}
            {order.cancel_reason && <Row label="Motif d'annulation">{order.cancel_reason}</Row>}
          </dl>
          {c.loyalty && c.id && (
            <div className="mt-3 rounded-md border border-border bg-secondary/60 p-3">
              <LoyaltyNote loyalty={c.loyalty} adds={c.loyalty.adds} />
              {owner && c.loyalty.pending.length > 0 && <Button variant="outline" className="mt-2 h-9" onClick={() => setGift(true)}>Offrir le cadeau</Button>}
            </div>
          )}
          {gift && c.loyalty && c.id && <GiftDialog customerId={c.id} name={name || 'ce client'} loyalty={c.loyalty} onClose={() => setGift(false)} />}
        </section>

        <section aria-label="Articles">
          <h3 className="mb-2 font-display text-lg">Articles</h3>
          <ul className="divide-y divide-border rounded-md border border-border">
            {order.items?.map((i) => (
              <li key={i.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{i.product_name}</p>
                  <p className="tnum text-muted-foreground">{i.variant_label}, {i.quantity} × {formatPrice(i.unit_price)}</p>
                  {stockLine(order, i.id) && (
                    <p className={`mt-0.5 text-xs ${stockLine(order, i.id)!.ok ? 'text-muted-foreground' : 'font-medium text-destructive'}`}>
                      {`${stockLine(order, i.id)!.ok ? 'En stock' : 'Stock insuffisant'} : ${stockLine(order, i.id)!.left}`}
                    </p>
                  )}
                </div>
                <p className="tnum shrink-0 font-medium">{formatPrice(i.line_total)}</p>
              </li>
            ))}
          </ul>
          <dl className="tnum mt-3 space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Sous-total</dt><dd>{formatPrice(order.subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Livraison</dt><dd>{formatPrice(order.delivery_fee)}</dd></div>
            {order.discount > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Remise</dt><dd>−{formatPrice(order.discount)}</dd></div>}
            <div className="flex items-baseline justify-between border-t border-border pt-2 text-base font-medium"><dt>Total</dt><dd className="font-display text-2xl">{formatPrice(order.total)}</dd></div>
            <div className="flex justify-between text-muted-foreground"><dt>Paiement</dt><dd>{PAYMENT[order.payment_method]}</dd></div>
            {order.amount_received !== null && <div className="flex justify-between text-muted-foreground"><dt>Reçu / rendu</dt><dd>{formatPrice(order.amount_received)} / {formatPrice(order.change_due ?? 0)}</dd></div>}
          </dl>
          {order.stock_deducted && <p className="mt-2 text-xs text-muted-foreground">Le stock de cette commande a été retiré.</p>}
          {order.stock_check && (
            <div className={`mt-3 rounded-md border p-3 text-sm ${order.stock_check.possible ? 'border-border bg-secondary/60' : 'border-destructive/40 bg-destructive/5'}`} role="status">
              {order.stock_check.possible ? (
                <p>Le stock couvre cette commande : vous pouvez la confirmer.</p>
              ) : (
                <>
                  <p className="font-medium">Stock insuffisant : la commande ne peut pas être confirmée pour le moment.</p>
                  <ul className="tnum mt-1 space-y-0.5">
                    {order.stock_check.shortages.map((s) => (
                      <li key={s.name}>{`${s.name} : ${s.requested} ${s.unit} demandés, ${s.available} en stock.`}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-muted-foreground">Si un arrivage est prévu, mettez-la de côté : elle reste en attente et vous la confirmerez quand le stock sera arrivé.</p>
                </>
              )}
              {(!order.stock_check.possible || order.awaiting_stock) && (
                <Button
                  variant={order.awaiting_stock ? 'default' : 'outline'}
                  className="mt-2 h-9"
                  disabled={saveNote.isPending}
                  onClick={() => saveNote.mutate({ id: order.id, awaiting_stock: !order.awaiting_stock }, { onSuccess: () => toast.success(order.awaiting_stock ? 'Commande reprise.' : 'Commande mise de côté.'), onError: (e) => toast.error(apiError(e)) })}
                >
                  {order.awaiting_stock ? "Reprendre (l'arrivage est là)" : "Mettre en attente d'arrivage"}
                </Button>
              )}
            </div>
          )}
        </section>

        <section aria-label="Note interne">
          <h3 className="mb-2 font-display text-lg">Note interne</h3>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Visible uniquement par l'équipe" className="text-sm" />
          {note !== (order.admin_note ?? '') && (
            <Button className="mt-2 h-9" disabled={saveNote.isPending} onClick={() => saveNote.mutate({ id: order.id, admin_note: note || null }, { onSuccess: () => toast.success('Note enregistrée.'), onError: (e) => toast.error(apiError(e)) })}>
              Enregistrer la note
            </Button>
          )}
        </section>

        <section aria-label="Dates">
          <h3 className="mb-2 font-display text-lg">Dates</h3>
          <dl>
            {(
              [
                ['Commande passée', order.created_at],
                ['Confirmée', order.confirmed_at],
                ['Expédiée', order.shipped_at],
                ['Livrée', order.delivered_at],
                ['Vendue en boutique', order.status === 'vendue_boutique' ? order.completed_at : null],
                ['Annulée', order.cancelled_at],
                ['Retournée', order.returned_at],
              ] as const
            )
              .filter(([, at]) => at)
              .map(([label, at]) => (
                <Row key={label} label={label}><span className="tnum">{formatDateTime(at!)}</span></Row>
              ))}
          </dl>
        </section>

        <section aria-label="Historique">
          <h3 className="mb-3 font-display text-lg">Historique</h3>
          <ol className="space-y-3 border-l-2 border-border ps-4">
            {order.history?.map((h, i) => (
              <li key={i} className="text-sm">
                <p className="font-medium">{h.from && h.from === h.to ? h.note : <>{h.from ? `${STATUS_LABEL[h.from]} → ` : ''}{STATUS_LABEL[h.to]}</>}</p>
                {h.note && !(h.from && h.from === h.to) && <p className="text-muted-foreground">{h.note}</p>}
                <p className="text-xs text-muted-foreground">{formatDateTime(h.at)}{h.user ? `, ${h.user}` : ''}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <div className="space-y-3 border-t border-border bg-card p-4">
        {order.allowed_actions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {order.allowed_actions.map((a) => (
              <Button key={a} variant={BUTTON[a].primary ? 'default' : BUTTON[a].danger ? 'destructive' : 'outline'} className="h-11 flex-1 basis-36" disabled={pending || (a === 'confirm' && order.stock_check?.possible === false)} onClick={() => click(a)}>
                {BUTTON[a].label}
              </Button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Button variant="outline" className="h-10 flex-1" onClick={onEdit}><Pencil className="size-4" aria-hidden />Modifier</Button>
          <Button variant="outline" className="h-10 flex-1" onClick={() => print(order, settings?.shop_name ?? 'Boutique')}><Printer className="size-4" aria-hidden />Imprimer</Button>
        </div>
      </div>

      <ConfirmDialog open={dialog === 'confirm'} onOpenChange={(o) => !o && setDialog(null)} title="Confirmer la commande ?" description="Le client a confirmé par téléphone. Les quantités seront retirées du stock." confirmLabel="Confirmer" loading={pending} onConfirm={() => run('confirm', {}, 'Commande confirmée.')} />
      <ConfirmDialog open={dialog === 'deliver'} onOpenChange={(o) => !o && setDialog(null)} title="Marquer comme livrée ?" description="Le client a reçu et payé sa commande." confirmLabel="Livrée" loading={pending} onConfirm={() => run('deliver', {}, 'Commande livrée.')} />
      <ConfirmDialog open={dialog === 'reopen'} onOpenChange={(o) => !o && setDialog(null)} title="Rouvrir la commande ?" description="Le client a changé d'avis. La commande repasse « En attente » : vous pourrez la modifier, puis la confirmer à nouveau (le stock sera retiré à ce moment-là)." confirmLabel="Rouvrir" loading={pending} onConfirm={() => run('reopen', {}, 'Commande rouverte.')} />
      <ConfirmDialog open={dialog === 'sell_in_store'} onOpenChange={(o) => !o && setDialog(null)} title="Vendue en boutique ?" description="Le client est venu récupérer sa commande et l'a payée." confirmLabel="Valider" loading={pending} onConfirm={() => run('sell_in_store', {}, 'Vente enregistrée.')} />

      <ConfirmDialog open={dialog === 'cancel'} onOpenChange={(o) => !o && setDialog(null)} title="Annuler la commande ?" description={order.stock_deducted ? 'Le stock retiré à la confirmation sera remis.' : 'Aucun stock n’a été retiré.'} confirmLabel="Annuler la commande" destructive loading={pending} onConfirm={() => run('cancel', { reason: reason || undefined }, 'Commande annulée.')}>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Motif (facultatif)</span>
          <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Client injoignable, a changé d'avis…" />
        </label>
      </ConfirmDialog>

      <ConfirmDialog open={dialog === 'ship'} onOpenChange={(o) => !o && setDialog(null)} title="Expédier la commande" description="Indiquez la société de livraison pour suivre le colis." confirmLabel="Expédier" loading={pending} onConfirm={() => run('ship', { delivery_company: company, tracking_number: tracking || undefined }, 'Commande expédiée.')}>
        <div className="space-y-3 text-sm">
          <label className="block space-y-1">
            <span className="text-muted-foreground">Société de livraison</span>
            <select className={inputClass} value={company} onChange={(e) => setCompany(e.target.value)}>{COMPANIES.map((x) => <option key={x}>{x}</option>)}</select>
          </label>
          <label className="block space-y-1">
            <span className="text-muted-foreground">Numéro de suivi (facultatif)</span>
            <input className={inputClass} value={tracking} onChange={(e) => setTracking(e.target.value)} />
          </label>
        </div>
      </ConfirmDialog>

      <ConfirmDialog open={dialog === 'return'} onOpenChange={(o) => !o && setDialog(null)} title="Le colis est revenu" description="La livraison a échoué." confirmLabel="Enregistrer le retour" destructive loading={pending} onConfirm={() => run('return', { restock }, 'Retour enregistré.')}>
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 text-sm">
          <Checkbox checked={restock} onCheckedChange={(v) => setRestock(v === true)} className="mt-0.5" />
          <span>
            <span className="block font-medium">Remettre en stock</span>
            <span className="text-muted-foreground">Cochez si les flacons sont intacts. Un décant déjà versé ne se revend en général pas : laissez décoché pour l'enregistrer comme perte.</span>
          </span>
        </label>
      </ConfirmDialog>
    </>
  )
}

export function OrderDrawer({ id, onClose }: { id: number | null; onClose: () => void }) {
  const q = useOrder(id)
  const [editing, setEditing] = useState(false)
  const order = q.data

  return (
    <Sheet open={id !== null} onOpenChange={(o) => { if (!o) { setEditing(false); onClose() } }}>
      <SheetContent side="right" className="gap-0 p-0 data-[side=right]:w-full sm:data-[side=right]:max-w-xl">
        <SheetHeader className="border-b border-border p-5 pe-12">
          <SheetTitle className="flex flex-wrap items-center gap-3 font-display text-xl">
            <span className="tnum">{order?.reference ?? 'Commande'}</span>
            {order && <><StatusBadge status={order.status} /><AwaitingBadge order={order} /></>}
          </SheetTitle>
          <SheetDescription>{order ? `Passée le ${formatDateTime(order.created_at)}${order.created_by ? `, par ${order.created_by}` : ''}` : 'Détail de la commande'}</SheetDescription>
        </SheetHeader>

        {q.isPending ? (
          <Loading />
        ) : q.isError || !order ? (
          <div className="p-5"><ErrorState onRetry={() => q.refetch()} message="Commande introuvable." /></div>
        ) : editing ? (
          <div className="flex-1 overflow-y-auto p-5"><OrderEdit order={order} onDone={() => setEditing(false)} /></div>
        ) : (
          <Detail key={order.id + order.status + order.call_attempts} order={order} onEdit={() => setEditing(true)} />
        )}
      </SheetContent>
    </Sheet>
  )
}
