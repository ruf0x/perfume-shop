import { ArrowDown, ArrowUp, ImagePlus, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { QtyStepper } from '@/shop/components/QtyStepper'
import { formatPrice } from '@/shop/format'
import { api } from '@/lib/api'
import { prepareImage } from '../imagePrep'
import { PhotoCrop } from '../components/PhotoCrop'
import { useIsOwner } from '../auth'
import { ConfirmDialog, ErrorState, Loading, PageHeader, inputClass } from '../components/common'
import { VariantPicker } from '../components/VariantPicker'
import { apiError, fieldErrors } from '../lib'
import { useAdminProduct, useDeleteProduct, useProductImages, useProductTypes, useSaveProduct, useTaxa } from '../queries'
import type { AdminKind, AdminProduct, ProductTypeRef, StockMode } from '../types'

interface Row {
  key: string
  id?: number
  label: string
  ml: string
  price: string
  compare: string
  cost: string
  /** Gain on the purchase price, in percent: typed here, or worked out from price and cost. */
  gain: string
  mode: Exclude<StockMode, 'pack'>
  active: boolean
  stock_qty: number
}

interface Component {
  variant_id: number
  product: string
  label: string
  quantity: number
  cost: number | null
}

interface FormState {
  name: string
  /** Packs only: the product type the pack is shown under (empty = none). */
  rayon_id: string
  type_id: string
  brand_id: string
  gender: string
  inspired_by: string
  short_description: string
  description: string
  notes_top: string
  notes_heart: string
  notes_base: string
  is_active: boolean
  is_featured: boolean
  variants: Row[]
  packPrice: string
  packCompare: string
  components: Component[]
  packGain: string
}

const PRESETS: { label: string; ml: number; mode: Row['mode'] }[] = [
  { label: '10 ml', ml: 10, mode: 'pool' },
  { label: '20 ml', ml: 20, mode: 'pool' },
  { label: '30 ml', ml: 30, mode: 'pool' },
  { label: 'Flacon complet 100 ml', ml: 100, mode: 'unit' },
  { label: 'Flacon complet 150 ml', ml: 150, mode: 'unit' },
]

/** Gain on the purchase price, in percent: 20 means selling at cost + 20 %. */
const gainOf = (price: number, cost: number) => (cost > 0 ? ((price - cost) / cost) * 100 : null)
const pct = (v: number) => `${v > 0 ? '+' : ''}${(Math.round(v * 10) / 10).toString().replace('.', ',')} %`
/** A price rounded up to the next 50 DA, so that the suggested prices look like real prices. */
const roundUp50 = (v: number) => Math.ceil(v / 50) * 50

/** The gain shown for a price and a cost typed as text ('' when either is missing). */
const derivedGain = (price: string, cost: string) => {
  const g = price !== '' && Number(cost) > 0 ? gainOf(Number(price), Number(cost)) : null

  return g === null ? '' : String(Math.round(g * 10) / 10)
}
/** The price that gives a gain on a cost, to the dinar. */
const priceFor = (cost: number, gain: number) => Math.round(cost * (1 + gain / 100))

let seq = 0
const newKey = () => `row-${++seq}`

function fromProduct(p?: AdminProduct): FormState {
  const pack = p?.kind === 'pack' ? p.variants?.[0] : undefined
  return {
    name: p?.name ?? '',
    rayon_id: p?.kind === 'pack' && p.product_type?.id ? String(p.product_type.id) : '',
    type_id: p?.type?.id ? String(p.type.id) : '',
    brand_id: p?.brand?.id ? String(p.brand.id) : '',
    gender: p?.gender ?? '',
    inspired_by: p?.inspired_by ?? '',
    short_description: p?.short_description ?? '',
    description: p?.description ?? '',
    notes_top: p?.notes_top ?? '',
    notes_heart: p?.notes_heart ?? '',
    notes_base: p?.notes_base ?? '',
    is_active: p?.is_active ?? true,
    is_featured: p?.is_featured ?? false,
    variants: p && p.kind !== 'pack' ? (p.variants ?? []).map((v) => ({ key: newKey(), id: v.id, label: v.label, ml: String(v.ml ?? ''), price: String(v.price), compare: v.compare_at_price ? String(v.compare_at_price) : '', cost: v.cost_price !== null && v.cost_price !== undefined ? String(v.cost_price) : '', gain: derivedGain(String(v.price), v.cost_price != null ? String(v.cost_price) : ''), mode: v.stock_mode === 'unit' ? 'unit' : 'pool', active: v.is_active, stock_qty: v.stock_qty })) : [],
    packPrice: pack ? String(pack.price) : '',
    packGain: pack && pack.cost_price ? derivedGain(String(pack.price), String(pack.cost_price)) : '',
    packCompare: pack?.compare_at_price ? String(pack.compare_at_price) : '',
    components: pack?.components?.map((c) => ({ variant_id: c.variant_id, product: c.product, label: c.label, quantity: c.quantity, cost: c.cost_price })) ?? [],
  }
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-5">
      <div>
        <h2 className="font-display text-xl">{title}</h2>
        {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

const Field = ({ label, error, className, children }: { label: string; error?: string; className?: string; children: ReactNode }) => (
  <label className={cn('block space-y-1 text-sm', className)}>
    <span className="text-muted-foreground">{label}</span>
    {children}
    {error && <span role="alert" className="block text-destructive">{error}</span>}
  </label>
)

function Photos({ product, disabled }: { product: AdminProduct; disabled: boolean }) {
  const { upload, remove, reorder } = useProductImages(product.id)
  const input = useRef<HTMLInputElement>(null)
  const images = product.images ?? []

  const move = (i: number, delta: number) => {
    const ids = images.map((x) => x.id)
    ;[ids[i], ids[i + delta]] = [ids[i + delta], ids[i]]
    reorder.mutate(ids, { onError: (e) => toast.error(apiError(e)) })
  }

  const [queue, setQueue] = useState<File[]>([])
  const sendCropped = (cropped: File) => {
    setQueue((q) => q.slice(1))
    upload.mutate(cropped, { onError: (e) => toast.error(`${cropped.name} : ${apiError(e)}`) })
  }

  return (
    <Section title="Photos" hint="La première photo est celle de la boutique. Jpg, png ou webp, 5 Mo maximum.">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {images.map((img, i) => (
          <li key={img.id} className="space-y-1.5">
            <div className="relative aspect-square overflow-hidden rounded-md bg-secondary">
              <img src={img.url} alt={`Photo ${i + 1} de ${product.name}`} className="size-full object-cover" loading="lazy" />
              {i === 0 && <span className="absolute top-2 start-2 rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground">Principale</span>}
            </div>
            {!disabled && (
              <div className="flex items-center justify-between">
                <span className="flex">
                  <button type="button" disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)} className="flex size-9 items-center justify-center rounded hover:bg-secondary disabled:opacity-30" aria-label="Avancer"><ArrowUp className="size-4 -rotate-90" /></button>
                  <button type="button" disabled={i === images.length - 1 || reorder.isPending} onClick={() => move(i, 1)} className="flex size-9 items-center justify-center rounded hover:bg-secondary disabled:opacity-30" aria-label="Reculer"><ArrowDown className="size-4 -rotate-90" /></button>
                </span>
                <button type="button" onClick={() => remove.mutate(img.id, { onError: (e) => toast.error(apiError(e)) })} className="flex size-9 items-center justify-center rounded text-muted-foreground hover:text-destructive" aria-label="Supprimer la photo"><Trash2 className="size-4" /></button>
              </div>
            )}
          </li>
        ))}
        {!disabled && (
          <li>
            <button type="button" onClick={() => input.current?.click()} disabled={upload.isPending} className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-input text-sm text-muted-foreground hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">
              <ImagePlus className="size-6" aria-hidden />
              {upload.isPending ? 'Envoi…' : 'Ajouter'}
            </button>
          </li>
        )}
      </ul>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { setQueue((q) => [...q, ...Array.from(e.target.files ?? [])]); e.target.value = '' }} />
      {queue[0] && <PhotoCrop key={queue.length + queue[0].name} file={queue[0]} onDone={sendCropped} onCancel={() => setQueue((q) => q.slice(1))} />}
    </Section>
  )
}

