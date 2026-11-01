import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { formatPrice } from '@/shop/format'
import { ProductVisual } from '@/shop/components/ProductVisual'
import { linkButton } from '@/shop/components/ui'
import { useIsOwner } from '../auth'
import { EmptyState, ErrorState, Loading, PageHeader, Pagination, inputClass } from '../components/common'
import { NewProductButton } from '../components/NewProduct'
import { apiError } from '../lib'
import { useAdminProducts, useProductTypes, useSaveProduct, useTaxa } from '../queries'
import type { AdminProduct } from '../types'
import { useDebounced } from '../useDebounced'

function Stock({ p }: { p: AdminProduct }) {
  if (p.kind === 'pack') return <span className="text-muted-foreground">{p.available ? 'Disponible' : 'Indisponible'}</span>
  const units = p.variants?.filter((v) => v.stock_mode === 'unit').reduce((n, v) => n + v.stock_qty, 0) ?? 0

  // A standard product is counted in pieces (and in ml only if it is sold by volume); a perfume in ml plus sealed bottles.
  if (p.kind === 'standard') {
    return (
      <span className="tnum">
        {units} en stock{p.stock_ml > 0 && <span className="text-muted-foreground">, {p.stock_ml} ml</span>}
      </span>
    )
  }
  return (
    <span className="tnum">
      {p.stock_ml} ml{units > 0 && <span className="text-muted-foreground">, {units} flacon{units > 1 ? 's' : ''}</span>}
    </span>
  )
}

const sizes = (p: AdminProduct) =>
  p.variants
    ?.filter((v) => v.is_active)
    .map((v) => `${v.label} ${formatPrice(v.price)}`)
    .join(', ')

/** `goods` = the products of every product type together (one catalogue); `pack` = packs. */
export default function Products({ kind }: { kind: 'goods' | 'pack' }) {
  const isPack = kind === 'pack'
  const owner = useIsOwner()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const types = useTaxa('types')
  const productTypes = useProductTypes()
  const save = useSaveProduct()

  const [search, setSearch] = useState(params.get('q') ?? '')
  const q = useDebounced(search)
  const typeId = Number(params.get('type')) || undefined
  const rayonId = Number(params.get('rayon')) || undefined
  const active = params.get('active') === '1' ? true : params.get('active') === '0' ? false : undefined
  const lowStock = params.get('low') === '1'
  const page = Number(params.get('page')) || 1

  const set = (patch: Record<string, string | undefined>) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k))
      if (!('page' in patch)) next.delete('page')
      return next
    }, { replace: true })
  useEffect(() => {
    if ((q || undefined) !== (params.get('q') || undefined)) set({ q: q || undefined })
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  const query = useAdminProducts({ q: params.get('q') || undefined, kind: isPack ? 'pack' : 'perfume,standard', product_type_id: rayonId, type_id: typeId, active, low_stock: lowStock, page })
  const items = query.data?.data ?? []
  const base = isPack ? '/admin/packs' : '/admin/produits'
  const noun = isPack ? 'pack' : 'produit'
  const visibleCategories = (types.data ?? []).filter((c) => !rayonId || c.product_type_id === rayonId)
  const showTypeBadge = (productTypes.data?.length ?? 0) > 1

  const toggle = (p: AdminProduct, value: boolean) =>
    save.mutate({ id: p.id, is_active: value }, { onSuccess: () => toast.success(value ? `${p.name} est visible dans la boutique.` : `${p.name} est masqué.`), onError: (e) => toast.error(apiError(e)) })

  return (
    <>
      <PageHeader
        title={isPack ? 'Packs' : 'Produits'}
        description={isPack ? 'Plusieurs produits, de n\'importe quel type, vendus ensemble à un prix unique.' : 'Tous vos produits, par type : leurs options et leurs prix.'}
        actions={owner && (isPack ? (
          <Link to={`${base}/nouveau`} className={linkButton('default', 'h-10')}><Plus className="size-4" aria-hidden />Nouveau pack</Link>
        ) : (
          <NewProductButton className="h-10" />
        ))}
      />

      <section aria-label="Filtres" className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <label className="col-span-2 space-y-1 text-sm">
          <span className="text-muted-foreground">Rechercher</span>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom ou marque" className={inputClass} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Type de produit</span>
          <select className={inputClass} value={rayonId ?? ''} onChange={(e) => set({ rayon: e.target.value, type: undefined })}>
            <option value="">Tous</option>
            {productTypes.data?.map((pt) => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
          </select>
        </label>
        {!isPack && (
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Famille ou catégorie</span>
            <select className={inputClass} value={typeId ?? ''} onChange={(e) => set({ type: e.target.value })}>
              <option value="">Toutes</option>
              {visibleCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Visibilité</span>
          <select className={inputClass} value={active === undefined ? '' : active ? '1' : '0'} onChange={(e) => set({ active: e.target.value })}>
            <option value="">Tous</option>
            <option value="1">Visibles</option>
            <option value="0">Masqués</option>
          </select>
        </label>
        {!isPack && (
          <label className="col-span-2 flex items-center gap-2 text-sm md:col-span-1 md:self-end md:pb-2.5">
            <input type="checkbox" checked={lowStock} onChange={(e) => set({ low: e.target.checked ? '1' : undefined })} className="size-4 accent-[var(--primary)]" />
            Stock faible seulement
          </label>
        )}
      </section>

      {query.isError ? (
        <ErrorState onRetry={() => query.refetch()} />
      ) : query.isPending ? (
        <Loading />
      ) : items.length === 0 ? (
        <EmptyState title={`Aucun ${noun}`} hint={params.toString() ? 'Aucun résultat avec ces filtres.' : `Créez votre premier ${noun} pour le voir dans la boutique.`} action={owner && !params.toString() ? (isPack ? <Link to={`${base}/nouveau`} className={linkButton()}>Créer un pack</Link> : <NewProductButton />) : undefined} />
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {items.map((p) => (
              <li key={p.id} className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
                <button type="button" onClick={() => navigate(`${base}/${p.id}`)} className="size-16 shrink-0 overflow-hidden rounded-md bg-secondary focus-visible:outline-2 focus-visible:outline-ring" aria-label={`Ouvrir ${p.name}`}>
                  <ProductVisual image={p.image} name="" type={p.type?.slug} rayon={p.product_type?.slug} level={0.7} />
                </button>
                <Link to={`${base}/${p.id}`} className="min-w-0 flex-1 focus-visible:outline-2 focus-visible:outline-ring">
                  <p className="truncate font-display text-lg leading-tight">{p.name}{showTypeBadge && p.product_type && <span className="ms-2 rounded-full bg-accent px-2 py-0.5 align-middle font-sans text-xs text-accent-foreground">{p.product_type.name}</span>}</p>
                  <p className="truncate text-sm text-muted-foreground">{[p.brand?.name, p.type?.name].filter(Boolean).join(', ') || (isPack ? 'Pack' : 'Sans classement')}</p>
                  <p className="tnum mt-0.5 hidden truncate text-sm sm:block">{sizes(p)}</p>
                </Link>
                <div className="hidden w-36 text-end text-sm md:block"><Stock p={p} /></div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Switch checked={p.is_active} disabled={!owner || save.isPending} onCheckedChange={(v) => toggle(p, v)} aria-label={`${p.name} visible dans la boutique`} />
                  <span className="text-xs text-muted-foreground">{p.is_active ? 'Visible' : 'Masqué'}</span>
                </div>
              </li>
            ))}
          </ul>
          <Pagination meta={query.data?.meta} onPage={(n) => set({ page: n === 1 ? undefined : String(n) })} />
        </>
      )}
    </>
  )
}
