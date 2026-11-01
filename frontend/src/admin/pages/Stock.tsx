import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { formatPrice } from '@/shop/format'
import { useIsOwner } from '../auth'
import { ConfirmDialog, EmptyState, ErrorState, Loading, PageHeader, Pagination, inputClass } from '../components/common'
import { apiError, formatDateTime } from '../lib'
import { useMovements, useProductTypes, useStock, useStockWrite, useTaxa } from '../queries'
import type { StockRow } from '../types'

const TYPE_LABEL: Record<string, string> = {
  entree: 'Entrée',
  vente_en_ligne: 'Vente en ligne',
  vente_caisse: 'Vente en caisse',
  annulation: 'Annulation',
  retour: 'Retour',
  ajustement: 'Ajustement',
  perte: 'Perte',
  ouverture_flacon: 'Ouverture de flacon',
}

const STATUS = {
  ok: { label: 'En stock', cls: 'bg-emerald-100 text-emerald-900' },
  low: { label: 'Stock faible', cls: 'bg-amber-100 text-amber-900' },
  out: { label: 'Épuisé', cls: 'bg-red-100 text-red-900' },
} as const

const sign = (n: number, unit: string) => (n === 0 ? null : <span className={cn('tnum', n > 0 ? 'text-emerald-700' : 'text-red-700')}>{n > 0 ? '+' : '−'}{Math.abs(n)} {unit}</span>)