/** Photos chosen before the perfume exists: they are uploaded right after it is saved. */
function NewPhotos({ files, onChange, disabled }: { files: File[]; onChange: (files: File[]) => void; disabled: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [queue, setQueue] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f))
    setPreviews(urls)
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [files])

  return (
    <Section title="Photos" hint="Choisissez les photos maintenant : elles seront envoyées dès l'enregistrement. La première est la photo principale.">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {files.map((file, i) => (
          <li key={`${file.name}-${i}`} className="space-y-1.5">
            <div className="relative aspect-square overflow-hidden rounded-md bg-secondary">
              <img src={previews[i]} alt={file.name} className="size-full object-cover" />
              {i === 0 && <span className="absolute top-2 start-2 rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground">Principale</span>}
            </div>
            {!disabled && (
              <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} className="flex h-9 w-full items-center justify-center gap-1.5 rounded text-sm text-muted-foreground hover:text-destructive">
                <Trash2 className="size-4" aria-hidden />
                Retirer
              </button>
            )}
          </li>
        ))}
        {!disabled && (
          <li>
            <button type="button" onClick={() => input.current?.click()} className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-input text-sm text-muted-foreground hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-ring">
              <ImagePlus className="size-6" aria-hidden />
              Ajouter
            </button>
          </li>
        )}
      </ul>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { setQueue((q) => [...q, ...Array.from(e.target.files ?? [])]); e.target.value = '' }} />
      {queue[0] && (
        <PhotoCrop
          key={queue.length + queue[0].name}
          file={queue[0]}
          onDone={(cropped) => { onChange([...files, cropped]); setQueue((q) => q.slice(1)) }}
          onCancel={() => setQueue((q) => q.slice(1))}
        />
      )}
    </Section>
  )
}

