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
  /** Catalogue price when the sale was made (null on old orders). Differs from unit_price for a negotiated price. */
  list_price: number | null
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
  customer: { id: number | null; first_name: string | null; last_name: string | null; phone: string | null; phone2: string | null; /** `adds` = perfumes this order would add to the count once completed. */ loyalty?: (Loyalty & { adds: number }) | null }
  wilaya?: { id: number; name: string } | null
  commune?: { id: number; name: string } | null
  address: string | null
  delivery_mode: DeliveryMode | null
  customer_note: string | null
  admin_note: string | null
  /** The owner put this order aside until stock arrives. */
  awaiting_stock: boolean
  /** Pending orders: can the stock cover the order, and what is left on each line (by item id). */
  stock_check?: {
    possible: boolean
    shortages: { name: string; unit: string; requested: number; available: number }[]
    lines: { item_id: number; ok: boolean; left: string; max_qty: number }[]
  }
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

/** The empty decant bottles of one size. */
export interface BottleSizeRow {
  id: number
  ml: number
  qty: number
  bought: number
  invested: number
  unit_cost: number | null
  value_left: number | null
  low: boolean
}

export interface BottleMovement {
  id: number
  /** Entered by hand (an entry, a loss, a recount): it can be edited or deleted. */
  editable: boolean
  ml: number
  type: string
  qty_change: number
  total_cost: number | null
  order: string | null
  user: string | null
  note: string | null
  created_at: string
}

export type StockMode = 'pool' | 'unit' | 'pack'

export interface AdminVariant {
  id: number
  label: string
  ml: number | null
  price: number
  compare_at_price: number | null
  /** What the shop paid for one unit (a pack: the sum of its components); null = not entered. */
  cost_price: number | null
  stock_mode: StockMode
  stock_qty: number
  sku: string | null
  is_active: boolean
  sort_order: number
  components: { variant_id: number; product: string; label: string; quantity: number; cost_price: number | null }[] | null
}

/** How a product works: `perfume` (decants, notes), `standard` (options counted in pieces) or a `pack`. */
export type AdminKind = 'perfume' | 'standard' | 'pack'

/** A product type ("rayon") the owner created: Parfums, Cosmétiques, Montres, Lunettes... */
export interface AdminProductType {
  id: number
  name: string
  slug: string
  profile: 'perfume' | 'standard'
  uses_gender: boolean
  sort_order: number
  is_active: boolean
  products_count: number
  categories_count: number
}

export type ProductTypeRef = Pick<AdminProductType, 'id' | 'name' | 'slug' | 'profile' | 'uses_gender'>

export interface AdminProduct {
  id: number
  kind: AdminKind
  name: string
  slug: string
  brand?: { id: number; name: string } | null
  product_type?: ProductTypeRef | null
  /** The family / category inside the product type. */
  type?: { id: number; name: string; slug: string; product_type_id?: number } | null
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
  /** Families / categories belong to one product type. */
  product_type_id?: number
  /** Brands are sold in one or several product types. */
  product_type_ids?: number[]
  sort_order?: number
  is_active?: boolean
  products_count: number
}

export interface StockRow {
  product_id: number
  kind: 'perfume' | 'standard'
  product_type: { id: number; name: string } | null
  name: string
  brand: string | null
  image: string | null
  is_active: boolean
  stock_ml: number
  has_pool: boolean
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

/** Where a customer stands in the loyalty programme (every N perfumes bought, a gift flacon). */
export interface Loyalty {
  every: number
  /** Perfumes counted toward the next gift (0 to every - 1). */
  counted: number
  total: number
  /** Gifts earned and not given yet; `average_price` is the value the gift should be about. */
  pending: { id: number; average_price: number; earned_at: string }[]
  given: number
}

/** One round of perfumes (0 to 6, 6 to 12…): its perfumes, its average and the gift it earned. */
export interface LoyaltyTier {
  number: number
  from: number
  to: number
  complete: boolean
  average: number | null
  perfumes: { name: string; price: number; order: string | null; date: string | null }[]
  reward: { id: number; status: 'pending' | 'given'; gift_name: string | null; gift_value: number | null; given_at: string | null } | null
}

export interface GiftSuggestions {
  average: number
  from: number
  to: number
  items: { variant_id: number; product: string; label: string; price: number; kind: 'flacon' | 'ml'; gap: number }[]
}

export interface Customer {
  id: number
  phone: string
  first_name: string
  last_name: string
  wilaya: string | null
  wilaya_id: number | null
  commune_id: number | null
  address: string | null
  orders_count: number
  delivered_count: number
  cancelled_count: number
  returned_count: number
  is_blacklisted: boolean
  note: string | null
  loyalty?: Loyalty | null
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
  /** Cosmetics are counted in units: at or below this many left they show as low. */
  low_stock_threshold_qty: number
  store_pickup_enabled: boolean
  free_delivery_over: number | null
}

export interface DashboardDay {
  date: string
  revenue: number
  revenue_online: number
  revenue_pos: number
  orders: number
}

export interface Dashboard {
  range: { from: string; to: string }
  orders_count: number
  online_orders_count: number
  pos_orders_count: number
  revenue: number
  revenue_online: number
  revenue_pos: number
  pending_count: number
  in_delivery_count: number
  cancel_rate: number
  /** Profit of the period, from the purchase prices of the items sold (orders without a known cost are left out). */
  profit: { amount: number; cost: number; revenue: number; percent: number | null; orders_counted: number; orders_without_cost: number }
  sales_by_day: DashboardDay[]
  top_products: { product: string; variant: string; quantity: number; revenue: number; profit: number | null }[]
  low_stock: { id: number; name: string; kind: 'perfume' | 'standard'; stock_ml: number; units: number }[]
}
