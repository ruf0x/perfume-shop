// Shapes returned by the admin API (see backend/API.md).

export type Role = 'owner' | 'staff'

export interface AdminUser {
  id: number
  name: string
  username: string
  role: Role
  is_active: boolean
  last_login_at: string | null
}

export type OrderStatus = 'en_attente' | 'confirmee' | 'annulee' | 'en_livraison' | 'livree' | 'retournee' | 'vendue_boutique'
export type OrderAction = 'confirm' | 'cancel' | 'no_answer' | 'ship' | 'deliver' | 'return' | 'sell_in_store' | 'reopen'
export type DeliveryMode = 'domicile' | 'stop_desk' | 'boutique'

export const ORDER_STATUSES: OrderStatus[] = ['en_attente', 'confirmee', 'en_livraison', 'livree', 'vendue_boutique', 'annulee', 'retournee']

export interface OrderItem {
  id: number
  variant_id: number | null
  product_name: string
  variant_label: string
  ml: number | null
  unit_price: number
  quantity: number
  line_total: number
}

export interface OrderHistoryEntry {
  from: OrderStatus | null
  to: OrderStatus
  note: string | null
  user: string | null
  at: string
}

export interface Order {
  id: number
  reference: string
  channel: 'online' | 'pos'
  status: OrderStatus
  status_label: string
  allowed_actions: OrderAction[]
  customer: { id: number | null; first_name: string | null; last_name: string | null; phone: string | null; phone2: string | null }
  wilaya?: { id: number; name: string } | null
  commune?: { id: number; name: string } | null
  address: string | null
  delivery_mode: DeliveryMode | null
  customer_note: string | null
  admin_note: string | null
  subtotal: number
  delivery_fee: number
  discount: number
  total: number
  payment_method: 'cod' | 'especes' | 'carte' | 'ccp'
  amount_received: number | null
  change_due: number | null
  call_attempts: number
  delivery_company: string | null
  tracking_number: string | null
  cancel_reason: string | null
  stock_deducted: boolean
  items_count?: number
  items?: OrderItem[]
  history?: OrderHistoryEntry[]
  created_by?: string | null
  confirmed_at: string | null
  shipped_at: string | null
  delivered_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  returned_at: string | null
  created_at: string
}

export interface Meta {
  current_page: number
  last_page: number
  per_page: number
  total: number
}

export interface OrdersPage {
  data: Order[]
  meta: Meta
  counts: Record<'all' | OrderStatus, number>
}

export interface OrderFilters {
  status?: OrderStatus
  channel?: 'online' | 'pos'
  from?: string
  to?: string
  wilaya_id?: number
  customer_id?: number
  min_total?: number
  max_total?: number
  q?: string
  sort?: 'created_at' | 'total'
  dir?: 'asc' | 'desc'
  page?: number
}

export type StockMode = 'pool' | 'unit' | 'pack'

export interface AdminVariant {
  id: number
  label: string
  ml: number | null
  price: number
  compare_at_price: number | null
  stock_mode: StockMode
  stock_qty: number
  sku: string | null
  is_active: boolean
  sort_order: number
  components: { variant_id: number; product: string; label: string; quantity: number }[] | null
}

export interface AdminProduct {
  id: number
  kind: 'perfume' | 'pack'
  name: string
  slug: string
  brand?: { id: number; name: string } | null
  type?: { id: number; name: string; slug: string } | null
  gender: 'homme' | 'femme' | 'mixte' | null
  inspired_by: string | null
  short_description: string | null
  description: string | null
  notes_top: string | null
  notes_heart: string | null
  notes_base: string | null
  image: string | null
  images?: { id: number; url: string; sort_order: number }[]
  stock_ml: number
  is_active: boolean
  is_featured: boolean
  sort_order: number
  available: boolean
  variants?: AdminVariant[]
}

export interface Taxon {
  id: number
  name: string
  slug: string
  sort_order?: number
  is_active?: boolean
  products_count: number
}

export interface StockRow {
  product_id: number
  name: string
  brand: string | null
  image: string | null
  is_active: boolean
  stock_ml: number
  sealed: { variant_id: number; label: string; ml: number | null; stock_qty: number }[]
  status: 'ok' | 'low' | 'out'
}

export interface Movement {
  id: number
  type: string
  product: { id: number; name: string | null }
  variant: { id: number; label: string } | null
  ml_change: number
  qty_change: number
  unit_cost: number | null
  order: { id: number; reference: string } | null
  user: string | null
  note: string | null
  created_at: string
}

export interface Customer {
  id: number
  phone: string
  first_name: string
  last_name: string
  wilaya: string | null
  address: string | null
  orders_count: number
  delivered_count: number
  cancelled_count: number
  returned_count: number
  is_blacklisted: boolean
  note: string | null
  created_at: string
}

export interface AdminWilaya {
  id: number
  code: string
  name: string
  name_ar: string | null
  home_fee: number
  desk_fee: number
  is_active: boolean
}

export interface ShopSettings {
  shop_name: string
  shop_phone: string | null
  shop_address: string | null
  socials: Record<string, string | null>
  show_unavailable: boolean
  low_stock_threshold_ml: number
  store_pickup_enabled: boolean
  free_delivery_over: number | null
}
