import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog, ErrorState, Loading, PageHeader, inputClass } from '../components/common'
import { apiError } from '../lib'
import { useBrand, useDeleteTaxon, useProductTypes, useSaveTaxon, useTaxa } from '../queries'
import type { BrandDetail } from '../types'

/** One brand on a full page: its name, the types it is sold in, its families, and the products that use it. */
export default function BrandPage() {
  const { id } = useParams()
  const brandId = id ? Number(id) : null
  const query = useBrand(brandId)

  if (brandId === null) return <BrandForm key="new" />
  if (query.isError) return <ErrorState onRetry={() => query.refetch()} />
  if (query.isPending || !query.data) return <Loading />
  return <BrandForm key={query.data.id} brand={query.data} />
}

function BrandForm({ brand }: { brand?: BrandDetail }) {
  const navigate = useNavigate()
  const types = useProductTypes()
  const families = useTaxa('types')
  const save = useSaveTaxon('brands')
  const remove = useDeleteTaxon('brands')
  const [name, setName] = useState(brand?.name ?? '')
  const [typeIds, setTypeIds] = useState<number[]>(brand?.product_type_ids ?? [])
  const [familyIds, setFamilyIds] = useState<number[]>(brand?.perfume_type_ids ?? [])
  const [deleting, setDeleting] = useState(false)

  const toggle = (list: number[], set: (v: number[]) => void, id: number) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  const submit = () => {
    if (!name.trim()) return toast.error('Donnez un nom à la marque.')
    save.mutate(
      { id: brand?.id, name: name.trim(), product_type_ids: typeIds, perfume_type_ids: familyIds },
      { onSuccess: () => { toast.success('Marque enregistrée.'); navigate('/admin/marques') }, onError: (e) => toast.error(apiError(e)) },
    )
  }

  const confirmDelete = () => {
    if (!brand) return
    remove.mutate(brand.id, { onSuccess: () => { toast.success('Marque supprimée.'); navigate('/admin/marques') }, onError: (e) => { toast.error(apiError(e)); setDeleting(false) } })
  }

  const typeList = types.data ?? []
  const familyList = families.data ?? []

  return (
    <>
      <PageHeader
        title={brand ? brand.name : 'Nouvelle marque'}
        description={brand ? `${brand.products_count} produit${brand.products_count > 1 ? 's' : ''} de cette marque` : 'Choisissez les types et les familles : la marque apparaît ensuite dans le formulaire des produits.'}
        actions={<Link to="/admin/marques" className="text-sm underline underline-offset-4">Retour aux marques</Link>}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="min-w-0 max-w-3xl space-y-6">
        <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">Nom</span>
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Rasasi" />
          </label>
        </section>

        <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
          <h2 className="font-display text-xl">Types de produit</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {typeList.map((pt) => (
              <label key={pt.id} className="flex cursor-pointer items-center gap-2.5 rounded-md border border-input px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent/50">
                <input type="checkbox" className="accent-[var(--primary)]" checked={typeIds.includes(pt.id)} onChange={() => toggle(typeIds, setTypeIds, pt.id)} />
                {pt.name}
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <h2 className="font-display text-xl">Familles</h2>
          {typeList.map((pt) => {
            const fams = familyList.filter((f) => f.product_type_id === pt.id)
            if (fams.length === 0) return null
            return (
              <div key={pt.id} className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">{pt.name}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {fams.map((f) => (
                    <label key={f.id} className="flex cursor-pointer items-center gap-2.5 rounded-md border border-input px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent/50">
                      <input type="checkbox" className="accent-[var(--primary)]" checked={familyIds.includes(f.id)} onChange={() => toggle(familyIds, setFamilyIds, f.id)} />
                      {f.name}
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
        </section>

        {brand && (
          <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-xl">Produits de cette marque</h2>
            {brand.products.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun produit pour le moment.</p>
            ) : (
              <ul className="divide-y divide-border">
                {brand.products.map((p) => (
                  <li key={p.id}>
                    <Link to={`/admin/produits/${p.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:underline">
                      <span className="min-w-0 truncate font-medium">{p.name}</span>
                      <span className="shrink-0 text-muted-foreground">{p.type ?? ''}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        </div>

        <aside className="space-y-3 lg:sticky lg:top-6 lg:self-start">
          <Button className="h-11 w-full" onClick={submit} disabled={save.isPending}>{save.isPending ? 'Enregistrement…' : 'Enregistrer'}</Button>
          {brand && (
            <Button variant="outline" className="h-11 w-full text-destructive" onClick={() => setDeleting(true)}>Supprimer la marque</Button>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={deleting}
        onOpenChange={(o) => !o && setDeleting(false)}
        title={`Supprimer « ${brand?.name ?? ''} » ?`}
        description="Impossible si des produits utilisent cette marque : retirez-la d'abord de ces produits."
        confirmLabel="Supprimer"
        destructive
        loading={remove.isPending}
        onConfirm={confirmDelete}
      />
    </>
  )
}
