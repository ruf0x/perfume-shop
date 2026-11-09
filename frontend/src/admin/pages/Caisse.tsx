import { Printer, Search, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { formatPrice } from '@/shop/format'
import { ProductVisual } from '@/shop/components/ProductVisual'
import { QtyStepper } from '@/shop/components/QtyStepper'
import { useSettings } from '@/shop/queries'
import { EmptyState, Loading, PageHeader, Pagination, inputClass } from '../components/common'
import { apiError } from '../lib'
import { printTicket } from '../printHelper'
import { useAdminProducts, useLoyaltyLookup, usePosSale, useProductTypes, useStockSummary, useTaxa } from '../queries'
import { useIsOwner } from '../auth'
import { ClientPicker, emptyClient, type ClientFields } from '../components/ClientPicker'
import { GiftDialog, LoyaltyNote } from '../components/Loyalty'
import type { AdminProduct, AdminVariant, Order, StockMode } from '../types'
import { useDebounced } from '../useDebounced'

interface Line {
  /** variant + bottle: the same size poured from two bottles is two lines. */
  key: string
  variantId: number
  /** For a decant line: the opened bottle it comes from (null = the newest one). */
  openBottleId: number | null
  /** For a pack with decants: component variant id => the opened bottle it is poured from. */
  componentBottles: Record<number, number>
  bottleLabel: string | null
  productId: number
  name: string
  label: string
  /** The catalogue price. */
  listPrice: number
  /** What the cashier typed: the price actually charged per unit (empty = the catalogue price). */
  priceText: string
  qty: number
  mode: StockMode
  ml: number | null
  /** What the screen knew when the item was added; the server has the last word. */
  poolStock: number
  unitStock: number
}

const PAYMENTS = [
  ['especes', 'Espèces'],
  ['carte', 'Carte'],
  ['ccp', 'CCP / BaridiMob'],
] as const

type Payment = (typeof PAYMENTS)[number][0]

/** The unit price charged for a line: the catalogue price unless the cashier changed it. */
const priceOf = (l: Line) => (l.priceText.trim() === '' || Number.isNaN(Number(l.priceText)) ? l.listPrice : Math.max(0, Math.round(Number(l.priceText))))

/** How many of this line the shop can still sell, counting the other lines drawn from the same ml stock. */
function maxFor(line: Line, lines: Line[]) {
  if (line.mode === 'unit') return line.unitStock
  if (line.mode === 'pack') return 99
  const usedByOthers = lines.filter((l) => l.key !== line.key && l.productId === line.productId && l.mode === 'pool').reduce((s, l) => s + l.qty * (l.ml ?? 0), 0)
  return Math.max(0, Math.floor((line.poolStock - usedByOthers) / (line.ml ?? 1)))
}

function variantState(p: AdminProduct, v: AdminVariant): { ok: boolean; hint: string } {
  if (v.stock_mode === 'unit') return { ok: v.stock_qty > 0, hint: v.stock_qty > 0 ? `${v.stock_qty} en stock` : 'épuisé' }
  if (v.stock_mode === 'pack') return { ok: p.available, hint: p.available ? 'disponible' : 'épuisé' }
  const ok = (v.ml ?? 0) > 0 && p.stock_ml >= (v.ml ?? 0)
  return { ok, hint: ok ? `${p.stock_ml} ml dispo` : 'épuisé' }
}

/** The opened bottle a decant is poured from: the newest one by default, or one of the bottles that have ml left. */
function BottleChoice({ productId, label, value, onChange, ml }: { productId: number; label: string; value: number | null; onChange: (id: number | null) => void; ml: number }) {
  const summary = useStockSummary(productId)
  const bottles = (summary.data?.open_bottles ?? []).filter((b) => b.remaining > 0)
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select className={inputClass} value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">Automatique (la plus récente)</option>
        {bottles.map((b) => (
          <option key={b.id} value={b.id} disabled={b.remaining < ml}>{b.label} · {b.remaining} ml restants{b.remaining < ml ? ' (pas assez)' : ''}</option>
        ))}
      </select>
    </label>
  )
}

