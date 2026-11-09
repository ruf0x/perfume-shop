import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { ConfirmDialog, EmptyState, ErrorState, Loading, PageHeader, inputClass } from '../components/common'
import { apiError } from '../lib'
import { useDeleteTaxon, useProductTypes, useSaveTaxon, useTaxa, type TaxonKind } from '../queries'
import type { Taxon } from '../types'

const TEXT = {
  types: {
    title: 'Familles et marques',
    description: 'Les familles classent les produits dans chaque type (designer, niche… pour les parfums). Les marques sont rangées dans leurs familles : cliquez une marque pour la voir ou la modifier.',
    one: 'famille ou catégorie',
    add: 'Nouvelle famille ou catégorie',
    placeholder: 'Oud prestige',
  },
  brands: { title: 'Marques', description: 'Chaque marque est rangée dans les types où elle est vendue (Armani : parfums et montres).', one: 'marque', add: 'Nouvelle marque', placeholder: 'Rasasi' },
}

/**
 * One screen for both lists. Families / categories belong to one product type and are shown under it;
 * brands are sold in one or several product types.
 */
export default function Taxonomy({ kind }: { kind: TaxonKind }) {
  const t = TEXT[kind]
  const query = useTaxa(kind)
  const navigate = useNavigate()
  // Brands sit under the families they belong to, on the same page.
  const brandList = useTaxa('brands').data ?? []
  const productTypes = useProductTypes()
  // Brands are also in families (Designer, Niche...): the families are the category rows.
  const families = useTaxa('types')
  const save = useSaveTaxon(kind)
  const remove = useDeleteTaxon(kind)
  const [editing, setEditing] = useState<Taxon | 'new' | null>(null)
  const [name, setName] = useState('')
  const [typeIds, setTypeIds] = useState<number[]>([])
  const [familyIds, setFamilyIds] = useState<number[]>([])
  const [deleting, setDeleting] = useState<Taxon | null>(null)

  const types = productTypes.data ?? []
  const typeName = (id?: number) => types.find((x) => x.id === id)?.name ?? '—'

  const open = (item: Taxon | 'new') => {
    setEditing(item)
    setName(item === 'new' ? '' : item.name)
    // A category has exactly one type; a brand any number of them. A new item starts in the first type.
    setTypeIds(item === 'new' ? (types[0] ? [types[0].id] : []) : kind === 'types' ? (item.product_type_id ? [item.product_type_id] : []) : (item.product_type_ids ?? []))
    setFamilyIds(item === 'new' || kind !== 'brands' ? [] : (item.perfume_type_ids ?? []))
  }

  const toggleFamily = (id: number) => setFamilyIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  const toggleType = (id: number) => setTypeIds((ids) => (kind === 'types' ? [id] : ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  const submit = () => {
    if (!name.trim()) return toast.error('Donnez un nom.')
    if (kind === 'types' && typeIds.length === 0) return toast.error('Choisissez le type de produit.')
    const link = kind === 'types' ? { product_type_id: typeIds[0] } : kind === 'brands' ? { product_type_ids: typeIds, perfume_type_ids: familyIds } : { product_type_ids: typeIds }

    save.mutate(
      { id: editing !== 'new' && editing ? editing.id : undefined, name: name.trim(), ...link },
      { onSuccess: () => { toast.success('Enregistré.'); setEditing(null) }, onError: (e) => toast.error(apiError(e)) },
    )
  }

  const items = query.data ?? []
  // Categories are listed under their product type; brands in one alphabetical list.
  const groups = kind === 'types' ? types.map((pt) => ({ id: pt.id, title: pt.name, items: items.filter((it) => it.product_type_id === pt.id) })).filter((g) => g.items.length > 0) : [{ id: 0, title: '', items }]

  const brandsOf = (familyId: number) => brandList.filter((b) => b.perfume_type_ids?.includes(familyId))
  const noFamilyBrands = (typeId: number) => brandList.filter((b) => b.product_type_ids?.includes(typeId) && !items.some((f) => f.product_type_id === typeId && b.perfume_type_ids?.includes(f.id)))
  const brandChip = (b: Taxon) => <Link key={b.id} to={`/admin/marques/${b.id}`} className="rounded-full border border-input px-2.5 py-0.5 text-xs hover:border-primary">{b.name}</Link>

  const row = (it: Taxon) => (
    <li key={it.id} className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{it.name}</p>
        <p className="tnum text-sm text-muted-foreground">
          {it.products_count} produit{it.products_count > 1 ? 's' : ''}
          {kind === 'brands' && it.product_type_ids && it.product_type_ids.length > 0 && <span>, {it.product_type_ids.map((id) => typeName(id)).join(', ')}</span>}
          {kind === 'brands' && it.families && it.families.length > 0 && <span>, {it.families.join(', ')}</span>}
        </p>
        {kind === 'types' && brandsOf(it.id).length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{brandsOf(it.id).map(brandChip)}</div>}
      </div>
      {kind === 'types' && (
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={it.is_active !== false} onCheckedChange={(v) => save.mutate({ id: it.id, is_active: v }, { onError: (e) => toast.error(apiError(e)) })} aria-label={`${it.name} visible`} />
          <span className="hidden sm:inline">{it.is_active !== false ? 'Visible' : 'Masquée'}</span>
        </label>
      )}
      <button type="button" onClick={() => open(it)} className="flex size-10 items-center justify-center rounded-md hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring" aria-label={`Modifier ${it.name}`}><Pencil className="size-4" /></button>
      <button type="button" onClick={() => setDeleting(it)} className="flex size-10 items-center justify-center rounded-md text-muted-foreground hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring" aria-label={`Supprimer ${it.name}`}><Trash2 className="size-4" /></button>
    </li>
  )

  return (
    <>
      <PageHeader title={t.title} description={t.description} actions={<div className="flex flex-wrap gap-2">{kind === 'types' && <Button variant="outline" className="h-10" onClick={() => navigate('/admin/marques/nouvelle')}><Plus className="size-4" aria-hidden />Nouvelle marque</Button>}<Button className="h-10" onClick={() => open('new')}><Plus className="size-4" aria-hidden />{t.add}</Button></div>} />

      {query.isError ? (
        <ErrorState onRetry={() => query.refetch()} />
      ) : query.isPending ? (
        <Loading />
      ) : items.length === 0 ? (
        <EmptyState title={`Aucune ${t.one}`} />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.id} aria-label={g.title || undefined}>
              {g.title && <h2 className="mb-2 font-display text-xl">{g.title}</h2>}
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">{g.items.map(row)}</ul>
              {kind === 'types' && noFamilyBrands(g.id).length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Marques sans famille</p>
                  <div className="flex flex-wrap gap-1.5">{noFamilyBrands(g.id).map(brandChip)}</div>
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">{editing === 'new' ? t.add : `Modifier « ${editing?.name} »`}</DialogTitle>
            <DialogDescription className="sr-only">Nom de la {t.one}</DialogDescription>
          </DialogHeader>

          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">Nom</span>
            <input autoFocus className={inputClass} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder={t.placeholder} />
          </label>

          {types.length > 0 && (
            <fieldset className="space-y-1.5 text-sm">
              <legend className="mb-1 text-muted-foreground">{kind === 'types' ? 'Dans quel type de produit ?' : 'Vendue dans quels types ?'}</legend>
              {types.map((pt) => (
                <label key={pt.id} className="flex cursor-pointer items-center gap-2.5 rounded-md border border-input px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-accent/50">
                  <input
                    type={kind === 'types' ? 'radio' : 'checkbox'}
                    name="product-type"
                    className="accent-[var(--primary)]"
                    checked={typeIds.includes(pt.id)}
                    onChange={() => toggleType(pt.id)}
                    disabled={kind === 'types' && editing !== 'new' && !!editing && editing.products_count > 0}
                  />
                  {pt.name}
                </label>
              ))}
              {kind === 'types' && editing !== 'new' && !!editing && editing.products_count > 0 && <p className="text-xs text-muted-foreground">Des produits l'utilisent : on ne peut pas la déplacer dans un autre type.</p>}
            </fieldset>
          )}

          {kind === 'brands' && families.data && families.data.length > 0 && (
            <fieldset className="space-y-1.5 text-sm">
              <legend className="mb-1 text-muted-foreground">Dans quelles familles ?</legend>
              {families.data.map((fam) => (
                <label key={fam.id} className="flex cursor-pointer items-center gap-2.5 rounded-md border border-input px-3 py-2 has-[:checked]:border-primary has-[:checked]:bg-accent/50">
                  <input type="checkbox" className="accent-[var(--primary)]" checked={familyIds.includes(fam.id)} onChange={() => toggleFamily(fam.id)} />
                  {fam.name} <span className="text-xs text-muted-foreground">({typeName(fam.product_type_id)})</span>
                </label>
              ))}
            </fieldset>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" className="h-10" onClick={() => setEditing(null)}>Annuler</Button>
            <Button className="h-10" onClick={submit} disabled={save.isPending}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Supprimer « ${deleting?.name} » ?`}
        description={deleting && deleting.products_count > 0 ? `${deleting.products_count} produit(s) l'utilisent : la suppression sera refusée.${kind === 'types' ? ' Masquez-la plutôt.' : ''}` : undefined}
        confirmLabel="Supprimer"
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => { toast.success('Supprimé.'); setDeleting(null) }, onError: (e) => { toast.error(apiError(e)); setDeleting(null) } })}
      />
    </>
  )
}
