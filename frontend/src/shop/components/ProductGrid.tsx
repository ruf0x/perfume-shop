import { cn } from '@/lib/utils'
import type { ProductCard as ProductCardData } from '../types'
import { ProductCard, ProductCardSkeleton } from './ProductCard'

interface ProductGridProps {
  products: ProductCardData[]
  loading?: boolean
  /** Number of placeholders while loading. */
  skeletons?: number
  className?: string
}

export const gridClass = 'grid grid-cols-2 gap-x-4 gap-y-9 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-4'

export function ProductGrid({ products, loading, skeletons = 8, className }: ProductGridProps) {
  return (
    <ul className={cn(gridClass, className)}>
      {loading
        ? Array.from({ length: skeletons }, (_, i) => (
            <li key={i}>
              <ProductCardSkeleton />
            </li>
          ))
        : products.map((p) => (
            <li key={p.id}>
              <ProductCard product={p} />
            </li>
          ))}
    </ul>
  )
}
