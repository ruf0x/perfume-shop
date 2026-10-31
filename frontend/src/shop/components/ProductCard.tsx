import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { formatPrice } from '../format'
import type { ProductCard as ProductCardData } from '../types'
import { ProductVisual } from './ProductVisual'

export const productPath = (p: Pick<ProductCardData, 'kind' | 'slug'>) => (p.kind === 'pack' ? `/pack/${p.slug}` : p.kind === 'standard' ? `/produit/${p.slug}` : `/parfum/${p.slug}`)

export function ProductCard({ product, className }: { product: ProductCardData; className?: string }) {
  const { t } = useTranslation()
  const sub = product.inspired_by ? t('product.inspiredBy', { name: product.inspired_by }) : product.brand

  return (
    <Link to={productPath(product)} className={cn('group block rounded-md outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring', className)}>
      <div className="relative aspect-[4/5] overflow-hidden rounded-md bg-secondary">
        <ProductVisual
          image={product.image}
          name={product.name}
          type={product.type?.slug}
          rayon={product.product_type?.slug}
          level={product.available ? 0.72 : 0.12}
          className="transition-transform duration-500 group-hover:scale-[1.03]"
        />
        {!product.available && (
          <span className="absolute top-3 left-3 rounded-sm bg-oud px-2 py-1 text-xs font-medium text-oud-foreground">{t('common.soldOut')}</span>
        )}
      </div>

      <div className="mt-3 space-y-0.5">
        <h3 className="font-display text-lg leading-snug">{product.name}</h3>
        {sub && <p className="line-clamp-1 text-sm text-muted-foreground">{sub}</p>}
        {product.price_from !== null && (
          <p className="tnum pt-1 text-sm">{product.kind === 'pack' ? formatPrice(product.price_from) : t('common.from', { price: formatPrice(product.price_from) })}</p>
        )}
      </div>
    </Link>
  )
}

export function ProductCardSkeleton() {
  return (
    <div aria-hidden>
      <div className="aspect-[4/5] animate-pulse rounded-md bg-secondary" />
      <div className="mt-3 space-y-2">
        <div className="h-5 w-3/4 animate-pulse rounded bg-secondary" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-secondary" />
      </div>
    </div>
  )
}
