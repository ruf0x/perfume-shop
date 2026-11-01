import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { ConfirmDialog, EmptyState, ErrorState, Loading, PageHeader, inputClass } from '../components/common'
import { apiError } from '../lib'
import { useDeleteProductType, useProductTypes, useSaveProductType } from '../queries'
import type { AdminProductType } from '../types'

const PROFILES = [
  { value: 'perfume', label: 'Parfum', hint: 'Vendu au millilitre (décants) et en flacon complet. Notes de tête, de cœur et de fond, « inspiré de ».' },
  { value: 'standard', label: 'Standard', hint: 'Des options comptées à la pièce : une taille, une teinte, un lot. Pour le maquillage, les montres, les lunettes, les bijoux…' },
] as const

interface FormState {
  name: string
  profile: 'perfume' | 'standard'
  uses_gender: boolean
}

/** The shop's product types ("rayons"): Parfums, Cosmétiques, Montres, Lunettes... Each has its own families, products, packs, stock and brands. */
export default function ProductTypes() {
  const query = useProductTypes()
  const save = useSaveProductType()
  const remove = useDeleteProductType()
  const [editing, setEditing] = useState<AdminProductType | 'new' | null>(null)
  const [form, setForm] = useState<FormState>({ name: '', profile: 'standard', uses_gender: false })
  const [deleting, setDeleting] = useState<AdminProductType | null>(null)

  const open = (item: AdminProductType | 'new') => {
    setEditing(item)
    setForm(item === 'new' ? { name: '', profile: 'standard', uses_gender: false } : { name: item.name, profile: item.profile, uses_gender: item.uses_gender })
  }

  const submit = () => {
    if (!form.name.trim()) return toast.error('Donnez un nom au type.')
    const editingExisting = editing !== 'new' && editing
    save.mutate(
      { id: editingExisting ? editing.id : undefined, name: form.name.trim(), uses_gender: form.uses_gender, ...(editingExisting ? {} : { profile: form.profile }) },
      { onSuccess: () => { toast.success('Enregistré.'); setEditing(null) }, onError: (e) => toast.error(apiError(e)) },
    )
  }

  const items = query.data ?? []
  const existing = editing !== null && editing !== 'new' ? editing : null

  return (
    <>
      <PageHeader
        title="Types de produits"
        description="Les rayons de votre magasin : parfums, cosmétiques, montres, lunettes… Chaque type a ses propres familles, produits, packs, stock et marques, et apparaît dans le menu de la boutique."
        actions={<Button className="h-10" onClick={() => open('new')}><Plus className="size-4" aria-hidden />Nouveau type</Button>}
      />

      {query.isError ? (
        <ErrorState onRetry={() => query.refetch()} />
      ) : query.isPending ? (
        <Loading />
      ) : items.length === 0 ? (
        <EmptyState title="Aucun type de produit" hint="Créez votre premier type, par exemple « Parfums »." />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-lg leading-tight">{it.name}</p>
                <p className="tnum text-sm text-muted-foreground">
                  <span className={cn('me-2 rounded-full px-2 py-0.5 text-xs', it.profile === 'perfume' ? 'bg-accent text-accent-foreground' : 'bg-secondary text-secondary-foreground')}>{it.profile === 'perfume' ? 'Parfum' : 'Standard'}</span>
                  {it.products_count} produit{it.products_count > 1 ? 's' : ''}, {it.categories_count} famille{it.categories_count > 1 ? 's' : ''} ou catégorie{it.categories_count > 1 ? 's' : ''}
                  {it.uses_gender && ', filtre Homme / Femme'}
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Switch checked={it.is_active} onCheckedChange={(v) => save.mutate({ id: it.id, is_active: v }, { onError: (e) => toast.error(apiError(e)) })} aria-label={`${it.name} visible dans la boutique`} />
                <span className="hidden sm:inline">{it.is_active ? 'Visible' : 'Masqué'}</span>
              </label>
              <button type="button" onClick={() => open(it)} className="flex size-10 items-center justify-center rounded-md hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring" aria-label={`Modifier ${it.name}`}><Pencil className="size-4" /></button>
              <button type="button" onClick={() => setDeleting(it)} className="flex size-10 items-center justify-center rounded-md text-muted-foreground hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring" aria-label={`Supprimer ${it.name}`}><Trash2 className="size-4" /></button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">{existing ? `Modifier « ${existing.name} »` : 'Nouveau type de produit'}</DialogTitle>
            <DialogDescription>Un type est un rayon de la boutique, avec son propre menu.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            <label className="block space-y-1">
              <span className="text-muted-foreground">Nom</span>
              <input autoFocus className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Montres" />
            </label>

            <fieldset className="space-y-2" disabled={!!existing && existing.products_count > 0}>
              <legend className="mb-1 text-muted-foreground">Comment se vendent ses produits ?</legend>
              {PROFILES.map((p) => (
                <label key={p.value} className={cn('flex cursor-pointer gap-3 rounded-md border p-3', form.profile === p.value ? 'border-primary bg-accent/50' : 'border-input', existing && existing.products_count > 0 && 'cursor-not-allowed opacity-60')}>
                  <input type="radio" name="profile" className="mt-1 accent-[var(--primary)]" checked={form.profile === p.value} onChange={() => setForm({ ...form, profile: p.value, uses_gender: p.value === 'perfume' ? true : form.uses_gender })} />
                  <span><span className="block font-medium">{p.label}</span><span className="text-muted-foreground">{p.hint}</span></span>
                </label>
              ))}
              {existing && existing.products_count > 0 && <p className="text-xs text-muted-foreground">Ce type contient déjà des produits : on ne peut plus changer cela.</p>}
            </fieldset>

            <label className="flex items-center justify-between gap-3">
              <span>Filtre « Pour qui » (Homme, Femme, Mixte)<span className="block text-muted-foreground">Utile pour les parfums, les montres, les lunettes.</span></span>
              <Switch checked={form.uses_gender} onCheckedChange={(v) => setForm({ ...form, uses_gender: v })} />
            </label>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" className="h-10" onClick={() => setEditing(null)}>Annuler</Button>
            <Button className="h-10" onClick={submit} disabled={save.isPending}>{save.isPending ? 'Un instant…' : 'Enregistrer'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Supprimer « ${deleting?.name} » ?`}
        description={deleting && deleting.products_count > 0 ? 'Ce type contient encore des produits : la suppression sera refusée. Masquez-le plutôt.' : deleting && deleting.categories_count > 0 ? 'Ses familles ou catégories (vides) seront supprimées avec lui.' : undefined}
        confirmLabel="Supprimer"
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => { toast.success('Supprimé.'); setDeleting(null) }, onError: (e) => { toast.error(apiError(e)); setDeleting(null) } })}
      />
    </>
  )
}