/** A decant size, or a pack with decants, asks which opened bottle the ml comes from. */
function SizeDialog({ product, onClose, onPick }: { product: AdminProduct; onClose: () => void; onPick: (v: AdminVariant, bottle: { id: number; label: string } | null, components?: Record<number, number>) => void }) {
  const [decant, setDecant] = useState<AdminVariant | null>(null)
  const [pack, setPack] = useState<AdminVariant | null>(null)
  const [choices, setChoices] = useState<Record<number, number | null>>({})
  const summary = useStockSummary(product.id)
  const bottles = (summary.data?.open_bottles ?? []).filter((b) => b.remaining > 0)

  if (pack) {
    const decants = (pack.components ?? []).filter((c) => c.stock_mode === 'pool')
    const submit = () => onPick(pack, null, Object.fromEntries(Object.entries(choices).filter(([, id]) => id !== null)) as Record<number, number>)
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">{product.name} · {pack.label}</DialogTitle>
            <DialogDescription>D'où sort le décant de chaque produit du pack ?</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {decants.map((c) => (
              <PackComponent key={c.variant_id} component={c} value={choices[c.variant_id] ?? null} onChange={(id) => setChoices({ ...choices, [c.variant_id]: id })} />
            ))}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" className="h-10" onClick={() => setPack(null)}>Retour</Button>
            <Button className="h-10" onClick={submit}>Ajouter au panier</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  if (decant) {
    const ml = decant.ml ?? 0
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">{product.name} · {decant.label}</DialogTitle>
            <DialogDescription>D'où prend-on ces {ml} ml ?</DialogDescription>
          </DialogHeader>
          <ul className="grid gap-2">
            <li>
              <button type="button" onClick={() => onPick(decant, null)} className="flex w-full items-center justify-between gap-4 rounded-md border border-input bg-card px-4 py-3 text-start hover:border-primary">
                <span><span className="block font-medium">Automatique</span><span className="text-sm text-muted-foreground">la bouteille la plus récente qui en a encore</span></span>
              </button>
            </li>
            {bottles.map((b) => {
              const enough = b.remaining >= ml
              return (
                <li key={b.id}>
                  <button type="button" disabled={!enough} onClick={() => onPick(decant, { id: b.id, label: `${b.label} (${b.remaining} ml)` })} className="flex w-full items-center justify-between gap-4 rounded-md border border-input bg-card px-4 py-3 text-start hover:border-primary disabled:opacity-40">
                    <span><span className="block font-medium">{b.label}</span><span className="tnum text-sm text-muted-foreground">{b.remaining} ml restants sur {b.capacity}{enough ? '' : ' · pas assez pour cette taille'}</span></span>
                  </button>
                </li>
              )
            })}
          </ul>
          {bottles.length === 0 && <p className="text-sm text-muted-foreground">Aucune bouteille ouverte : le stock vient du vrac.</p>}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" className="h-10" onClick={() => setDecant(null)}>Retour</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{product.name}</DialogTitle>
          <DialogDescription>Choisissez la taille ou l'option.</DialogDescription>
        </DialogHeader>
        <ul className="grid gap-2">
          {product.variants?.filter((v) => v.is_active).map((v) => {
            const s = variantState(product, v)
            const hasDecant = v.stock_mode === 'pack' && (v.components ?? []).some((c) => c.stock_mode === 'pool')
            const askBottle = (v.stock_mode === 'pool' && bottles.length > 0) || hasDecant
            return (
              <li key={v.id}>
                <button type="button" disabled={!s.ok} onClick={() => (hasDecant ? setPack(v) : v.stock_mode === 'pool' && askBottle ? setDecant(v) : onPick(v, null))} className="flex w-full items-center justify-between gap-4 rounded-md border border-input bg-card px-4 py-3 text-start hover:border-primary disabled:opacity-40">
                  <span><span className="block font-medium">{v.label}</span><span className="text-sm text-muted-foreground">{s.hint}</span></span>
                  <span className="tnum font-display text-xl">{formatPrice(v.price)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </DialogContent>
    </Dialog>
  )
}

function PackComponent({ component, value, onChange }: { component: NonNullable<AdminVariant['components']>[number]; value: number | null; onChange: (id: number | null) => void }) {
  return <BottleChoice productId={component.product_id} label={`${component.product} · ${component.ml ?? '?'} ml × ${component.quantity}`} value={value} onChange={onChange} ml={(component.ml ?? 0) * component.quantity} />
}

function ReceiptDialog({ order, onNew }: { order: Order; onNew: () => void }) {
  const { data: shop } = useSettings()
  const ticket = () => printTicket(order, { name: shop?.shop_name ?? 'Boutique', phone: shop?.shop_phone, address: shop?.shop_address })

  return (
    <Dialog open onOpenChange={(o) => !o && onNew()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Vente enregistrée</DialogTitle>
          <DialogDescription className="tnum">Ticket {order.reference}, stock mis à jour.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 rounded-md bg-secondary/60 p-4 text-sm">
          <ul className="space-y-1">
            {order.items?.map((i) => (
              <li key={i.id} className="tnum flex justify-between gap-3">
                <span>{i.quantity} × {i.product_name} {i.variant_label}{i.list_price && i.list_price > i.unit_price ? <span className="block text-xs text-muted-foreground">{formatPrice(i.unit_price)} au lieu de {formatPrice(i.list_price)}</span> : null}</span>
                <span>{formatPrice(i.line_total)}</span>
              </li>
            ))}
          </ul>
          <p className="tnum flex items-baseline justify-between border-t border-border pt-2 text-base font-medium"><span>Total</span><span className="font-display text-2xl">{formatPrice(order.total)}</span></p>
          {order.change_due !== null && order.change_due > 0 && (
            <p className="tnum flex items-baseline justify-between rounded-md bg-accent px-3 py-2 text-accent-foreground"><span className="font-medium">À rendre au client</span><span className="font-display text-3xl">{formatPrice(order.change_due)}</span></p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="h-11" onClick={ticket}><Printer className="size-4" aria-hidden />Imprimer le ticket</Button>
          <Button autoFocus className="h-11" onClick={onNew}>Nouvelle vente</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function Caisse() {
  const sale = usePosSale()
  const types = useTaxa('types')
  const productTypes = useProductTypes()
  const search = useRef<HTMLInputElement>(null)
  const [term, setTerm] = useState('')
  const q = useDebounced(term, 250)
  const [typeId, setTypeId] = useState<number | undefined>()
  const [page, setPage] = useState(1)
  useEffect(() => setPage(1), [q, typeId])
  const products = useAdminProducts({ q: q || undefined, type_id: typeId, active: true, page }, 24)

  const [picked, setPicked] = useState<AdminProduct | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [discountMode, setDiscountMode] = useState<'da' | 'pct'>('da')
  const [discountValue, setDiscountValue] = useState('')
  const [payment, setPayment] = useState<Payment>('especes')
  const [received, setReceived] = useState('')
  const [client, setClient] = useState<ClientFields>(emptyClient)
  const [done, setDone] = useState<Order | null>(null)
  const lookup = useLoyaltyLookup(useDebounced(client.phone, 500))
  const owner = useIsOwner()
  const [gift, setGift] = useState(false)

  const subtotal = lines.reduce((s, l) => s + priceOf(l) * l.qty, 0)
  // How much the cashier gave away by changing prices (shown, so it is never a surprise).
  const priceCut = lines.reduce((s, l) => s + (l.listPrice - priceOf(l)) * l.qty, 0)
  const rawDiscount = Number(discountValue) || 0
  const discount = Math.min(subtotal, Math.max(0, discountMode === 'pct' ? Math.round((subtotal * Math.min(rawDiscount, 100)) / 100) : Math.round(rawDiscount)))
  const total = subtotal - discount
  // Empty means "exact amount": the cashier only types when the client pays with something else.
  const cash = received === '' ? total : Number(received) || 0
  const change = cash - total
  const count = lines.reduce((n, l) => n + l.qty, 0)
  // A client is optional, but once started it needs the first name, last name and phone.
  const clientTyped = client.first_name.trim() !== '' || client.last_name.trim() !== '' || client.phone.trim() !== ''
  const clientOk = !clientTyped || (client.first_name.trim() !== '' && client.last_name.trim() !== '' && client.phone.trim() !== '')
  const canSell = lines.length > 0 && clientOk && (payment !== 'especes' || cash >= total) && !sale.isPending

  const add = (p: AdminProduct, v: AdminVariant, bottle: { id: number; label: string } | null = null, componentBottles: Record<number, number> = {}) => {
    const chosen = Object.keys(componentBottles).length
    const key = `${v.id}:${bottle?.id ?? 'auto'}:${Object.entries(componentBottles).sort().join(',')}`
    const base: Line = { key, variantId: v.id, openBottleId: bottle?.id ?? null, bottleLabel: bottle?.label ?? (chosen ? `${chosen} décant(s) choisi(s)` : null), componentBottles, productId: p.id, name: p.name, label: v.label, listPrice: v.price, priceText: String(v.price), qty: 1, mode: v.stock_mode, ml: v.ml, poolStock: p.stock_ml, unitStock: v.stock_qty }
    const existing = lines.find((l) => l.key === key)
    const next = existing ? lines.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l)) : [...lines, base]
    const line = next.find((l) => l.key === key)!
    if (line.qty > maxFor(line, next)) return toast.error(`Stock insuffisant pour ${p.name} (${v.label}).`)
    setLines(next)
    setPicked(null)
  }

  const reset = () => {
    setLines([])
    setDiscountValue('')
    setReceived('')
    setClient(emptyClient)
    setPayment('especes')
    setDone(null)
    setTimeout(() => search.current?.focus(), 50)
  }

  const submit = () => {
    if (!canSell) return
    sale.mutate(
      {
        lines: lines.map((l) => ({ variant_id: l.variantId, quantity: l.qty, open_bottle_id: l.openBottleId ?? undefined, component_bottles: Object.keys(l.componentBottles).length ? l.componentBottles : undefined, unit_price: priceOf(l) !== l.listPrice ? priceOf(l) : undefined })),
        discount: discount || undefined,
        payment_method: payment,
        amount_received: payment === 'especes' ? cash : undefined,
        first_name: client.first_name.trim() || undefined,
        last_name: client.last_name.trim() || undefined,
        phone: client.phone.trim() || undefined,
        wilaya_id: client.wilaya_id || undefined,
        commune_id: client.commune_id || undefined,
      },
      { onSuccess: setDone, onError: (e) => toast.error(apiError(e)) },
    )
  }

  // Keyboard: "/" jumps to the search, Ctrl+Enter validates the sale.
  const submitRef = useRef(submit)
  submitRef.current = submit
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)
      if (e.key === '/' && !typing) {
        e.preventDefault()
        search.current?.focus()
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const quick = useMemo(() => [...new Set([total, 500, 1000, 2000, 5000, 10000].filter((n) => n >= total && n > 0))].sort((a, b) => a - b).slice(0, 4), [total])
  const items = products.data?.data ?? []

  return (
    <>
      <PageHeader title="Caisse" description="Vente au comptoir : le stock est mis à jour tout de suite." />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section aria-label="Produits" className="min-w-0">
          <div className="mb-4 grid gap-3 xl:grid-cols-[1fr_12rem]">
            <label className="relative block">
              <span className="sr-only">Rechercher un produit</span>
              <Search className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input ref={search} type="search" autoFocus value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Rechercher un produit ou un pack   (touche /)" className={`${inputClass} h-11 ps-9`} />
            </label>
            <select className={`${inputClass} h-11`} aria-label="Famille ou catégorie" value={typeId ?? ''} onChange={(e) => setTypeId(e.target.value ? Number(e.target.value) : undefined)}>
              <option value="">Tout le catalogue</option>
              {productTypes.data?.map((pt) => (
                <optgroup key={pt.id} label={pt.name}>
                  {types.data?.filter((c) => c.product_type_id === pt.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
              ))}
            </select>
          </div>

          {products.isPending ? <Loading /> : items.length === 0 ? <EmptyState title="Aucun produit" hint="Essayez un autre mot." /> : (
            <>
              <ul className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4', products.isPlaceholderData && 'opacity-60')}>
                {items.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => setPicked(p)} disabled={!p.available && p.kind !== 'pack' && p.stock_ml === 0 && !p.variants?.some((v) => v.stock_qty > 0)} className="group block w-full rounded-lg text-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50">
                      <div className="relative aspect-square overflow-hidden rounded-lg bg-secondary">
                        <ProductVisual image={p.image} name={p.name} type={p.type?.slug} rayon={p.product_type?.slug} level={p.available ? 0.7 : 0.1} />
                        {!p.available && <span className="absolute top-2 start-2 rounded bg-oud px-2 py-0.5 text-xs text-oud-foreground">Épuisé</span>}
                      </div>
                      <p className="mt-2 truncate font-display text-base leading-tight group-hover:underline">{p.name}</p>
                      <p className="tnum text-sm text-muted-foreground">{p.kind === 'pack' ? 'Pack ' : 'dès '}{formatPrice(Math.min(...(p.variants?.filter((v) => v.is_active).map((v) => v.price) ?? [0])))}</p>
                    </button>
                  </li>
                ))}
              </ul>
              <Pagination meta={products.data?.meta} onPage={setPage} />
            </>
          )}
        </section>

        <aside id="panier-caisse" aria-label="Vente en cours" className="h-fit space-y-5 rounded-2xl border border-border bg-card p-5 lg:sticky lg:top-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl">Vente en cours</h2>
            {lines.length > 0 && <button type="button" onClick={() => setLines([])} className="flex items-center gap-1.5 rounded px-2 py-1 text-sm text-muted-foreground hover:text-destructive"><Trash2 className="size-4" aria-hidden />Vider</button>}
          </div>

          {lines.length === 0 ? (
            <p className="rounded-md bg-secondary/60 p-4 text-center text-sm text-muted-foreground">Touchez un produit pour commencer.</p>
          ) : (
            <ul className="divide-y divide-border">
              {lines.map((l) => (
                <li key={l.key} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{l.name}</p>
                    <p className="text-sm text-muted-foreground">{l.label}{l.bottleLabel ? ` · depuis ${l.bottleLabel}` : ''}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <label className="flex items-center gap-1">
                        <span className="sr-only">Prix unitaire de {l.name}, en dinars</span>
                        <input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          value={l.priceText}
                          onChange={(e) => setLines(lines.map((x) => (x.key === l.key ? { ...x, priceText: e.target.value } : x)))}
                          onBlur={() => priceOf(l) === l.listPrice && l.priceText !== String(l.listPrice) && setLines(lines.map((x) => (x.key === l.key ? { ...x, priceText: String(l.listPrice) } : x)))}
                          className={cn('tnum h-8 w-24 rounded-md border bg-card px-2 text-sm', priceOf(l) !== l.listPrice ? 'border-primary font-medium text-primary' : 'border-input')}
                        />
                        <span className="text-sm text-muted-foreground">DA</span>
                      </label>
                      {priceOf(l) !== l.listPrice && (
                        <button type="button" onClick={() => setLines(lines.map((x) => (x.key === l.key ? { ...x, priceText: String(l.listPrice) } : x)))} className="tnum text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground" title="Remettre le prix normal">
                          <s>{formatPrice(l.listPrice)}</s>
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <QtyStepper value={l.qty} max={Math.max(1, maxFor(l, lines))} onChange={(n) => setLines(n < 1 ? lines.filter((x) => x.key !== l.key) : lines.map((x) => (x.key === l.key ? { ...x, qty: n } : x)))} />
                    <button type="button" onClick={() => setLines(lines.filter((x) => x.key !== l.key))} className="flex size-10 items-center justify-center rounded text-muted-foreground hover:text-destructive" aria-label={`Retirer ${l.name}`}><Trash2 className="size-4" /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <fieldset disabled={lines.length === 0} className="space-y-4 disabled:opacity-50">
            <div>
              <label htmlFor="discount" className="mb-1 block text-sm text-muted-foreground">Remise</label>
              <div className="flex gap-2">
                <input id="discount" type="number" min={0} inputMode="numeric" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} className={inputClass} placeholder="0" />
                <div role="radiogroup" aria-label="Unité de la remise" className="flex shrink-0 overflow-hidden rounded-md border border-input">
                  {([['da', 'DA'], ['pct', '%']] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={discountMode === k} onClick={() => setDiscountMode(k)} className={cn('px-3 text-sm', discountMode === k ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-secondary')}>{l}</button>)}
                </div>
              </div>
            </div>

            <div>
              <p className="mb-1 text-sm text-muted-foreground">Paiement</p>
              <div role="radiogroup" aria-label="Mode de paiement" className="grid grid-cols-3 gap-2">
                {PAYMENTS.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={payment === k} onClick={() => setPayment(k)} className={cn('rounded-md border px-2 py-2.5 text-sm', payment === k ? 'border-primary bg-accent font-medium' : 'border-input hover:bg-secondary')}>{l}</button>)}
              </div>
            </div>

            {payment === 'especes' && (
              <div>
                <label htmlFor="received" className="mb-1 block text-sm text-muted-foreground">Montant reçu (DA)</label>
                <input id="received" type="number" min={0} inputMode="numeric" value={received === '' ? String(total) : received} onChange={(e) => setReceived(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} className={inputClass} />
                <div className="mt-2 flex flex-wrap gap-2">
                  {quick.map((n) => <button key={n} type="button" onClick={() => setReceived(String(n))} className="tnum rounded-md border border-input px-2.5 py-1.5 text-sm hover:bg-secondary">{n === total ? 'Exact' : formatPrice(n)}</button>)}
                </div>
              </div>
            )}

            <details className="rounded-md border border-border p-3 text-sm">
              <summary className="cursor-pointer text-muted-foreground">Ajouter le client (facultatif)</summary>
              <div className="mt-3"><ClientPicker value={client} onChange={setClient} /></div>
              {lookup.data?.customer && lookup.data.loyalty && (
                <div className="mt-3 rounded-md bg-secondary/60 p-3">
                  <p className="mb-1 font-medium">{`${lookup.data.customer.first_name} ${lookup.data.customer.last_name}`}</p>
                  <LoyaltyNote loyalty={lookup.data.loyalty} customerId={lookup.data.customer.id} />
                  {owner && lookup.data.loyalty.pending.length > 0 && <Button variant="outline" className="mt-2 h-9" onClick={() => setGift(true)}>Offrir le cadeau</Button>}
                </div>
              )}
              {gift && lookup.data?.customer && lookup.data.loyalty && <GiftDialog customerId={lookup.data.customer.id} name={`${lookup.data.customer.first_name} ${lookup.data.customer.last_name}`} loyalty={lookup.data.loyalty} onClose={() => setGift(false)} />}
            </details>
          </fieldset>

          <dl className="tnum space-y-1.5 border-t border-border pt-4 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Sous-total ({count})</dt><dd>{formatPrice(subtotal)}</dd></div>
            {priceCut !== 0 && <div className="flex justify-between"><dt className="text-muted-foreground">{priceCut > 0 ? 'Prix baissés (déjà dans le total)' : 'Prix augmentés (déjà dans le total)'}</dt><dd>{priceCut > 0 ? '−' : '+'}{formatPrice(Math.abs(priceCut))}</dd></div>}
            {discount > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Remise</dt><dd>−{formatPrice(discount)}</dd></div>}
            <div className="flex items-baseline justify-between text-base font-medium"><dt>Total</dt><dd className="font-display text-3xl">{formatPrice(total)}</dd></div>
            {payment === 'especes' && lines.length > 0 && cash > 0 && (
              <div className={cn('flex items-baseline justify-between rounded-md px-3 py-2', change >= 0 ? 'bg-accent text-accent-foreground' : 'bg-destructive/10 text-destructive')}>
                <dt className="font-medium">{change >= 0 ? 'À rendre' : 'Il manque'}</dt><dd className="font-display text-2xl">{formatPrice(Math.abs(change))}</dd>
              </div>
            )}
          </dl>

          <Button className="h-12 w-full text-base" disabled={!canSell} onClick={submit}>{sale.isPending ? 'Enregistrement…' : `Valider la vente, ${formatPrice(total)}`}</Button>
          <p className="text-center text-xs text-muted-foreground">Raccourcis : <kbd className="rounded border border-border px-1">/</kbd> chercher, <kbd className="rounded border border-border px-1">Ctrl</kbd>+<kbd className="rounded border border-border px-1">Entrée</kbd> valider</p>
        </aside>
      </div>

      {/* phones: the total stays in reach while browsing products */}
      {lines.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
          <p className="tnum"><span className="text-sm text-muted-foreground">{count} article{count > 1 ? 's' : ''}</span><span className="block font-display text-xl">{formatPrice(total)}</span></p>
          <Button className="h-11" onClick={() => document.getElementById('panier-caisse')?.scrollIntoView({ behavior: 'smooth' })}>Encaisser</Button>
        </div>
      )}

      {picked && <SizeDialog product={picked} onClose={() => setPicked(null)} onPick={(v, bottle, components) => add(picked, v, bottle, components)} />}
      {done && <ReceiptDialog order={done} onNew={reset} />}
    </>
  )
}
