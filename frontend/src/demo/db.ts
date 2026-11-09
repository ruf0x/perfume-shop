import type { AdminProduct, AdminProductType, AdminUser, AdminWilaya, BottleMovement, BottleSizeRow, Customer, Loyalty, LoyaltyTier, Movement, Order, ShopSettings, Taxon } from '@/admin/types'
import type { ShopProductType } from '@/shop/types'
import raw from './data/snapshot.json'

/** Everything the fake server knows. It lives in memory, is saved in the browser and can be reset. */
export interface LoyaltyFile {
  loyalty: Loyalty
  history: unknown[]
  tiers: LoyaltyTier[]
}

export interface Db {
  /** The day the data was dated for (changes the next day: the demo then starts over with fresh dates). */
  day: string
  settings: ShopSettings
  products: AdminProduct[]
  orders: Order[]
  customers: Customer[]
  loyalty: Record<number, LoyaltyFile>
  movements: Movement[]
  bottles: BottleSizeRow[]
  bottleMovements: BottleMovement[]
  productTypes: AdminProductType[]
  types: Taxon[]
  brands: Taxon[]
  wilayas: AdminWilaya[]
  communes: Record<number, { id: number; name: string; name_ar: string | null }[]>
  users: AdminUser[]
  /** The signed-in user (id), null when signed out. */
  session: number | null
  /** What each order status allows, learnt from the real data. */
  actions: Record<string, string[]>
  ids: Record<string, number>
}

const KEY = 'demo-db-v3'
const DAY = 86_400_000
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
const NAIVE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

const pad = (n: number) => String(n).padStart(2, '0')
const naive = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`

/** Moves every date of the snapshot forward by whole days, so the newest sales are from today. Nothing ends up in the future. */
function shiftDates<T>(value: T, ms: number, now: number): T {
  if (typeof value === 'string') {
    const iso = ISO.test(value)
    if (!iso && !NAIVE.test(value)) return value
    const time = iso ? new Date(value).getTime() : new Date(value.replace(' ', 'T')).getTime()
    let moved = time + ms
    if (moved > now) moved -= DAY
    const date = new Date(moved)

    return (iso ? date.toISOString() : naive(date)) as T
  }
  if (Array.isArray(value)) return value.map((v) => shiftDates(v, ms, now)) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shiftDates(v, ms, now)])) as T
  }

  return value
}

const today = () => new Date().toDateString()

function fresh(): Db {
  const snap = JSON.parse(JSON.stringify(raw)) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  const now = Date.now()
  const ms = Math.floor((now - new Date(snap.generatedAt).getTime()) / DAY) * DAY
  const dated = <T,>(v: T) => shiftDates(v, ms, now)

  const orders = dated(snap.orders as Order[])
  const actions: Record<string, string[]> = {}
  for (const o of orders) actions[o.status] = o.allowed_actions
  const loyalty = dated(snap.loyalty as Record<number, LoyaltyFile>)

  const customers = dated(snap.customers as Customer[])
  const ids: Record<string, number> = {}
  const max = (rows: { id: number }[]) => rows.reduce((m, r) => Math.max(m, r.id), 0)
  const products = dated(snap.products as AdminProduct[])
  Object.assign(ids, {
    order: max(orders), customer: max(customers), product: max(products), variant: Math.max(...products.flatMap((p) => (p.variants ?? []).map((v) => v.id))),
    movement: max(dated(snap.movements as Movement[])) + 1, bottleMovement: max(snap.bottleMovements) + 1, item: Math.max(...orders.flatMap((o) => (o.items ?? []).map((i) => i.id))),
    type: max(snap.types), brand: max(snap.brands), productType: max(snap.productTypes), user: max(snap.users), reward: 100, image: 1000, bottleSize: max(snap.bottles.data),
    posRef: Math.max(...orders.filter((o) => o.channel === 'pos').map((o) => Number(o.reference.replace(/\D/g, '')))),
    onlineRef: Math.max(...orders.filter((o) => o.channel === 'online').map((o) => Number(o.reference.replace(/\D/g, '')))),
  })

  const settings = { ...snap.settingsAdmin, shop_name: 'Parfumerie Démo', shop_phone: '0550 12 34 56', shop_address: "12 rue Larbi Ben M'hidi, Oran", socials: { instagram: 'https://instagram.com', facebook: 'https://facebook.com' }, loyalty_enabled: true, loyalty_available: true, loyalty_every: 6 } as ShopSettings

  return {
    day: today(),
    settings,
    products,
    orders,
    customers,
    loyalty,
    movements: dated(snap.movements as Movement[]),
    bottles: snap.bottles.data,
    bottleMovements: dated(snap.bottleMovements as BottleMovement[]),
    productTypes: snap.productTypes,
    types: snap.types,
    brands: snap.brands,
    wilayas: snap.wilayas,
    communes: snap.communes,
    users: dated(snap.users as AdminUser[]),
    session: null,
    actions,
    ids,
  }
}

let db: Db | null = null
let timer: ReturnType<typeof setTimeout> | undefined

export function getDb(): Db {
  if (db) return db
  try {
    const stored = localStorage.getItem(KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as Db
      if (parsed.day === today()) return (db = parsed)
    }
  } catch {
    /* a private window or a full storage: the demo just starts fresh and is not remembered */
  }

  return (db = fresh())
}

function save() {
  try {
    if (db) localStorage.setItem(KEY, JSON.stringify(db))
  } catch {
    /* not remembered */
  }
}

/** Remembers the demo's state a moment after the last change (and at once when the page is left). */
export function persist() {
  clearTimeout(timer)
  timer = setTimeout(save, 400)
}

if (typeof window !== 'undefined') window.addEventListener('pagehide', save)

export function resetDemo() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nothing to clear */
  }
  db = null
  window.location.reload()
}

export const nextId = (d: Db, kind: string) => (d.ids[kind] = (d.ids[kind] ?? 0) + 1)

export type { ShopProductType }