function EntryDialog({ row, onClose }: { row: StockRow; onClose: () => void }) {
  const { entry } = useStockWrite()
  const cosmetic = row.kind === 'standard'
  // A perfume is received in ml (for decanting) or as sealed bottles; a cosmetic in pieces, or in ml if sold by volume.
  const canMl = !cosmetic || row.has_pool || row.sealed.length === 0
  const canUnit = row.sealed.length > 0
  const [mode, setMode] = useState<'ml' | 'unit'>(canMl && !(cosmetic && canUnit) ? 'ml' : 'unit')
  const [bottles, setBottles] = useState('1')
  const [size, setSize] = useState('100')
  const [variant, setVariant] = useState(row.sealed[0]?.variant_id ?? 0)
  const [qty, setQty] = useState('1')
  const [cost, setCost] = useState('')
  const [note, setNote] = useState('')
  const total = (Number(bottles) || 0) * (Number(size) || 0)

  const submit = () => {
    const base = { product_id: row.product_id, unit_cost: cost ? Number(cost) : undefined, note: note || undefined }
    const body = mode === 'ml' ? { ...base, ml: total } : { ...base, variant_id: variant, qty: Number(qty) }
    if ((mode === 'ml' && total <= 0) || (mode === 'unit' && !(Number(qty) > 0))) return toast.error('Indiquez une quantité.')
    entry.mutate(body, { onSuccess: () => { toast.success('Stock ajouté.'); onClose() }, onError: (e) => toast.error(apiError(e)) })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Entrée de stock, {row.name}</DialogTitle>
          <DialogDescription>Vous avez reçu de la marchandise.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          {canMl && canUnit && (
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Type d'entrée">
              {([['ml', cosmetic ? 'Au millilitre' : 'À décanter (en ml)'], ['unit', cosmetic ? 'À l\'unité' : 'Flacons scellés']] as const).map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={mode === v} onClick={() => setMode(v)} className={cn('rounded-md border px-3 py-2.5 text-start', mode === v ? 'border-primary bg-accent font-medium' : 'border-input')}>{l}</button>
              ))}
            </div>
          )}
          {mode === 'ml' ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1"><span className="text-muted-foreground">{cosmetic ? 'Nombre de contenants' : 'Nombre de flacons'}</span><input type="number" min={1} className={inputClass} value={bottles} onChange={(e) => setBottles(e.target.value)} /></label>
                <label className="space-y-1"><span className="text-muted-foreground">Contenance (ml)</span><input type="number" min={1} className={inputClass} value={size} onChange={(e) => setSize(e.target.value)} /></label>
              </div>
              <p className="tnum">Total ajouté au stock {cosmetic ? 'en ml' : 'à décanter'} : <strong>{total} ml</strong></p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1"><span className="text-muted-foreground">{cosmetic ? 'Option' : 'Taille'}</span><select className={inputClass} value={variant} onChange={(e) => setVariant(Number(e.target.value))}>{row.sealed.map((s) => <option key={s.variant_id} value={s.variant_id}>{s.label}</option>)}</select></label>
              <label className="space-y-1"><span className="text-muted-foreground">{cosmetic ? 'Quantité reçue' : 'Nombre de flacons'}</span><input type="number" min={1} className={inputClass} value={qty} onChange={(e) => setQty(e.target.value)} /></label>
            </div>
          )}
          <label className="block space-y-1"><span className="text-muted-foreground">Coût d'achat total en DA (facultatif)</span><input type="number" min={0} className={inputClass} value={cost} onChange={(e) => setCost(e.target.value)} /></label>
          <label className="block space-y-1"><span className="text-muted-foreground">Note (facultatif)</span><input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Fournisseur, facture…" /></label>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="h-10" onClick={onClose}>Annuler</Button>
          <Button className="h-10" onClick={submit} disabled={entry.isPending}>{entry.isPending ? 'Un instant…' : 'Ajouter au stock'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AdjustDialog({ row, onClose }: { row: StockRow; onClose: () => void }) {
  const { adjust } = useStockWrite()
  const [type, setType] = useState<'perte' | 'ajustement'>('perte')
  const [direction, setDirection] = useState<1 | -1>(-1)
  const cosmetic = row.kind === 'standard'
  const unitsOnly = cosmetic && !row.has_pool && row.sealed.length > 0
  const [target, setTarget] = useState<number>(unitsOnly ? row.sealed[0].variant_id : 0) // 0 = ml pool, else a counted variant id
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const sign = type === 'perte' ? -1 : direction
  const unit = target === 0 ? 'ml' : cosmetic ? 'article(s)' : 'flacon(s)'

  const submit = () => {
    const n = Number(amount)
    if (!(n > 0)) return toast.error('Indiquez une quantité.')
    if (!note.trim()) return toast.error('Expliquez en quelques mots (une note est obligatoire).')
    adjust.mutate(
      { product_id: row.product_id, type, note, ...(target === 0 ? { ml_change: sign * n } : { variant_id: target, qty_change: sign * n }) },
      { onSuccess: () => { toast.success('Stock corrigé.'); onClose() }, onError: (e) => toast.error(apiError(e)) },
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Perte ou correction, {row.name}</DialogTitle>
          <DialogDescription>Le stock ne peut jamais passer sous zéro.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Type">
            {([['perte', 'Perte (renversé, testeur…)'], ['ajustement', 'Correction d’inventaire']] as const).map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={type === v} onClick={() => setType(v)} className={cn('rounded-md border px-3 py-2.5 text-start', type === v ? 'border-primary bg-accent font-medium' : 'border-input')}>{l}</button>
            ))}
          </div>
          {row.sealed.length > 0 && (
            <label className="block space-y-1"><span className="text-muted-foreground">Sur quoi ?</span>
              <select className={inputClass} value={target} onChange={(e) => setTarget(Number(e.target.value))}>
                {!unitsOnly && <option value={0}>{cosmetic ? 'Stock en ml' : 'Stock à décanter (ml)'}</option>}
                {row.sealed.map((s) => <option key={s.variant_id} value={s.variant_id}>{s.label} ({cosmetic ? 'articles' : 'flacons'})</option>)}
              </select>
            </label>
          )}
          <div className="grid grid-cols-2 gap-3">
            {type === 'ajustement' ? (
              <label className="space-y-1"><span className="text-muted-foreground">Sens</span><select className={inputClass} value={direction} onChange={(e) => setDirection(Number(e.target.value) as 1 | -1)}><option value={1}>Ajouter</option><option value={-1}>Retirer</option></select></label>
            ) : <div />}
            <label className="space-y-1"><span className="text-muted-foreground">Quantité ({unit})</span><input type="number" min={1} className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          </div>
          <label className="block space-y-1"><span className="text-muted-foreground">Pourquoi ?</span><input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Flacon renversé, erreur de comptage…" /></label>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="h-10" onClick={onClose}>Annuler</Button>
          <Button variant={type === 'perte' ? 'destructive' : 'default'} className="h-10" onClick={submit} disabled={adjust.isPending}>{adjust.isPending ? 'Un instant…' : 'Enregistrer'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Overview() {
  const owner = useIsOwner()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'' | 'ok' | 'low' | 'out'>('')
  const [rayonId, setRayonId] = useState('')
  const [typeId, setTypeId] = useState('')
  const productTypes = useProductTypes()
  const categories = useTaxa('types')
  const query = useStock({ q: q || undefined, status: status || undefined, product_type_id: rayonId ? Number(rayonId) : undefined, type_id: typeId ? Number(typeId) : undefined })
  const shownCategories = (categories.data ?? []).filter((c) => !rayonId || c.product_type_id === Number(rayonId))
  const { openBottle } = useStockWrite()
  const [page, setPage] = useState(1)
  const [entry, setEntry] = useState<StockRow | null>(null)
  const [adjust, setAdjust] = useState<StockRow | null>(null)
  const [open, setOpen] = useState<{ row: StockRow; variantId: number; label: string; ml: number | null } | null>(null)
  const rows = query.data?.data ?? []
  const PER_PAGE = 15
  const lastPage = Math.max(1, Math.ceil(rows.length / PER_PAGE))
  const safePage = Math.min(page, lastPage)
  const pageRows = rows.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE)

  return (
    <>
      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <label className="col-span-2 space-y-1 text-sm md:col-span-1"><span className="text-muted-foreground">Rechercher</span><input type="search" className={inputClass} value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} placeholder="Nom du produit" /></label>
        <label className="space-y-1 text-sm"><span className="text-muted-foreground">Type de produit</span>
          <select className={inputClass} value={rayonId} onChange={(e) => { setRayonId(e.target.value); setTypeId(''); setPage(1) }}><option value="">Tous</option>{productTypes.data?.map((pt) => <option key={pt.id} value={pt.id}>{pt.name}</option>)}</select>
        </label>
        <label className="space-y-1 text-sm"><span className="text-muted-foreground">Famille ou catégorie</span>
          <select className={inputClass} value={typeId} onChange={(e) => { setTypeId(e.target.value); setPage(1) }}><option value="">Toutes</option>{shownCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </label>
        <label className="space-y-1 text-sm"><span className="text-muted-foreground">État</span>
          <select className={inputClass} value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1) }}><option value="">Tous</option><option value="ok">En stock</option><option value="low">Stock faible</option><option value="out">Épuisés</option></select>
        </label>
        {query.data && <p className="col-span-2 text-sm text-muted-foreground md:col-span-5">Seuils : un parfum n'est plus proposé sous {query.data.low_stock_threshold_ml} ml ; un produit à la pièce est signalé « stock faible » à {query.data.low_stock_threshold_qty} article(s) ou moins.</p>}
      </section>

      {query.isError ? <ErrorState onRetry={() => query.refetch()} /> : query.isPending ? <Loading /> : rows.length === 0 ? <EmptyState title="Aucun produit" hint={q || rayonId || typeId || status ? 'Aucun résultat avec ces filtres.' : 'Créez un produit pour gérer son stock.'} /> : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {pageRows.map((r) => (
            <li key={r.product_id} className="space-y-3 p-4 md:flex md:items-center md:gap-6 md:space-y-0">
              <div className="min-w-0 md:w-1/4">
                <p className="truncate font-display text-lg leading-tight">{r.name}{r.kind === 'standard' && <span className="ms-2 rounded-full bg-accent px-2 py-0.5 align-middle font-sans text-xs text-accent-foreground">{r.product_type?.name ?? 'Standard'}</span>}</p>
                <p className="truncate text-sm text-muted-foreground">{r.brand ?? '—'}{!r.is_active && ', masqué'}</p>
              </div>
              <div className="tnum flex-1 text-sm">
                {(r.kind === 'perfume' || r.has_pool || r.sealed.length === 0) && <p><strong className="text-base">{r.stock_ml} ml</strong> {r.kind === 'perfume' ? 'à décanter' : 'en stock'}</p>}
                {r.sealed.length > 0 && (
                  <p className={r.kind === 'perfume' ? 'text-muted-foreground' : undefined}>
                    {r.kind === 'standard' && <strong className="text-base">{r.sealed.reduce((n, s) => n + s.stock_qty, 0)} en stock</strong>}
                    {r.kind === 'standard' && <span className="text-muted-foreground"> : </span>}
                    <span className="text-muted-foreground">{r.sealed.map((s) => `${s.stock_qty} × ${s.label}`).join(', ')}</span>
                  </p>
                )}
              </div>
              <span className={cn('inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-medium', STATUS[r.status].cls)}>{STATUS[r.status].label}</span>
              {owner && (
                <div className="flex flex-wrap gap-2">
                  <Button className="h-9" onClick={() => setEntry(r)}>Entrée</Button>
                  <Button variant="outline" className="h-9" onClick={() => setAdjust(r)}>Perte / correction</Button>
                  {r.kind === 'perfume' && r.sealed.filter((s) => s.stock_qty > 0 && s.ml).map((s) => (
                    <Button key={s.variant_id} variant="outline" className="h-9" onClick={() => setOpen({ row: r, variantId: s.variant_id, label: s.label, ml: s.ml })}>Ouvrir un {s.ml} ml</Button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Pagination meta={{ current_page: safePage, last_page: lastPage, per_page: PER_PAGE, total: rows.length }} onPage={setPage} />

      {entry && <EntryDialog row={entry} onClose={() => setEntry(null)} />}
      {adjust && <AdjustDialog row={adjust} onClose={() => setAdjust(null)} />}
      <ConfirmDialog
        open={!!open}
        onOpenChange={(o) => !o && setOpen(null)}
        title="Ouvrir un flacon ?"
        description={open ? `1 « ${open.label} » de ${open.row.name} passe au stock à décanter : +${open.ml} ml.` : undefined}
        confirmLabel="Ouvrir le flacon"
        loading={openBottle.isPending}
        onConfirm={() => open && openBottle.mutate(open.variantId, { onSuccess: () => { toast.success('Flacon ouvert.'); setOpen(null) }, onError: (e) => { toast.error(apiError(e)); setOpen(null) } })}
      />
    </>
  )
}

function Movements() {
  const [filters, setFilters] = useState<{ product_id?: number; type?: string; from?: string; to?: string; page?: number }>({})
  const products = useStock({})
  const query = useMovements(filters)
  const set = (patch: Partial<typeof filters>) => setFilters((f) => ({ ...f, page: undefined, ...patch }))
  const rows = query.data?.data ?? []

  return (
    <>
      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <label className="col-span-2 space-y-1 text-sm md:col-span-1"><span className="text-muted-foreground">Produit</span>
          <select className={inputClass} value={filters.product_id ?? ''} onChange={(e) => set({ product_id: e.target.value ? Number(e.target.value) : undefined })}><option value="">Tous</option>{products.data?.data.map((p) => <option key={p.product_id} value={p.product_id}>{p.name}</option>)}</select>
        </label>
        <label className="col-span-2 space-y-1 text-sm md:col-span-1"><span className="text-muted-foreground">Type</span>
          <select className={inputClass} value={filters.type ?? ''} onChange={(e) => set({ type: e.target.value || undefined })}><option value="">Tous</option>{Object.entries(TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
        <label className="space-y-1 text-sm"><span className="text-muted-foreground">Du</span><input type="date" className={inputClass} value={filters.from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} /></label>
        <label className="space-y-1 text-sm"><span className="text-muted-foreground">Au</span><input type="date" className={inputClass} value={filters.to ?? ''} onChange={(e) => set({ to: e.target.value || undefined })} /></label>
      </section>

      {query.isError ? <ErrorState onRetry={() => query.refetch()} /> : query.isPending ? <Loading /> : rows.length === 0 ? <EmptyState title="Aucun mouvement" /> : (
        <div className={cn(query.isPlaceholderData && 'opacity-60')}>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {rows.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 p-3 text-sm sm:px-4">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="font-medium">{TYPE_LABEL[m.type] ?? m.type}, {m.product.name}{m.variant ? ` (${m.variant.label})` : ''}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(m.created_at)}{m.user ? `, ${m.user}` : ''}{m.order ? `, ${m.order.reference}` : ''}{m.note ? `, ${m.note}` : ''}</p>
                </div>
                <div className="flex gap-4">{sign(m.ml_change, 'ml')}{sign(m.qty_change, 'unité(s)')}{m.unit_cost ? <span className="tnum text-muted-foreground">{formatPrice(m.unit_cost)}</span> : null}</div>
              </li>
            ))}
          </ul>
          <Pagination meta={query.data?.meta} onPage={(page) => setFilters((f) => ({ ...f, page }))} />
        </div>
      )}
    </>
  )
}

export default function Stock() {
  const [tab, setTab] = useState<'overview' | 'movements'>('overview')

  return (
    <>
      <PageHeader title="Stock" description="Combien il vous reste de chaque produit (parfums et cosmétiques), et tout ce qui a bougé." />
      <div role="tablist" aria-label="Vue" className="mb-6 flex gap-1">
        {([['overview', 'Stock actuel'], ['movements', 'Historique des mouvements']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn('rounded-md px-4 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring', tab === k ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-secondary/70')}>{l}</button>
        ))}
      </div>
      {tab === 'overview' ? <Overview /> : <Movements />}
    </>
  )
}
