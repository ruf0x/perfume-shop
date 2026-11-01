import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { formatPrice } from '@/shop/format'
import { ConfirmDialog, ErrorState, Loading, PageHeader, inputClass } from '../components/common'
import { apiError, formatDateTime } from '../lib'
import { useBottleMovements, useBottles, useBottleWrite } from '../queries'

const TYPE_LABEL: Record<string, string> = {
  entree: 'Entrée',
  vente_en_ligne: 'Vente en ligne',
  vente_caisse: 'Vente en caisse',
  annulation: 'Annulation',
  retour: 'Retour',
  ajustement: 'Correction',
  perte: 'Perte',
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="tnum mt-1 font-sans text-2xl font-semibold">{value}</p>
      {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
    </div>
  )
}

export default function Bottles() {
  const query = useBottles()
  const [filter, setFilter] = useState<number | undefined>()
  const history = useBottleMovements(filter)
  const { entry, adjust, renameSize, deleteSize, updateMovement, deleteMovement } = useBottleWrite()
  const [renaming, setRenaming] = useState<{ id: number; ml: string } | null>(null)
  const [removing, setRemoving] = useState<{ id: number; ml: number } | null>(null)
  const [editing, setEditing] = useState<{ id: number; type: string; ml: number; quantity: string; cost: string; note: string } | null>(null)
  const [deletingMove, setDeletingMove] = useState<number | null>(null)
  const [adding, setAdding] = useState<{ ml: string } | null>(null)
  const [fixing, setFixing] = useState<number | null>(null)
  const [qty, setQty] = useState('')
  const [cost, setCost] = useState('')
  const [note, setNote] = useState('')
  const [kind, setKind] = useState<'perte' | 'ajustement'>('perte')
  const [direction, setDirection] = useState<1 | -1>(-1)

  const close = () => {
    setAdding(null)
    setFixing(null)
    setQty('')
    setCost('')
    setNote('')
    setKind('perte')
    setDirection(-1)
  }

  const saveEntry = () => {
    if (!(Number(adding?.ml) > 0) || !(Number(qty) > 0)) return toast.error('Indiquez la taille et la quantité.')
    entry.mutate(
      { ml: Number(adding!.ml), quantity: Number(qty), total_cost: cost === '' ? undefined : Number(cost), note: note || undefined },
      { onSuccess: () => { toast.success('Bouteilles ajoutées.'); close() }, onError: (e) => toast.error(apiError(e)) },
    )
  }

  const saveFix = () => {
    if (!(Number(qty) > 0)) return toast.error('Indiquez une quantité.')
    if (!note.trim()) return toast.error('Expliquez en quelques mots (une note est obligatoire).')
    adjust.mutate(
      { ml: fixing!, quantity: (kind === 'perte' ? -1 : direction) * Number(qty), type: kind, note },
      { onSuccess: () => { toast.success('Stock corrigé.'); close() }, onError: (e) => toast.error(apiError(e)) },
    )
  }

  if (query.isError) return <ErrorState onRetry={() => query.refetch()} />
  if (query.isPending) return <Loading />
  const { data: sizes, totals } = query.data

  return (
    <>
      <PageHeader
        title="Bouteilles"
        description="Les petites bouteilles vides où vous versez les décants (10 ml, 20 ml…). Chaque décant vendu en utilise une. Une taille que vous n'avez pas ajoutée n'est pas comptée."
        actions={<Button className="h-10" onClick={() => setAdding({ ml: '' })}>Ajouter des bouteilles</Button>}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Investi" value={formatPrice(totals.invested)} sub="Total des achats de bouteilles" />
        <Tile label="Bouteilles achetées" value={String(totals.bought)} />
        <Tile label="Bouteilles restantes" value={String(totals.bottles_left)} />
        <Tile label="Valeur restante" value={formatPrice(totals.value_left)} sub="Au prix moyen d'achat" />
      </div>

      {sizes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">Aucune bouteille suivie. Ajoutez vos premières bouteilles (par exemple 100 bouteilles de 10 ml) pour commencer le suivi.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-start text-muted-foreground">
              <tr>
                <th className="p-3 text-start font-medium">Taille</th>
                <th className="p-3 text-end font-medium">Restantes</th>
                <th className="p-3 text-end font-medium">Achetées</th>
                <th className="p-3 text-end font-medium">Investi</th>
                <th className="p-3 text-end font-medium">Prix moyen</th>
                <th className="p-3 text-end font-medium">Valeur restante</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sizes.map((s) => (
                <tr key={s.id}>
                  <td className="p-3 font-medium">
                    {s.ml} ml {s.qty <= 0 ? <span className="ms-2 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-900">Épuisées</span> : s.low && <span className="ms-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Stock faible</span>}
                  </td>
                  <td className="tnum p-3 text-end font-semibold">{s.qty}</td>
                  <td className="tnum p-3 text-end">{s.bought}</td>
                  <td className="tnum p-3 text-end">{formatPrice(s.invested)}</td>
                  <td className="tnum p-3 text-end">{s.unit_cost !== null ? formatPrice(s.unit_cost) : '—'}</td>
                  <td className="tnum p-3 text-end">{s.value_left !== null ? formatPrice(s.value_left) : '—'}</td>
                  <td className="p-3 text-end">
                    <span className="flex justify-end gap-2">
                      <Button variant="outline" className="h-9" onClick={() => setAdding({ ml: String(s.ml) })}>Ajouter</Button>
                      <Button variant="outline" className="h-9" onClick={() => setFixing(s.ml)}>Perte / correction</Button>
                      <Button variant="outline" className="h-9" onClick={() => setRenaming({ id: s.id, ml: String(s.ml) })}>Modifier</Button>
                      <Button variant="outline" className="h-9 text-destructive hover:text-destructive" onClick={() => setRemoving({ id: s.id, ml: s.ml })} aria-label={`Supprimer ${s.ml} ml`}>Supprimer</Button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="mt-8" aria-label="Historique">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl">Historique</h2>
          <select className={`${inputClass} w-44`} aria-label="Taille" value={filter ?? ''} onChange={(e) => setFilter(e.target.value ? Number(e.target.value) : undefined)}>
            <option value="">Toutes les tailles</option>
            {sizes.map((s) => <option key={s.id} value={s.ml}>{s.ml} ml</option>)}
          </select>
        </div>
        {history.data && history.data.data.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground">Aucun mouvement</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card text-sm">
            {history.data?.data.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span className="min-w-0">
                  <span className="font-medium">{TYPE_LABEL[m.type] ?? m.type}</span>
                  <span className="text-muted-foreground">{` · ${m.ml} ml${m.order ? ` · ${m.order}` : ''}${m.note ? ` · ${m.note}` : ''}`}</span>
                  <span className="block text-xs text-muted-foreground">{`${formatDateTime(m.created_at)}${m.user ? `, ${m.user}` : ''}`}</span>
                </span>
                <span className="flex shrink-0 items-center gap-4">
                  {m.editable && (
                    <span className="flex gap-3 text-xs">
                      <button type="button" className="underline underline-offset-4" onClick={() => setEditing({ id: m.id, type: m.type, ml: m.ml, quantity: String(m.qty_change), cost: m.total_cost !== null ? String(m.total_cost) : '', note: m.note ?? '' })}>Modifier</button>
                      <button type="button" className="text-destructive underline underline-offset-4" onClick={() => setDeletingMove(m.id)}>Supprimer</button>
                    </span>
                  )}
                  <span className="tnum text-end">
                    <strong className={m.qty_change < 0 ? 'text-destructive' : ''}>{m.qty_change > 0 ? `+${m.qty_change}` : m.qty_change}</strong>
                    {m.total_cost !== null && <span className="block text-xs text-muted-foreground">{formatPrice(m.total_cost)}</span>}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog open={renaming !== null} onOpenChange={(o) => !o && setRenaming(null)} title="Modifier la taille" description="Corrigez la contenance si vous vous êtes trompé (100 au lieu de 10, par exemple)." confirmLabel="Enregistrer" loading={renameSize.isPending} onConfirm={() => renaming && renameSize.mutate({ id: renaming.id, ml: Number(renaming.ml) }, { onSuccess: () => { toast.success('Taille modifiée.'); setRenaming(null) }, onError: (e) => toast.error(apiError(e)) })}>
        <label className="block space-y-1 text-sm"><span className="text-muted-foreground">Taille (ml)</span><input type="number" min={1} className={inputClass} value={renaming?.ml ?? ''} onChange={(e) => setRenaming(renaming && { ...renaming, ml: e.target.value })} /></label>
      </ConfirmDialog>

      <ConfirmDialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)} title={`Supprimer les bouteilles de ${removing?.ml ?? ''} ml ?`} description="Le suivi de cette taille s'arrête et son historique est effacé. Les décants de cette taille ne seront plus limités par les bouteilles." confirmLabel="Supprimer" destructive loading={deleteSize.isPending} onConfirm={() => removing && deleteSize.mutate(removing.id, { onSuccess: () => { toast.success('Taille supprimée.'); setRemoving(null) }, onError: (e) => toast.error(apiError(e)) })} />

      <ConfirmDialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} title={`Modifier ce mouvement, ${editing?.ml ?? ''} ml`} description="Le nombre de bouteilles suit la correction. Il ne peut pas passer sous zéro." confirmLabel="Enregistrer" loading={updateMovement.isPending} onConfirm={() => editing && updateMovement.mutate({ id: editing.id, quantity: Number(editing.quantity), total_cost: editing.type === 'entree' && editing.cost !== '' ? Number(editing.cost) : null, note: editing.note || null }, { onSuccess: () => { toast.success('Mouvement modifié.'); setEditing(null) }, onError: (e) => toast.error(apiError(e)) })}>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="space-y-1"><span className="text-muted-foreground">Nombre de bouteilles</span><input type="number" className={inputClass} value={editing?.quantity ?? ''} onChange={(e) => setEditing(editing && { ...editing, quantity: e.target.value })} /></label>
          {editing?.type === 'entree' && <label className="space-y-1"><span className="text-muted-foreground">Coût total (DA)</span><input type="number" min={0} className={inputClass} value={editing.cost} onChange={(e) => setEditing({ ...editing, cost: e.target.value })} /></label>}
          <label className="col-span-2 space-y-1"><span className="text-muted-foreground">Note</span><input className={inputClass} value={editing?.note ?? ''} onChange={(e) => setEditing(editing && { ...editing, note: e.target.value })} /></label>
        </div>
      </ConfirmDialog>

      <ConfirmDialog open={deletingMove !== null} onOpenChange={(o) => !o && setDeletingMove(null)} title="Supprimer ce mouvement ?" description="Son effet est retiré du nombre de bouteilles. Impossible si ces bouteilles ont déjà servi." confirmLabel="Supprimer" destructive loading={deleteMovement.isPending} onConfirm={() => deletingMove !== null && deleteMovement.mutate(deletingMove, { onSuccess: () => { toast.success('Mouvement supprimé.'); setDeletingMove(null) }, onError: (e) => toast.error(apiError(e)) })} />

      <ConfirmDialog open={adding !== null} onOpenChange={(o) => !o && close()} title="Ajouter des bouteilles" description="Vous avez reçu ou acheté des bouteilles vides." confirmLabel="Ajouter" loading={entry.isPending} onConfirm={saveEntry}>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="space-y-1"><span className="text-muted-foreground">Taille (ml)</span><input type="number" min={1} className={inputClass} value={adding?.ml ?? ''} onChange={(e) => setAdding({ ml: e.target.value })} placeholder="10" /></label>
          <label className="space-y-1"><span className="text-muted-foreground">Nombre de bouteilles</span><input type="number" min={1} className={inputClass} value={qty} onChange={(e) => setQty(e.target.value)} /></label>
          <label className="col-span-2 space-y-1"><span className="text-muted-foreground">Coût d'achat total en DA (facultatif)</span><input type="number" min={0} className={inputClass} value={cost} onChange={(e) => setCost(e.target.value)} /></label>
          <label className="col-span-2 space-y-1"><span className="text-muted-foreground">Note (facultatif)</span><input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Fournisseur, facture…" /></label>
        </div>
      </ConfirmDialog>

      <ConfirmDialog open={fixing !== null} onOpenChange={(o) => !o && close()} title={`Perte ou correction, ${fixing ?? ''} ml`} description="Le nombre de bouteilles ne peut jamais passer sous zéro." confirmLabel="Enregistrer" destructive={kind === 'perte'} loading={adjust.isPending} onConfirm={saveFix}>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Type">
            {([['perte', 'Perte (cassées, abîmées…)'], ['ajustement', 'Correction de comptage']] as const).map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={kind === v} onClick={() => setKind(v)} className={`rounded-md border px-3 py-2.5 text-start ${kind === v ? 'border-primary bg-accent font-medium' : 'border-input'}`}>{l}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {kind === 'ajustement' ? (
              <label className="space-y-1"><span className="text-muted-foreground">Sens</span><select className={inputClass} value={direction} onChange={(e) => setDirection(Number(e.target.value) as 1 | -1)}><option value={1}>Ajouter</option><option value={-1}>Retirer</option></select></label>
            ) : <div />}
            <label className="space-y-1"><span className="text-muted-foreground">Nombre de bouteilles</span><input type="number" min={1} className={inputClass} value={qty} onChange={(e) => setQty(e.target.value)} /></label>
          </div>
          <label className="block space-y-1"><span className="text-muted-foreground">Pourquoi ?</span><input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Bouteilles cassées, erreur de comptage…" /></label>
        </div>
      </ConfirmDialog>
    </>
  )
}
