import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useCart } from '@/stores/cart'
import { OptionPicker } from '../components/OptionPicker'
import { ProductVisual } from '../components/ProductVisual'
import { QtyStepper } from '../components/QtyStepper'
import { bigButton, linkButton } from '../components/ui'
import { VolumeGauge } from '../components/VolumeGauge'
import { formatPrice } from '../format'
import { useProduct } from '../queries'
import { useDocumentTitle } from '../useDocumentTitle'

/** Perfume, cosmetic and pack page (same layout; a pack has one price and a contents list instead of sizes). */
export default function ProductPage() {
  const { t } = useTranslation()
  const { slug } = useParams()
  const { data: product, isPending, isError } = useProduct(slug)
  const add = useCart((s) => s.add)
  const [added, setAdded] = useState<string | null>(null)

  // Perfume sizes go from small to large; a cosmetic keeps the order the owner gave (shades, sizes, lots...).
  const variants = useMemo(() => (product?.kind === 'standard' ? [...product.variants] : [...(product?.variants ?? [])].sort((a, b) => (a.ml ?? 1e9) - (b.ml ?? 1e9) || a.price - b.price)), [product])
  const [variantId, setVariantId] = useState<number | null>(null)
  const [qty, setQty] = useState(1)
  const [photo, setPhoto] = useState(0)

  // Start on the smallest size that is in stock.
  useEffect(() => {
    if (!product) return
    setVariantId((variants.find((v) => v.available) ?? variants[0])?.id ?? null)
    setQty(1)
    setPhoto(0)
  }, [product]) // eslint-disable-line react-hooks/exhaustive-deps

  useDocumentTitle(product?.name ?? (isError ? t('meta.notFound') : null), product?.short_description)

  if (isError) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <h1 className="text-4xl">{t('product.notFound')}</h1>
        <Link to="/boutique" className={linkButton('default', 'mt-8')}>
          {t('product.backToShop')}
        </Link>
      </div>
    )
  }

  if (isPending || !product) {
    return (
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 md:grid-cols-2 md:py-14" aria-busy>
        <div className="aspect-[4/5] animate-pulse rounded-md bg-secondary" />
        <div className="space-y-4">
          <div className="h-10 w-2/3 animate-pulse rounded bg-secondary" />
          <div className="h-5 w-1/3 animate-pulse rounded bg-secondary" />
          <div className="mt-10 h-72 animate-pulse rounded bg-secondary" />
        </div>
      </div>
    )
  }

  const isPack = product.kind === 'pack'
  const isCosmetic = product.kind === 'standard'
  const variant = variants.find((v) => v.id === variantId) ?? variants[0]
  const anyAvailable = variants.some((v) => v.available)
  const maxQty = variant ? Math.max(1, variant.max_qty) : 1
  const quantity = Math.min(qty, maxQty)
  const photos = product.images.length ? product.images : product.image ? [product.image] : []
  const sub = product.inspired_by ? t('product.inspiredBy', { name: product.inspired_by }) : null
  const notes = [
    ['top', product.notes.top],
    ['heart', product.notes.heart],
    ['base', product.notes.base],
  ].filter(([, value]) => value) as [string, string][]

  const addToCart = () => {
    if (!variant) return
    add(
      {
        variantId: variant.id,
        path: isPack ? `/pack/${product.slug}` : isCosmetic ? `/produit/${product.slug}` : `/parfum/${product.slug}`,
        name: product.name,
        label: variant.label,
        price: variant.price,
        image: product.image,
        typeSlug: product.type?.slug ?? null,
        rayonSlug: product.product_type?.slug ?? null,
      },
      quantity,
    )
    setAdded(`${product.name}, ${variant.label}`)
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:py-14">
      <Dialog open={added !== null} onOpenChange={(open) => !open && setAdded(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Ajouté au panier</DialogTitle>
            <DialogDescription>{added}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:flex-col sm:gap-2">
            <Link to="/panier" onClick={() => setAdded(null)} className={linkButton()}>Voir le panier et commander</Link>
            <Button variant="outline" className={bigButton} onClick={() => setAdded(null)}>Continuer mes achats</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <nav aria-label={t('product.breadcrumb')} className="mb-6 text-sm text-muted-foreground">
        <Link to={isPack ? '/packs' : '/boutique'} className="underline-offset-4 hover:underline">
          {isPack ? t('nav.packs') : t('nav.shop')}
        </Link>
        {product.type && !isPack && (
          <>
            <span aria-hidden className="mx-2">/</span>
            <Link to={`/boutique?rayon=${product.product_type?.slug ?? ''}&type=${product.type.slug}`} className="underline-offset-4 hover:underline">
              {product.type.name}
            </Link>
          </>
        )}
      </nav>

      <div className="grid gap-10 md:grid-cols-2 lg:gap-16">
        <div className="md:sticky md:top-24 md:self-start">
          {/* Shorter on phones so the size picker is not pushed a full screen down. */}
          <div className="aspect-[3/2] overflow-hidden rounded-md bg-secondary sm:aspect-[4/3] md:aspect-[4/5]">
            <ProductVisual image={photos[photo] ?? null} name={product.name} type={product.type?.slug} rayon={product.product_type?.slug} level={anyAvailable ? 0.78 : 0.1} priority />
          </div>
          {photos.length > 1 && (
            <ul className="mt-3 flex gap-2">
              {photos.map((src, i) => (
                <li key={src}>
                  <button type="button" onClick={() => setPhoto(i)} aria-label={t('product.photo', { n: i + 1 })} aria-current={i === photo} className={cn('block size-16 overflow-hidden rounded-md border-2 focus-visible:outline-2 focus-visible:outline-ring', i === photo ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100')}>
                    <img src={src} alt="" className="size-full object-cover" loading="lazy" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="text-muted-foreground">{[product.brand, product.type?.name].filter(Boolean).join(', ')}</p>
          <h1 className="mt-1 text-4xl leading-tight sm:text-5xl">{product.name}</h1>
          {sub && <p className="mt-2 font-display text-lg italic text-muted-foreground">{sub}</p>}
          {product.short_description && <p className="mt-5 max-w-prose text-lg leading-relaxed">{product.short_description}</p>}

          {notes.length > 0 && (
            <dl className="mt-7 grid max-w-md grid-cols-[4.5rem_1fr] gap-x-4 gap-y-2 border-y border-border py-4 text-[0.95rem]">
              {notes.map(([key, value]) => (
                <div key={key} className="contents">
                  <dt className="text-muted-foreground">{t(`product.${key}`)}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}

          {isPack && (product.contains?.length ?? 0) > 0 && (
            <div className="mt-7">
              <h2 className="text-xl">{t('product.contains')}</h2>
              <ul className="mt-3 divide-y divide-border border-y border-border">
                {product.contains!.map((c) => (
                  <li key={`${c.product}-${c.label}`} className="py-3">
                    {t('product.contained', { quantity: c.quantity, label: c.label, product: c.product })}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-9">
            {isPack ? (
              variant && (
                <p className="tnum font-display text-3xl">
                  {variant.compare_at_price ? <span className="mr-3 text-lg text-muted-foreground line-through">{formatPrice(variant.compare_at_price)}</span> : null}
                  {formatPrice(variant.price)}
                </p>
              )
            ) : (
              <>
                <h2 className="mb-4 text-xl">{isCosmetic ? t('product.chooseOption') : t('product.chooseSize')}</h2>
                {isCosmetic ? (
                  <OptionPicker
                    options={variants.map((v) => ({ id: v.id, label: v.label, price: v.price, compareAt: v.compare_at_price, available: v.available }))}
                    value={variant?.id ?? null}
                    onChange={(id) => {
                      setVariantId(id)
                      setQty(1)
                    }}
                    legend={t('product.chooseOption')}
                    soldOutLabel={t('common.soldOut')}
                    className="max-w-md"
                  />
                ) : (
                <VolumeGauge
                  options={variants.map((v) => ({ id: v.id, label: v.label, price: v.price, compareAt: v.compare_at_price, available: v.available }))}
                  value={variant?.id ?? null}
                  onChange={(id) => {
                    setVariantId(id)
                    setQty(1)
                  }}
                  type={product.type?.slug}
                  legend={t('product.chooseSize')}
                  soldOutLabel={t('common.soldOut')}
                  className="max-w-md"
                />
                )}
              </>
            )}
          </div>

          <div className="mt-8 max-w-md space-y-3">
            {!anyAvailable ? (
              <p className="rounded-md bg-secondary p-4">{isCosmetic ? t('product.unavailableCosmetic') : t('product.unavailable')}</p>
            ) : (
              <>
                <div className="flex items-center gap-4">
                  <QtyStepper value={quantity} max={maxQty} onChange={setQty} />
                  {variant && variant.max_qty <= 5 && variant.available && <p className="text-sm text-muted-foreground">{t('product.maxReached', { count: variant.max_qty })}</p>}
                </div>
                <Button className={cn(bigButton, 'h-12 w-full text-base')} onClick={addToCart} disabled={!variant?.available}>
                  {variant ? t('product.addFor', { total: formatPrice(variant.price * quantity) }) : t('common.add')}
                </Button>
              </>
            )}
            <p className="text-sm text-muted-foreground">{t('product.delivery')}</p>
          </div>

          {product.description && product.description !== product.short_description && (
            <div className="mt-12 max-w-prose">
              <h2 className="text-xl">{t('product.about')}</h2>
              <p className="mt-3 leading-relaxed whitespace-pre-line text-foreground/85">{product.description}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
