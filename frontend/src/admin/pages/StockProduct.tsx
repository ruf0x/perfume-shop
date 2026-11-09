import { isAxiosError } from 'axios'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useIsOwner } from '../auth'
import { ConfirmDialog, EmptyState, ErrorState, Loading, PageHeader } from '../components/common'
import { apiError, formatDateTime } from '../lib'
import { useMovements, useStock, useStockSummary, useStockWrite } from '../queries'
import type { Movement, OpenBottle, StockRow, StockSummary } from '../types'
import { AdjustDialog, EntryDialog, STATUS, TYPE_LABEL, sign } from './Stock'
import { inputClass } from '../components/common'

/** One product's stock on its own page: what each size did (received, opened, sold, lost, left), actions, history. */
export default function StockProduct() {
  const { id } = useParams()
  const productId = Number(id)
  const owner = useIsOwner()
  const stock = useStock({})
  const summary = useStockSummary(productId)
  const movements = useMovements({ product_id: productId })
  const { openBottle, deleteMovement } = useStockWrite()
  const [editing, setEditing] = useState<Movement | null>(null)
  const [deleting, setDeleting] = useState<Movement | null>(null)
  const [entry, setEntry] = useState<StockRow | null>(null)
  const [adjust, setAdjust] = useState<StockRow | null>(null)
  const [opening, setOpening] = useState<{ variantId: number; label: string; ml: number | null } | null>(null)

  // A product that does not exist (an old link, or the database was rebuilt) is not a loading error.
  if (isAxiosError(summary.error) && summary.error.response?.status === 404) return <EmptyState title="Produit introuvable" hint="Ce lien ne correspond à aucun produit. Revenez au stock." />
  if (stock.isError || summary.isError) return <ErrorState onRetry={() => { stock.refetch(); summary.refetch() }} />
  if (stock.isPending || summary.isPending) return <Loading />

  const row = stock.data?.data.find((r) => r.product_id === productId)
  if (!row || !summary.data) return <EmptyState title="Produit introuvable" hint="Il n'est peut-être plus dans le stock." />

  const rows = movements.data?.data ?? []

  return (
    <>
      <PageHeader
        title={row.name}
        description={[row.brand, row.product_type?.name].filter(Boolean).join(' · ') || undefined}
        actions={
          <div className="flex flex-wrap items-center gap-4">
            <Link to="/admin/stock" className="text-sm underline underline-offset-4">Retour au stock</Link>
            {owner && <Link to={`/admin/produits/${row.product_id}`} className="text-sm underline underline-offset-4">Modifier le produit</Link>}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-medium', STATUS[row.status].cls)}>{STATUS[row.status].label}</span>
        {!row.is_active && <span className="text-sm text-muted-foreground">Masqué de la boutique</span>}
      </div>

      <div className="space-y-6">
        {row.kind === 'perfume' || row.has_pool ? <PoolCard summary={summary.data} /> : null}
        {summary.data.sizes.filter((s) => s.mode === 'unit').map((s) => (
          <SealedCard key={s.variant_id} size={s as Extract<StockSummary['sizes'][number], { mode: 'unit' }>} />
        ))}
        {summary.data.open_bottles.length > 0 && <OpenBottles bottles={summary.data.open_bottles} bulk={summary.data.bulk_ml} owner={owner} />}
        {summary.data.sizes.some((s) => s.mode === 'pool') && <DecantSizes summary={summary.data} />}

        {owner && (
          <div className="flex flex-wrap gap-2">
            <Button className="h-10" onClick={() => setEntry(row)}>Entrée de stock</Button>
            <Button variant="outline" className="h-10" onClick={() => setAdjust(row)}>Perte / correction</Button>
            {row.kind === 'perfume' && row.sealed.filter((s) => s.stock_qty > 0 && s.ml).map((s) => (
              <Button key={s.variant_id} variant="outline" className="h-10" onClick={() => setOpening({ variantId: s.variant_id, label: s.label, ml: s.ml })}>Ouvrir un {s.ml} ml</Button>
            ))}
          </div>
        )}

        <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
          <h2 className="font-display text-xl">Mouvements</h2>
          {movements.isError ? <ErrorState onRetry={() => movements.refetch()} /> : movements.isPending ? <Loading /> : rows.length === 0 ? <EmptyState title="Aucun mouvement" /> : (
            <ul className="divide-y divide-border">
              {rows.map((m) => (
                <li key={m.id} className={cn('flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 text-sm', m.cancelled && 'opacity-50')}>
                  <div className="min-w-0 flex-1 basis-56">
                    <p className={cn('font-medium', m.cancelled && 'line-through')}>{TYPE_LABEL[m.type] ?? m.type}{m.variant ? ` · ${m.variant.label}` : ''}{m.cancelled ? ' · annulé' : ''}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(m.created_at)}{m.user ? `, ${m.user}` : ''}{m.order ? `, ${m.order.reference}` : ''}{m.note ? `, ${m.note}` : ''}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {sign(m.ml_change, 'ml')}{sign(m.qty_change, 'unité(s)')}
                    {owner && m.editable && (
                      <>
                        <Button variant="outline" className="h-8 px-3" onClick={() => setEditing(m)}>Modifier</Button>
                        <Button variant="outline" className="h-8 px-3 text-destructive" onClick={() => setDeleting(m)}>Supprimer</Button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {editing && <MovementEditDialog movement={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Supprimer ce mouvement ?"
        description="Son effet sur le stock est annulé. La ligne reste dans l'historique, marquée annulée."
        confirmLabel="Supprimer"
        destructive
        loading={deleteMovement.isPending}
        onConfirm={() => deleting && deleteMovement.mutate(deleting.id, { onSuccess: () => { toast.success('Mouvement supprimé.'); setDeleting(null) }, onError: (e) => toast.error(apiError(e)) })}
      />
      {entry && <EntryDialog row={entry} onClose={() => setEntry(null)} />}
      {adjust && <AdjustDialog row={adjust} onClose={() => setAdjust(null)} />}
      <ConfirmDialog
        open={!!opening}
        onOpenChange={(o) => !o && setOpening(null)}
        title={`Ouvrir un flacon de ${opening?.label ?? ''} ?`}
        description="Un flacon scellé devient du stock à décanter (son volume passe en ml)."
        confirmLabel="Ouvrir"
        loading={openBottle.isPending}
        onConfirm={() => opening && openBottle.mutate(opening.variantId, { onSuccess: () => { toast.success('Flacon ouvert.'); setOpening(null) }, onError: (e) => toast.error(apiError(e)) })}
      />
    </>
  )
}

/** A bottle drawn with its liquid at `fill` (0 to 1). */
function Bottle({ fill, className }: { fill: number; className?: string }) {
  const level = Math.max(0, Math.min(1, fill))
  const h = level * 86
  return (
    <svg viewBox="0 0 80 120" className={cn('h-32 w-auto shrink-0', className)} aria-hidden>
      <rect x="30" y="2" width="20" height="12" rx="3" className="fill-foreground/80" />
      <rect x="22" y="14" width="36" height="10" rx="2" className="fill-foreground/60" />
      <path d="M14 30 Q14 24 20 24 H60 Q66 24 66 30 V110 Q66 116 60 116 H20 Q14 116 14 110 Z" fill="var(--card)" stroke="currentColor" strokeWidth="2.5" className="text-foreground/70" />
      <rect x="18" y={114 - h} width="44" height={h} rx="3" fill="var(--primary)" />
      <path d="M22 34 H30" stroke="white" strokeOpacity="0.5" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/** A bar split into parts, each with its count. */
function Split({ parts, total }: { parts: { label: string; value: number; cls: string }[]; total: number }) {
  const sum = Math.max(total, 1)
  return (
    <div className="space-y-2">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-secondary">
        {parts.filter((p) => p.value > 0).map((p) => (
          <div key={p.label} className={p.cls} style={{ width: `${Math.min(100, (p.value / sum) * 100)}%` }} title={`${p.label} : ${p.value}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {parts.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-1.5"><span className={cn('size-2.5 rounded-full', p.cls)} aria-hidden />{p.label} {p.value}</span>
        ))}
      </div>
    </div>
  )
}

function Tile({ label, value, hint, emphasis }: { label: string; value: string; hint?: string; emphasis?: boolean }) {
  return (
    <div className={cn('rounded-xl border border-border px-3 py-2.5', emphasis && 'border-primary bg-accent/40')}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tnum text-xl font-semibold">{value}</p>
      {hint && <p className="tnum text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** A sealed bottle size: the bottle is filled to what is left. */
function SealedCard({ size }: { size: Extract<StockSummary['sizes'][number], { mode: 'unit' }> }) {
  const received = size.received + size.adjusted
  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center">
      <Bottle fill={received > 0 ? size.remaining / received : 0} />
      <div className="min-w-0 flex-1 space-y-4">
        <div>
          <h2 className="font-display text-2xl">{size.label}</h2>
          <p className="text-sm text-muted-foreground">Flacons scellés · {size.remaining} restant{size.remaining > 1 ? 's' : ''} sur {received} reçu{received > 1 ? 's' : ''}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="Reçus" value={String(received)} hint={size.ml ? `${received * size.ml} ml` : undefined} />
          <Tile label="Ouverts" value={String(size.opened)} hint={size.ml ? `${size.opened * size.ml} ml versés dans le stock` : undefined} />
          <Tile label="Vendus" value={String(size.sold)} hint={size.ml ? `${size.sold * size.ml} ml` : undefined} />
          <Tile label="Restants" value={String(size.remaining)} hint={size.ml ? `${size.remaining * size.ml} ml` : undefined} emphasis />
        </div>
        {size.ml ? (
          <p className="text-xs text-muted-foreground">Un flacon de {size.ml} ml : {received} reçu{received > 1 ? 's' : ''} = {received * size.ml} ml. Ouvrir un flacon ajoute {size.ml} ml au stock à décanter.</p>
        ) : null}
        <Split
          total={received}
          parts={[
            { label: 'Vendus', value: size.sold, cls: 'bg-foreground' },
            { label: 'Ouverts', value: size.opened, cls: 'bg-muted-foreground/50' },
            { label: 'Perdus', value: size.lost, cls: 'bg-destructive' },
            { label: 'Restants', value: size.remaining, cls: 'bg-primary' },
          ]}
        />
      </div>
    </section>
  )
}

/** The decant pool, in millilitres: what came in, what was opened into it, what went out, and what is left. */
function PoolCard({ summary }: { summary: StockSummary }) {
  const p = summary.pool
  const total = p.received_ml + p.opened_ml
  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center">
      <Bottle fill={total > 0 ? p.remaining_ml / total : 0} className="h-40" />
      <div className="min-w-0 flex-1 space-y-4">
        <div>
          <h2 className="font-display text-2xl">À décanter</h2>
          <p className="tnum text-sm text-muted-foreground">{p.remaining_ml} ml restant{p.remaining_ml > 1 ? 's' : ''}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="Reçus" value={`${p.received_ml} ml`} />
          <Tile label="Ouverts" value={`${p.opened_ml} ml`} />
          <Tile label="Vendus" value={`${p.sold_ml} ml`} />
          <Tile label="Restants" value={`${p.remaining_ml} ml`} emphasis />
        </div>
        <p className="tnum rounded-xl bg-secondary/60 px-3 py-2 text-sm">
          {p.received_ml} ml reçus + {p.opened_ml} ml ouverts − {p.sold_ml} ml vendus − {p.lost_ml} ml perdus{p.adjusted_ml ? ` ${p.adjusted_ml >= 0 ? '+' : '−'} ${Math.abs(p.adjusted_ml)} ml corrigés` : ''} = <strong>{p.remaining_ml} ml</strong>
        </p>
        <Split
          total={total}
          parts={[
            { label: 'Vendus', value: p.sold_ml, cls: 'bg-foreground' },
            { label: 'Perdus', value: p.lost_ml, cls: 'bg-destructive' },
            { label: 'Restants', value: p.remaining_ml, cls: 'bg-primary' },
          ]}
        />
      </div>
    </section>
  )
}

/** The decant sizes sold (10 ml, 20 ml...): how many bottles of each left the shop. */
function DecantSizes({ summary }: { summary: StockSummary }) {
  const sizes = summary.sizes.filter((s): s is Extract<StockSummary['sizes'][number], { mode: 'pool' }> => s.mode === 'pool')
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <h2 className="font-display text-xl">Ventes par taille</h2>
      <div className="grid gap-2 sm:grid-cols-3">
        {sizes.map((s) => (
          <div key={s.variant_id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
            <Bottle fill={s.sold > 0 ? 1 : 0} className="h-10" />
            <div className="min-w-0">
              <p className="font-medium">{s.label}</p>
              <p className="tnum text-sm text-muted-foreground">{s.sold_ml} ml vendus · {s.sold} flacon{s.sold > 1 ? 's' : ''} de {s.ml} ml</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/** Each bottle used for decanting: what it gave, and what is left in it. */
function OpenBottles({ bottles, bulk, owner }: { bottles: OpenBottle[]; bulk: number; owner: boolean }) {
  const { discardBottle } = useStockWrite()
  const left = bottles.reduce((n, b) => n + b.remaining, 0)
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div>
        <h2 className="font-display text-xl">Flacons en décantage</h2>
        <p className="tnum text-sm text-muted-foreground">
          {bottles.map((b) => `${b.remaining} ml`).join(' + ')}{bottles.length > 1 ? ` = ${left} ml` : ''} restants dans le stock à décanter
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {bottles.map((b, i) => {
          const empty = b.remaining === 0
          return (
            <div key={`${b.label}-${i}`} className={cn('flex items-center gap-4 rounded-xl border border-border p-4', empty && 'opacity-60')}>
              <Bottle fill={b.capacity > 0 ? b.remaining / b.capacity : 0} className="h-24" />
              <div className="tnum min-w-0 flex-1 space-y-1.5 text-sm">
                <p className="font-display text-lg leading-tight">{b.label}</p>
                <p className="text-xs text-muted-foreground">{b.opened_at ? `ouvert le ${formatDateTime(b.opened_at)}` : ''}{b.bulk ? 'en vrac' : ''}</p>
                <p><strong className="text-base">{b.remaining} ml</strong> restants sur {b.capacity} ml{empty ? ' · vide' : ''}</p>
                <p className="text-muted-foreground">{b.decanted} ml décantés{b.lost ? ` · ${b.lost} ml perdus` : ''}{b.adjusted ? ` · ${b.adjusted} ml corrigés` : ''}</p>
                {owner && b.decanted === 0 && b.lost === 0 && b.adjusted === 0 && b.remaining === b.capacity && (
                  <Button variant="outline" className="h-8 px-3 text-destructive" onClick={() => discardBottle.mutate(b.id, { onSuccess: () => toast.success('Flacon supprimé.'), onError: (e) => toast.error(apiError(e)) })}>Supprimer (ouvert par erreur)</Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {bulk > 0 && <p className="tnum text-xs text-muted-foreground">+ {bulk} ml en vrac, qui ne viennent d'aucun flacon ouvert.</p>}
    </section>
  )
}

/** Correct a hand-made movement: the new quantity in its own unit, and the reason. */
function MovementEditDialog({ movement, onClose }: { movement: Movement; onClose: () => void }) {
  const { correctMovement } = useStockWrite()
  const isMl = movement.ml_change !== 0
  const [quantity, setQuantity] = useState(String(Math.abs(isMl ? movement.ml_change : movement.qty_change)))
  const [note, setNote] = useState(movement.note ?? '')

  const submit = () => {
    const n = Number(quantity)
    if (!(n > 0)) return toast.error('Indiquez une quantité.')
    if (!note.trim()) return toast.error('Expliquez la correction.')
    correctMovement.mutate({ id: movement.id, quantity: n, note: note.trim() }, { onSuccess: () => { toast.success('Mouvement corrigé.'); onClose() }, onError: (e) => toast.error(apiError(e)) })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Corriger : {TYPE_LABEL[movement.type] ?? movement.type}</DialogTitle>
          <DialogDescription>Le mouvement d'origine est annulé et remplacé par celui-ci. L'historique garde les deux.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1 text-sm"><span className="text-muted-foreground">{isMl ? 'Quantité (ml)' : 'Quantité (unités)'}</span>
            <input type="number" min={1} inputMode="numeric" className={inputClass} value={quantity} onChange={(e) => setQuantity(e.target.value)} autoFocus />
          </label>
          <label className="block space-y-1 text-sm"><span className="text-muted-foreground">Raison</span>
            <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="h-10" onClick={onClose}>Annuler</Button>
          <Button className="h-10" onClick={submit} disabled={correctMovement.isPending}>{correctMovement.isPending ? 'Un instant…' : 'Enregistrer'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
