import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { CartLine } from '@/stores/cart'
import type {
  Brand,
  CartQuote,
  Commune,
  DeliveryMode,
  Paginated,
  Product,
  ProductCard,
  ProductFilters,
  ShopProductType,
  ShopSettings,
  TypeRef,
  Wilaya,
} from './types'

const MINUTE = 60_000

export const useSettings = () =>
  useQuery({ queryKey: ['settings'], staleTime: 10 * MINUTE, queryFn: () => api.get<{ data: ShopSettings }>('/settings/public').then((r) => r.data.data) })

export const useTypes = () =>
  useQuery({ queryKey: ['types'], staleTime: 10 * MINUTE, queryFn: () => api.get<{ data: TypeRef[] }>('/types').then((r) => r.data.data) })

/** The shop's product types with their categories: they drive the menu, the home page and the filters. */
export const useProductTypes = () =>
  useQuery({ queryKey: ['product-types'], staleTime: 5 * MINUTE, queryFn: () => api.get<{ data: ShopProductType[] }>('/product-types').then((r) => r.data.data) })

/** All brands, or only those sold in one product type. */
export const useBrands = (rayon?: string) =>
  useQuery({ queryKey: ['brands', rayon ?? null], staleTime: 10 * MINUTE, queryFn: () => api.get<{ data: Brand[] }>('/brands', { params: { rayon } }).then((r) => r.data.data) })

export const useWilayas = () =>
  useQuery({ queryKey: ['wilayas'], staleTime: 10 * MINUTE, queryFn: () => api.get<{ data: Wilaya[] }>('/wilayas').then((r) => r.data.data) })

export const useCommunes = (wilayaId: number | null) =>
  useQuery({
    queryKey: ['communes', wilayaId],
    enabled: wilayaId !== null,
    staleTime: 10 * MINUTE,
    queryFn: () => api.get<{ data: Commune[] }>(`/wilayas/${wilayaId}/communes`).then((r) => r.data.data),
  })

/** One numbered page of the catalogue (the page number lives in the URL). */
export const usePagedProducts = (filters: ProductFilters, page: number, perPage = 12) =>
  useQuery({
    queryKey: ['products-page', filters, page, perPage],
    placeholderData: keepPreviousData,
    queryFn: () => api.get<Paginated<ProductCard>>('/products', { params: { ...filters, per_page: perPage, page } }).then((r) => r.data),
  })

/** Catalogue pages; call fetchNextPage() for "Voir plus". */
export const useProducts = (filters: ProductFilters, perPage = 12) =>
  useInfiniteQuery({
    queryKey: ['products', filters, perPage],
    initialPageParam: 1,
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam }) =>
      api.get<Paginated<ProductCard>>('/products', { params: { ...filters, per_page: perPage, page: pageParam } }).then((r) => r.data),
    getNextPageParam: (last) => (last.meta.current_page < last.meta.last_page ? last.meta.current_page + 1 : undefined),
  })

export const useProduct = (slug: string | undefined) =>
  useQuery({
    queryKey: ['product', slug],
    enabled: !!slug,
    retry: false,
    queryFn: () => api.get<{ data: Product }>(`/products/${slug}`).then((r) => r.data.data),
  })

/**
 * Re-prices the cart on the server. Prices in the browser are only for display until this answers.
 * Delivery fee and total appear once a wilaya and a delivery mode are given.
 */
export const useCartQuote = (lines: CartLine[], wilayaId: number | null = null, mode: DeliveryMode | null = null) =>
  useQuery({
    queryKey: ['cart-quote', lines.map((l) => [l.variantId, l.qty]), wilayaId, mode],
    enabled: lines.length > 0,
    placeholderData: keepPreviousData,
    queryFn: () =>
      api
        .post<{ data: CartQuote }>('/cart/validate', {
          lines: lines.map((l) => ({ variant_id: l.variantId, quantity: l.qty })),
          wilaya_id: wilayaId ?? undefined,
          delivery_mode: mode ?? undefined,
        })
        .then((r) => r.data.data),
  })
