// Shapes returned by the public API (see backend/API.md). Amounts are integers in DZD.

export type Gender = 'homme' | 'femme' | 'mixte'
export type DeliveryMode = 'domicile' | 'stop_desk' | 'boutique'

export interface Paginated<T> {
  data: T[]
  meta: { current_page: number; last_page: number; per_page: number; total: number }
}

export type ProductKind = 'perfume' | 'cosmetic' | 'pack'

/** A perfume family (Designer, Niche...) or a cosmetic category (Maquillage, Ongles...). */
export interface TypeRef {
  id: number
  name: string
  slug: string
  kind?: 'perfume' | 'cosmetic'
}

export interface Brand {
  id: number
  name: string
  slug: string
}

export interface ProductCard {
  id: number
  slug: string
  kind: ProductKind
  name: string
  brand: string | null
  type: TypeRef | null
  gender: Gender | null
  inspired_by: string | null
  short_description: string | null
  image: string | null
  is_featured: boolean
  price_from: number | null
  sizes: { id: number; label: string; price: number }[]
  available: boolean
}

export interface Variant {
  id: number
  label: string
  ml: number | null
  price: number
  compare_at_price: number | null
  available: boolean
  max_qty: number
}

export interface Product extends Omit<ProductCard, 'sizes' | 'price_from'> {
  description: string | null
  notes: { top: string | null; heart: string | null; base: string | null }
  images: string[]
  variants: Variant[]
  /** Pack contents. */
  contains?: { product: string; label: string; quantity: number }[]
}

export interface Wilaya {
  id: number
  code: string
  name: string
  name_ar: string | null
  home_fee: number
  desk_fee: number
}

export interface Commune {
  id: number
  name: string
  name_ar: string | null
}

export interface ShopSettings {
  shop_name: string
  shop_phone: string | null
  shop_address: string | null
  socials: Record<string, string | null>
  store_pickup_enabled: boolean
  free_delivery_over: number | null
  show_unavailable: boolean
}

export interface QuoteLine {
  variant_id: number
  product: string
  label: string
  image: string | null
  quantity: number
  unit_price: number
  line_total: number
  available: boolean
  max_qty: number
}

export interface CartQuote {
  lines: QuoteLine[]
  removed: number[]
  subtotal: number
  /** null until a wilaya and a delivery mode are chosen. */
  delivery_fee: number | null
  total: number
  all_available: boolean
}

export interface ProductFilters {
  q?: string
  type?: string
  brand?: string
  gender?: Gender
  /** One or several kinds, comma-separated: `perfume,cosmetic`. */
  kind?: string
  min_price?: number
  max_price?: number
  featured?: boolean
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'name'
}

export interface ApiError {
  message?: string
  errors?: Record<string, string[]>
  shortages?: { name: string; unit: string; requested: number; available: number }[]
}