/** `type` is the product type the product lives in (not used for packs, which may sit under one). */
function FormBody({ kind, product, type }: { kind: AdminKind; product?: AdminProduct; type?: ProductTypeRef | null }) {
  const isPack = kind === 'pack'
  const isCosmetic = kind === 'standard' // options counted in pieces (cosmetics, watches, glasses...)
  const usesGender = !!type?.uses_gender
  const noun = isPack ? 'Pack' : 'Produit'
  const productTypes = useProductTypes()
  const owner = useIsOwner()
  const navigate = useNavigate()
  const save = useSaveProduct()
  const del = useDeleteProduct()
  const types = useTaxa('types')
  const brands = useTaxa('brands')
  const [f, setF] = useState(() => fromProduct(product))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [picker, setPicker] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const base = isPack ? '/admin/packs' : '/admin/produits'
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }))
  const err = (k: string) => errors[k]

  // Price, cost and gain depend on each other: change one and the others follow (the gain wins when it is the one typed).
  const withGain = (r: Row, patch: Partial<Row>): Row => {
    const next = { ...r, ...patch }
    if ('gain' in patch) return next.gain !== '' && Number(next.cost) > 0 && Number(next.gain) >= 0 ? { ...next, price: String(priceFor(Number(next.cost), Number(next.gain))) } : next
    if ('price' in patch || 'cost' in patch) return { ...next, gain: derivedGain(next.price, next.cost) }

    return next
  }
  const setRow = (i: number, patch: Partial<Row>) => set('variants', f.variants.map((r, j) => (j === i ? withGain(r, patch) : r)))
  const addRow = (p?: (typeof PRESETS)[number]) => set('variants', [...f.variants, { key: newKey(), label: p?.label ?? '', ml: p ? String(p.ml) : '', price: '', compare: '', cost: '', gain: '', mode: p?.mode ?? (isCosmetic ? 'unit' : 'pool'), active: true, stock_qty: 0 }])
  // Purchase helper (not saved): the gain wanted on every size.
  const [wantedGain, setWantedGain] = useState('')
  const packCost = f.components.length > 0 && f.components.every((c) => c.cost !== null) ? f.components.reduce((n, c) => n + (c.cost ?? 0) * c.quantity, 0) : null
  const setPackPrice = (v: string) => setF((s) => ({ ...s, packPrice: v, packGain: packCost && v !== '' ? derivedGain(v, String(packCost)) : s.packGain }))
  const setPackGain = (v: string) => setF((s) => ({ ...s, packGain: v, packPrice: packCost && v !== '' && Number(v) >= 0 ? String(priceFor(packCost, Number(v))) : s.packPrice }))
  const applyWantedGain = () => Number(wantedGain) >= 0 && wantedGain !== '' && set('variants', f.variants.map((r) => (r.cost !== '' && Number(r.cost) > 0 ? withGain(r, { price: String(roundUp50(Number(r.cost) * (1 + Number(wantedGain) / 100))) }) : r)))
  const moveRow = (i: number, d: number) => {
    const rows = [...f.variants]
    ;[rows[i], rows[i + d]] = [rows[i + d], rows[i]]
    set('variants', rows)
  }

  const payload = () => {
    const n = (v: string) => (v.trim() === '' ? null : Number(v))
    const common = {
      name: f.name.trim(),
      product_type_id: isPack ? n(f.rayon_id) : type?.id,
      brand_id: isPack ? null : n(f.brand_id),
      perfume_type_id: isPack ? null : n(f.type_id),
      gender: usesGender ? f.gender || null : null,
      inspired_by: isCosmetic ? null : f.inspired_by.trim() || null,
      short_description: f.short_description.trim() || null,
      description: f.description.trim() || null,
      notes_top: isCosmetic ? null : f.notes_top.trim() || null,
      notes_heart: isCosmetic ? null : f.notes_heart.trim() || null,
      notes_base: isCosmetic ? null : f.notes_base.trim() || null,
      is_active: f.is_active,
      is_featured: f.is_featured,
    }
    if (isPack) {
      return { ...common, ...(product ? {} : { kind: 'pack' }), pack: { price: Number(f.packPrice), compare_at_price: n(f.packCompare), components: f.components.map((c) => ({ variant_id: c.variant_id, quantity: c.quantity })) } }
    }
    return {
      ...common,
      variants: f.variants.map((r, i) => ({ id: r.id, label: r.label.trim(), ml: n(r.ml), price: Number(r.price), compare_at_price: n(r.compare), cost_price: n(r.cost), stock_mode: r.mode, is_active: r.active, sort_order: i })),
    }
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (!f.name.trim()) e.name = 'Le nom est obligatoire.'
    if (isPack) {
      if (f.packPrice === '' || Number(f.packPrice) < 0) e['pack.price'] = 'Indiquez le prix du pack.'
      if (f.components.length === 0) e['pack.components'] = 'Ajoutez au moins un produit au pack.'
    } else {
      if (f.variants.length === 0) e.variants = isCosmetic ? 'Ajoutez au moins une option.' : 'Ajoutez au moins une taille.'
      f.variants.forEach((r, i) => {
        if (!r.label.trim()) e[`variants.${i}.label`] = isCosmetic ? "Nom de l'option ?" : 'Nom de la taille ?'
        // A perfume always has a volume; a cosmetic only when it is sold by the millilitre.
        if ((!isCosmetic || r.mode === 'pool') && !(Number(r.ml) > 0)) e[`variants.${i}.ml`] = 'Contenance en ml ?'
        if (r.price === '' || Number(r.price) < 0) e[`variants.${i}.price`] = 'Prix ?'
      })
    }
    return e
  }

  const submit = (ev: FormEvent) => {
    ev.preventDefault()
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length) return toast.error('Corrigez les champs en rouge.')

    save.mutate(
      { id: product?.id, ...payload() },
      {
        onSuccess: async (saved) => {
          if (product) return toast.success('Modifications enregistrées.')

          // New perfume: send the photos chosen in the form, then open its page.
          let failed = 0
          for (const file of pendingFiles) {
            const form = new FormData()
            try {
              form.append('image', await prepareImage(file))
              await api.post(`/admin/products/${saved.id}/images`, form)
            } catch (e) {
              failed++
              toast.error(`${file.name} : ${apiError(e)}`)
            }
          }
          toast.success(failed ? `${noun} créé, mais ${failed} photo(s) non envoyée(s).` : `${noun} créé.`)
          navigate(`${base}/${saved.id}`, { replace: true })
        },
        onError: (e) => {
          setErrors(fieldErrors(e))
          toast.error(apiError(e))
        },
      },
    )
  }

  return (
    <form onSubmit={submit} noValidate>
      <PageHeader
        title={product ? product.name : isPack ? 'Nouveau pack' : `Nouveau produit : ${type?.name ?? ''}`}
        description={owner ? (product && !isPack && type ? `Type de produit : ${type.name}` : undefined) : 'Lecture seule : seul le propriétaire peut modifier le catalogue.'}
        actions={<Link to={base} className="text-sm underline underline-offset-4">Retour à la liste</Link>}
      />

      <fieldset disabled={!owner} className="grid min-w-0 gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="min-w-0 space-y-6">
          <Section title="Informations">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nom" error={err('name')} className="sm:col-span-2"><input className={inputClass} value={f.name} onChange={(e) => set('name', e.target.value)} aria-invalid={!!err('name')} /></Field>
              {isPack && (
                <Field label="Afficher dans le type" className="sm:col-span-2">
                  <select className={inputClass} value={f.rayon_id} onChange={(e) => set('rayon_id', e.target.value)}>
                    <option value="">Aucun (seulement dans « Packs »)</option>
                    {productTypes.data?.map((pt) => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
                  </select>
                </Field>
              )}
              {!isPack && (
                <>
                  <Field label={type?.profile === 'perfume' ? 'Famille' : 'Catégorie'}>
                    <select className={inputClass} value={f.type_id} onChange={(e) => set('type_id', e.target.value)}>
                      <option value="">Aucune</option>
                      {types.data?.filter((c) => c.product_type_id === type?.id && (c.is_active !== false || String(c.id) === f.type_id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Marque">
                    <select className={inputClass} value={f.brand_id} onChange={(e) => set('brand_id', e.target.value)}>
                      <option value="">Aucune</option>
                      <optgroup label={`Marques ${type?.name ?? ''}`}>{brands.data?.filter((b) => b.product_type_ids?.includes(type?.id ?? 0)).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</optgroup>
                      <optgroup label="Autres marques">{brands.data?.filter((b) => !b.product_type_ids?.includes(type?.id ?? 0)).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</optgroup>
                    </select>
                  </Field>
                  {usesGender && <Field label="Pour qui">
                    <select className={inputClass} value={f.gender} onChange={(e) => set('gender', e.target.value)}>
                      <option value="">Non précisé</option>
                      <option value="homme">Homme</option>
                      <option value="femme">Femme</option>
                      <option value="mixte">Mixte</option>
                    </select>
                  </Field>}
                  {kind === 'perfume' && <Field label="Inspiré de (pour un dupe)"><input className={inputClass} value={f.inspired_by} onChange={(e) => set('inspired_by', e.target.value)} placeholder="Dior Sauvage" /></Field>}
                </>
              )}
              <Field label="Phrase d'accroche" className="sm:col-span-2"><input className={inputClass} value={f.short_description} onChange={(e) => set('short_description', e.target.value)} maxLength={255} /></Field>
              <Field label="Description" className="sm:col-span-2"><Textarea rows={4} value={f.description} onChange={(e) => set('description', e.target.value)} className="text-sm" /></Field>
              {kind === 'perfume' && (
                <>
                  <Field label="Notes de tête"><input className={inputClass} value={f.notes_top} onChange={(e) => set('notes_top', e.target.value)} /></Field>
                  <Field label="Notes de cœur"><input className={inputClass} value={f.notes_heart} onChange={(e) => set('notes_heart', e.target.value)} /></Field>
                  <Field label="Notes de fond"><input className={inputClass} value={f.notes_base} onChange={(e) => set('notes_base', e.target.value)} /></Field>
                </>
              )}
            </div>
          </Section>

          {!isPack ? (
            <Section
              title={isCosmetic ? 'Options et prix' : 'Tailles et prix'}
              hint={isCosmetic ? "Chaque option (une taille, une teinte, un lot...) a son prix et son stock. « À l'unité » se compte en pièces ; « Au millilitre » est versé depuis le stock en ml du produit." : 'Chaque taille a son prix. « À décanter » est versé depuis le stock en ml du parfum ; « Flacon scellé » se compte en flacons.'}
            >
              {err('variants') && <p role="alert" className="text-sm text-destructive">{err('variants')}</p>}
              <div className="space-y-3 rounded-md bg-secondary/60 p-3 text-sm">
                <p className="font-medium">Bénéfice sur toutes les tailles <span className="font-normal text-muted-foreground">(facultatif, visible par vous seulement)</span></p>
                <div className="flex flex-wrap items-end gap-3">
                  <Field label="Bénéfice voulu (%)" className="w-36"><input type="number" min={0} inputMode="decimal" className={inputClass} value={wantedGain} onChange={(e) => setWantedGain(e.target.value)} placeholder="20" /></Field>
                  <Button type="button" variant="outline" className="h-10" disabled={wantedGain === '' || !f.variants.some((r) => Number(r.cost) > 0)} onClick={applyWantedGain}>Calculer les prix de vente</Button>
                  <p className="pb-2 text-muted-foreground">Prix de vente = prix d'achat + ce pourcentage, arrondi aux 50 DA supérieurs. Vous pouvez ensuite corriger chaque prix.</p>
                </div>
              </div>
              <ul className="space-y-3">
                {f.variants.map((r, i) => (
                  <li key={r.key} className="rounded-md border border-border p-3">
                    <div className="grid grid-cols-6 gap-3">
                      <Field label="Nom" error={err(`variants.${i}.label`)} className="col-span-6 sm:col-span-3"><input className={inputClass} value={r.label} onChange={(e) => setRow(i, { label: e.target.value })} placeholder={isCosmetic ? '250 ml, Rose nude, Boîte de 24' : '20 ml'} /></Field>
                      <Field label={isCosmetic && r.mode === 'unit' ? 'Contenance (ml), facultatif' : 'Contenance (ml)'} error={err(`variants.${i}.ml`)} className="col-span-2 sm:col-span-1"><input type="number" min={1} inputMode="numeric" className={inputClass} value={r.ml} onChange={(e) => setRow(i, { ml: e.target.value })} /></Field>
                      <Field label="Prix (DA)" error={err(`variants.${i}.price`)} className="col-span-2 sm:col-span-1"><input type="number" min={0} inputMode="numeric" className={inputClass} value={r.price} onChange={(e) => setRow(i, { price: e.target.value })} /></Field>
                      <Field label="Ancien prix" className="col-span-2 sm:col-span-1"><input type="number" min={0} inputMode="numeric" className={inputClass} value={r.compare} onChange={(e) => setRow(i, { compare: e.target.value })} placeholder="barré" /></Field>
                      <Field label="Prix d'achat (DA)" className="col-span-3 sm:col-span-1"><input type="number" min={0} inputMode="numeric" className={inputClass} value={r.cost} onChange={(e) => setRow(i, { cost: e.target.value })} /></Field>
                      <Field label="Bénéfice (%)" className="col-span-3 sm:col-span-1"><input type="number" min={0} step="0.1" inputMode="decimal" className={inputClass} value={r.gain} disabled={!(Number(r.cost) > 0)} onChange={(e) => setRow(i, { gain: e.target.value })} /></Field>
                      <Field label="Type de stock" className="col-span-6 sm:col-span-2">
                        <select className={inputClass} value={r.mode} onChange={(e) => setRow(i, { mode: e.target.value as Row['mode'] })} disabled={r.stock_qty > 0}>
                          {isCosmetic ? (
                            <>
                              <option value="unit">À l'unité (compté en pièces)</option>
                              <option value="pool">Au millilitre (stock en ml)</option>
                            </>
                          ) : (
                            <>
                              <option value="pool">À décanter (stock en ml)</option>
                              <option value="unit">Flacon scellé (compté en flacons)</option>
                            </>
                          )}
                        </select>
                      </Field>
                      <div className="col-span-6 flex items-end justify-between gap-2 sm:col-span-2">
                        <label className="flex items-center gap-2 pb-2 text-sm"><Switch checked={r.active} onCheckedChange={(v) => setRow(i, { active: v })} />Vendue</label>
                        <span className="flex">
                          <button type="button" disabled={i === 0} onClick={() => moveRow(i, -1)} className="flex size-10 items-center justify-center rounded hover:bg-secondary disabled:opacity-30" aria-label="Monter"><ArrowUp className="size-4" /></button>
                          <button type="button" disabled={i === f.variants.length - 1} onClick={() => moveRow(i, 1)} className="flex size-10 items-center justify-center rounded hover:bg-secondary disabled:opacity-30" aria-label="Descendre"><ArrowDown className="size-4" /></button>
                          <button type="button" onClick={() => set('variants', f.variants.filter((_, j) => j !== i))} className="flex size-10 items-center justify-center rounded text-muted-foreground hover:text-destructive" aria-label={isCosmetic ? 'Supprimer cette option' : 'Supprimer cette taille'}><Trash2 className="size-4" /></button>
                        </span>
                      </div>
                    </div>
                    {r.cost !== '' && r.price !== '' && Number(r.cost) >= 0 && (
                      <p className="tnum mt-2 text-sm">
                        Bénéfice : <strong className={Number(r.price) < Number(r.cost) ? 'text-destructive' : ''}>{formatPrice(Number(r.price) - Number(r.cost))}</strong>
                        {gainOf(Number(r.price), Number(r.cost)) !== null && <span className="text-muted-foreground">{` (${pct(gainOf(Number(r.price), Number(r.cost))!)} du prix d'achat)`}</span>}
                      </p>
                    )}
                    {r.id && r.mode === 'unit' && <p className="tnum mt-2 text-xs text-muted-foreground">{r.stock_qty} {isCosmetic ? 'article(s)' : 'flacon(s)'} en stock. Le stock se gère dans « Stock ».</p>}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                {!isCosmetic && PRESETS.filter((p) => !f.variants.some((r) => r.label === p.label)).map((p) => (
                  <Button key={p.label} type="button" variant="outline" className="h-9" onClick={() => addRow(p)}><Plus className="size-4" aria-hidden />{p.label}</Button>
                ))}
                <Button type="button" variant="outline" className="h-9" onClick={() => addRow()}><Plus className="size-4" aria-hidden />{isCosmetic ? 'Ajouter une option' : 'Autre taille'}</Button>
              </div>
            </Section>
          ) : (
            <Section title="Contenu et prix du pack" hint="Choisissez les produits (parfums, cosmétiques) et leurs tailles ou options qui composent le pack.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Prix du pack (DA)" error={err('pack.price')}><input type="number" min={0} inputMode="numeric" className={inputClass} value={f.packPrice} onChange={(e) => setPackPrice(e.target.value)} /></Field>
                <Field label="Ancien prix (barré)"><input type="number" min={0} inputMode="numeric" className={inputClass} value={f.packCompare} onChange={(e) => set('packCompare', e.target.value)} /></Field>
              </div>
              {packCost !== null ? (
                <div className="space-y-2 rounded-md bg-secondary/60 p-3 text-sm">
                  <div className="flex flex-wrap items-end gap-3">
                    <p className="tnum pb-2">{`Prix d'achat des produits : ${formatPrice(packCost)}.`}</p>
                    <Field label="Bénéfice (%)" className="w-32"><input type="number" min={0} step="0.1" inputMode="decimal" className={inputClass} value={f.packGain} onChange={(e) => setPackGain(e.target.value)} /></Field>
                  </div>
                  {f.packPrice !== '' && (
                    <p className="tnum">
                      Bénéfice : <strong className={Number(f.packPrice) < packCost ? 'text-destructive' : ''}>{formatPrice(Number(f.packPrice) - packCost)}</strong>
                      {gainOf(Number(f.packPrice), packCost) !== null && <span className="text-muted-foreground">{` (${pct(gainOf(Number(f.packPrice), packCost)!)} du prix d'achat)`}</span>}
                    </p>
                  )}
                </div>
              ) : f.components.length > 0 && <p className="text-sm text-muted-foreground">Le bénéfice du pack se calcule quand chaque produit du pack a un prix d'achat.</p>}
              {err('pack.components') && <p role="alert" className="text-sm text-destructive">{err('pack.components')}</p>}
              <ul className="divide-y divide-border rounded-md border border-border">
                {f.components.map((c, i) => (
                  <li key={c.variant_id} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0"><p className="truncate font-medium">{c.product}</p><p className="text-sm text-muted-foreground">{c.label}</p></div>
                    <div className="flex shrink-0 items-center gap-2">
                      <QtyStepper value={c.quantity} onChange={(q) => set('components', f.components.map((x, j) => (j === i ? { ...x, quantity: q } : x)))} />
                      <button type="button" onClick={() => set('components', f.components.filter((_, j) => j !== i))} className="flex size-10 items-center justify-center rounded text-muted-foreground hover:text-destructive" aria-label={`Retirer ${c.product}`}><Trash2 className="size-4" /></button>
                    </div>
                  </li>
                ))}
              </ul>
              <Button type="button" variant="outline" className="h-10" onClick={() => setPicker(true)}><Plus className="size-4" aria-hidden />Ajouter un produit</Button>
              <VariantPicker open={picker} onOpenChange={setPicker} title="Ajouter au pack" onPick={(v, p) => set('components', f.components.some((c) => c.variant_id === v.id) ? f.components.map((c) => (c.variant_id === v.id ? { ...c, quantity: c.quantity + 1 } : c)) : [...f.components, { variant_id: v.id, product: p.name, label: v.label, quantity: 1, cost: v.cost_price }])} />
            </Section>
          )}

          {product ? <Photos product={product} disabled={!owner} /> : <NewPhotos files={pendingFiles} onChange={setPendingFiles} disabled={!owner} />}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <Section title="Boutique">
            <label className="flex items-center justify-between gap-3 text-sm"><span>Visible dans la boutique<span className="block text-muted-foreground">Masquez sans supprimer.</span></span><Switch checked={f.is_active} onCheckedChange={(v) => set('is_active', v)} /></label>
            <label className="flex items-center justify-between gap-3 text-sm"><span>Mis en avant<span className="block text-muted-foreground">Affiché en premier.</span></span><Switch checked={f.is_featured} onCheckedChange={(v) => set('is_featured', v)} /></label>
            {product && product.is_active && !product.available && (
              <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
                {isPack ? "Un produit du pack est épuisé : le pack n'est pas proposé pour le moment." : <>Pas encore proposé aux clients : <Link to="/admin/stock" className="underline underline-offset-4">ajoutez du stock</Link>. Vous pouvez aussi montrer les produits épuisés dans les paramètres.</>}
              </p>
            )}
          </Section>
          {owner && (
            <div className="space-y-3">
              <Button type="submit" className="h-12 w-full text-base" disabled={save.isPending}>{save.isPending ? 'Enregistrement…' : product ? 'Enregistrer' : 'Créer'}</Button>
              {product && <Button type="button" variant="outline" className="h-10 w-full text-destructive" onClick={() => setConfirmDelete(true)}>Supprimer</Button>}
            </div>
          )}
        </aside>
      </fieldset>

      {product && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Supprimer « ${product.name} » ?`}
          description="Il disparaît de la boutique. Les anciennes commandes le gardent."
          confirmLabel="Supprimer"
          destructive
          loading={del.isPending}
          onConfirm={() => del.mutate(product.id, { onSuccess: () => { toast.success('Supprimé.'); navigate(base, { replace: true }) }, onError: (e) => { toast.error(apiError(e)); setConfirmDelete(false) } })}
        />
      )}
    </form>
  )
}

/**
 * New product: the product type comes from the address (?type=3), or `kind="pack"` from the route.
 * Existing product: its own kind and product type are used.
 */
export default function ProductForm({ kind }: { kind?: 'pack' }) {
  const { id } = useParams()
  const [search] = useSearchParams()
  const productId = id ? Number(id) : null
  const q = useAdminProduct(productId)
  const productTypes = useProductTypes()

  if (productId !== null) {
    if (q.isPending) return <Loading />
    if (q.isError || !q.data) return <ErrorState onRetry={() => q.refetch()} message="Produit introuvable." />
    return <FormBody key={productId} kind={q.data.kind} product={q.data} type={q.data.product_type} />
  }

  if (kind === 'pack') return <FormBody key="new-pack" kind="pack" />

  if (productTypes.isPending) return <Loading />
  const chosen = productTypes.data?.find((t) => String(t.id) === search.get('type'))
  if (!chosen) return <ErrorState message="Choisissez d'abord un type de produit depuis la liste des produits." />

  return <FormBody key={`new-${chosen.id}`} kind={chosen.profile} type={chosen} />
}
