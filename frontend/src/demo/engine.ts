import type { AdminProduct, AdminVariant, Customer, Dashboard, DashboardDay, Order, OrderItem, StockRow } from '@/admin/types'
import { nextId, type Db, type LoyaltyFile } from './db'

/** A refusal the real API would give (422 with a French message, 401, 404...). */
export class ApiFail extends Error {
  status: number
  extra: Record<string, unknown>

  constructor(status: number, message: string, extra: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.extra = extra
  }
}

export const fail = (status: number, message: string, extra: Record<string, unknown> = {}): never => {
  throw new ApiFail(status, message, extra)
}

export const LOYALTY_EVERY = 6

/** The owner's yes / no (Paramètres → Fidélité). */
export const loyaltyOn = (d: Db) => d.settings.loyalty_enabled !== false
export const SHOP_MAX_QTY = 50
const now = () => new Date().toISOString()

// ── lookups ───────────────────────────────────────────────────────────────
export const findVariant = (d: Db, id: number) => {
  for (const p of d.products) {
    const v = p.variants?.find((x) => x.id === id)
    if (v) return { p, v }
  }

  return undefined
}

export const productOf = (d: Db, id: number) => d.products.find((p) => p.id === id)

/** `unit_cost` is frozen on the item when it is sold (the admin type does not list it). */
type CostedItem = OrderItem & { unit_cost?: number | null }

// ── stock ─────────────────────────────────────────────────────────────────
interface Needs {
  ml: Record<number, number>
  units: Record<number, number>
  bottles: Record<number, number>
}

const bottleOf = (d: Db, ml: number | null) => d.bottles.find((b) => b.ml === ml)

function expand(d: Db, variantId: number, qty: number, needs: Needs) {
  const hit = findVariant(d, variantId)
  if (!hit) return
  const { p, v } = hit
  if (v.stock_mode === 'pack') {
    for (const c of v.components ?? []) expand(d, c.variant_id, c.quantity * qty, needs)
  } else if (v.stock_mode === 'pool') {
    needs.ml[p.id] = (needs.ml[p.id] ?? 0) + (v.ml ?? 0) * qty
    if (v.ml && bottleOf(d, v.ml)) needs.bottles[v.ml] = (needs.bottles[v.ml] ?? 0) + qty
  } else {
    needs.units[v.id] = (needs.units[v.id] ?? 0) + qty
  }
}

export function needsOf(d: Db, lines: { variant_id: number | null; quantity: number }[]): Needs {
  const needs: Needs = { ml: {}, units: {}, bottles: {} }
  for (const l of lines) if (l.variant_id) expand(d, l.variant_id, l.quantity, needs)

  return needs
}

interface Shortage {
  name: string
  unit: string
  requested: number
  available: number
}

function shortages(d: Db, needs: Needs): Shortage[] {
  const out: Shortage[] = []
  for (const [id, ml] of Object.entries(needs.ml)) {
    const p = productOf(d, Number(id))
    if (p && p.stock_ml < ml) out.push({ name: p.name, unit: 'ml', requested: ml, available: p.stock_ml })
  }
  for (const [id, n] of Object.entries(needs.units)) {
    const hit = findVariant(d, Number(id))
    if (hit && hit.v.stock_qty < n) out.push({ name: `${hit.p.name} (${hit.v.label})`, unit: hit.p.kind === 'standard' ? 'article(s)' : 'flacon(s)', requested: n, available: hit.v.stock_qty })
  }
  for (const [ml, n] of Object.entries(needs.bottles)) {
    const size = bottleOf(d, Number(ml))
    if (size && size.qty < n) out.push({ name: `Bouteilles de ${ml} ml`, unit: 'bouteille(s)', requested: n, available: size.qty })
  }

  return out
}

/** How many of a size can be sold with what is left. */
export function maxQtyOf(d: Db, p: AdminProduct, v: AdminVariant): number {
  if (!v.is_active || !p.is_active) return 0
  if (v.stock_mode === 'pack') {
    const counts = (v.components ?? []).map((c) => {
      const hit = findVariant(d, c.variant_id)

      return hit ? Math.floor(maxQtyOf(d, hit.p, { ...hit.v, is_active: true }) / c.quantity) : 0
    })

    return counts.length ? Math.min(...counts) : 0
  }
  if (v.stock_mode === 'pool') {
    const bottles = bottleOf(d, v.ml)

    return Math.min(Math.floor(p.stock_ml / (v.ml || 1)), bottles ? bottles.qty : Infinity)
  }

  return v.stock_qty
}

export const productAvailable = (d: Db, p: AdminProduct) => (p.variants ?? []).some((v) => maxQtyOf(d, p, v) >= 1)

export function refreshAvailability(d: Db) {
  for (const p of d.products) p.available = productAvailable(d, p)
}

export const stockLevel = (d: Db, p: AdminProduct): 'ok' | 'low' | 'out' => {
  const units = (p.variants ?? []).filter((v) => v.is_active && v.stock_mode === 'unit').reduce((n, v) => n + v.stock_qty, 0)
  const { low_stock_threshold_ml: ml, low_stock_threshold_qty: qty } = d.settings
  if (p.kind === 'perfume') return p.stock_ml === 0 && units === 0 ? 'out' : p.stock_ml < ml && units === 0 ? 'low' : 'ok'

  return units === 0 && p.stock_ml === 0 ? 'out' : units <= qty && p.stock_ml < ml ? 'low' : 'ok'
}

export function stockRows(d: Db): StockRow[] {
  return d.products
    .filter((p) => p.kind !== 'pack')
    .map((p) => ({
      product_id: p.id,
      kind: p.kind as 'perfume' | 'standard',
      product_type: p.product_type ? { id: p.product_type.id, name: p.product_type.name } : null,
      name: p.name,
      brand: p.brand?.name ?? null,
      image: p.image,
      is_active: p.is_active,
      stock_ml: p.stock_ml,
      has_pool: (p.variants ?? []).some((v) => v.stock_mode === 'pool'),
      sealed: (p.variants ?? []).filter((v) => v.stock_mode === 'unit').map((v) => ({ variant_id: v.id, label: v.label, ml: v.ml, stock_qty: v.stock_qty })),
      status: stockLevel(d, p),
    }))
}

function logMovement(d: Db, m: { type: string; productId: number; variantId?: number; ml?: number; qty?: number; order?: Order; user?: string | null; note?: string | null; unitCost?: number | null }) {
  const p = productOf(d, m.productId)
  const v = m.variantId ? findVariant(d, m.variantId)?.v : undefined
  d.movements.unshift({
    id: nextId(d, 'movement'),
    type: m.type,
    product: { id: m.productId, name: p?.name ?? null },
    variant: v ? { id: v.id, label: v.label } : null,
    ml_change: m.ml ?? 0,
    qty_change: m.qty ?? 0,
    unit_cost: m.unitCost ?? null,
    order: m.order ? { id: m.order.id, reference: m.order.reference } : null,
    user: m.user ?? null,
    note: m.note ?? null,
    created_at: now(),
  })
}

function logBottle(d: Db, ml: number, type: string, qty: number, order: Order | null, user: string | null, note: string | null = null, cost: number | null = null, editable = false) {
  d.bottleMovements.unshift({ id: nextId(d, 'bottleMovement'), editable, ml, type, qty_change: qty, total_cost: cost, order: order?.reference ?? null, user, note, created_at: now() })
}

/** Takes (sign -1) or gives back (sign +1) what the order's items consume: ml, sealed bottles, empty decant bottles. */
export function moveStock(d: Db, order: Order, sign: 1 | -1, type: string, user: string | null) {
  const needs = needsOf(d, order.items ?? [])
  for (const [id, ml] of Object.entries(needs.ml)) {
    const p = productOf(d, Number(id))
    if (!p) continue
    p.stock_ml = Math.max(0, p.stock_ml + sign * ml)
    logMovement(d, { type, productId: p.id, ml: sign * ml, order, user })
  }
  for (const [id, n] of Object.entries(needs.units)) {
    const hit = findVariant(d, Number(id))
    if (!hit) continue
    hit.v.stock_qty = Math.max(0, hit.v.stock_qty + sign * n)
    logMovement(d, { type, productId: hit.p.id, variantId: hit.v.id, qty: sign * n, order, user })
  }
  for (const [ml, n] of Object.entries(needs.bottles)) {
    const size = bottleOf(d, Number(ml))
    if (!size) continue
    size.qty = Math.max(0, size.qty + sign * n)
    logBottle(d, Number(ml), type, sign * n, order, user)
  }
  recomputeBottles(d)
  refreshAvailability(d)
}

export function recomputeBottles(d: Db) {
  for (const b of d.bottles) {
    b.unit_cost = b.bought > 0 ? Math.round(b.invested / b.bought) : null
    b.value_left = b.unit_cost === null ? null : b.unit_cost * b.qty
    b.low = b.qty <= 20
  }
}

export function bottleTotals(d: Db) {
  return {
    bottles_left: d.bottles.reduce((n, b) => n + b.qty, 0),
    bought: d.bottles.reduce((n, b) => n + b.bought, 0),
    invested: d.bottles.reduce((n, b) => n + b.invested, 0),
    value_left: d.bottles.reduce((n, b) => n + (b.value_left ?? 0), 0),
  }
}

/** For the owner, on a pending order: can the stock cover it, and what is left on each line. */
export function checkOrder(d: Db, order: Order): NonNullable<Order['stock_check']> {
  const items = order.items ?? []
  const total = needsOf(d, items)
  const short = shortages(d, total)
  const shortMl = new Set(short.filter((s) => s.unit === 'ml').map((s) => s.name))

  const lines = items.map((item) => {
    const hit = item.variant_id ? findVariant(d, item.variant_id) : undefined
    if (!hit) return { item_id: item.id, ok: false, left: 'Article supprimé', max_qty: 0 }
    const { p, v } = hit
    const own = shortages(d, needsOf(d, [item]))
    const ok = own.length === 0 && !(v.stock_mode === 'pool' && shortMl.has(p.name))
    let left: string
    if (v.stock_mode === 'pool') {
      const size = bottleOf(d, v.ml)
      left = `${p.stock_ml} ml${size ? `, ${size.qty} bouteille(s) de ${v.ml} ml` : ''}`
    } else if (v.stock_mode === 'unit') {
      left = `${v.stock_qty}${p.kind === 'standard' ? ' article(s)' : ' flacon(s)'}`
    } else {
      left = `peut être assemblé ${maxQtyOf(d, p, v)} fois`
    }

    return { item_id: item.id, ok, left, max_qty: maxQtyOf(d, p, v) }
  })

  return { possible: short.length === 0 && lines.every((l) => l.ok), shortages: short, lines }
}

export const assertStock = (d: Db, order: Order) => {
  const check = checkOrder(d, order)
  if (!check.possible) fail(422, 'Stock insuffisant pour confirmer cette commande.', { shortages: check.shortages })
}

// ── customers & loyalty ───────────────────────────────────────────────────
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/[^\d+]/g, '').replace(/^(\+213|00213)/, '0')

  return /^0[5-7][0-9]{8}$/.test(digits) ? digits : null
}

export const needPhone = (phone: string | null | undefined, field = 'phone') => normalizePhone(phone) ?? fail(422, 'Numéro de téléphone invalide.', { errors: { [field]: ['Numéro de téléphone invalide.'] } })

export function upsertCustomer(d: Db, phone: string, first: string, last: string, wilayaId: number | null, communeId: number | null, address: string | null): Customer {
  let c = d.customers.find((x) => x.phone === phone)
  if (!c) {
    c = {
      id: nextId(d, 'customer'), phone, first_name: first, last_name: last, wilaya: null, wilaya_id: null, commune_id: null, address: null,
      orders_count: 0, delivered_count: 0, cancelled_count: 0, returned_count: 0, is_blacklisted: false, note: null, loyalty: null, created_at: now(),
    }
    d.customers.unshift(c)
  }
  if (wilayaId) {
    c.wilaya_id = wilayaId
    c.commune_id = communeId
    c.wilaya = d.wilayas.find((w) => w.id === wilayaId)?.name ?? c.wilaya
  }
  if (address) c.address = address

  return c
}

export function loyaltyFile(d: Db, customerId: number): LoyaltyFile {
  return (d.loyalty[customerId] ??= {
    loyalty: { every: LOYALTY_EVERY, counted: 0, total: 0, pending: [], given: 0 },
    history: [],
    tiers: [{ number: 1, from: 0, to: LOYALTY_EVERY, complete: false, average: null, perfumes: [], reward: null }],
  })
}

/** Perfume units of an order that count for the loyalty programme. */
export function perfumeUnits(d: Db, order: Order): { name: string; price: number }[] {
  const units: { name: string; price: number }[] = []
  for (const item of order.items ?? []) {
    const hit = item.variant_id ? findVariant(d, item.variant_id) : undefined
    if (hit?.p.kind === 'perfume' && item.unit_price > 0) for (let i = 0; i < item.quantity; i++) units.push({ name: item.product_name, price: item.unit_price })
  }

  return units
}

/** A completed order adds its perfumes to the client's current round; a full round of six earns a gift. */
export function recordLoyalty(d: Db, order: Order) {
  const customerId = order.customer.id
  if (!customerId || !loyaltyOn(d)) return
  const file = loyaltyFile(d, customerId)
  const units = perfumeUnits(d, order)

  for (const u of units) {
    const tier = file.tiers[file.tiers.length - 1]
    tier.perfumes.push({ name: u.name, price: u.price, order: order.reference, date: order.completed_at ?? now() })
    file.loyalty.total++
    if (tier.perfumes.length >= LOYALTY_EVERY) {
      const average = Math.round(tier.perfumes.reduce((n, p) => n + p.price, 0) / tier.perfumes.length)
      const id = nextId(d, 'reward')
      tier.complete = true
      tier.average = average
      tier.reward = { id, status: 'pending', gift_name: null, gift_value: null, given_at: null }
      file.loyalty.pending.push({ id, average_price: average, earned_at: now() })
      file.tiers.push({ number: tier.number + 1, from: tier.to, to: tier.to + LOYALTY_EVERY, complete: false, average: null, perfumes: [], reward: null })
    }
  }
  const current = file.tiers[file.tiers.length - 1]
  file.loyalty.counted = current.perfumes.length
  current.average = current.perfumes.length ? Math.round(current.perfumes.reduce((n, p) => n + p.price, 0) / current.perfumes.length) : null
}

// ── orders ────────────────────────────────────────────────────────────────
export function newItem(d: Db, variantId: number, quantity: number, unitPrice?: number): CostedItem {
  const hit = findVariant(d, variantId) ?? fail(422, 'Article introuvable.')
  const { p, v } = hit
  const price = unitPrice ?? v.price

  return { id: nextId(d, 'item'), variant_id: v.id, product_name: p.name, variant_label: v.label, ml: v.ml, unit_price: price, list_price: v.price, quantity, line_total: price * quantity, unit_cost: v.cost_price }
}

export function blankOrder(d: Db, channel: 'online' | 'pos', status: Order['status'], items: OrderItem[], over: Partial<Order> = {}): Order {
  const subtotal = items.reduce((n, i) => n + i.line_total, 0)
  const ref = channel === 'online' ? `CMD-${String(nextId(d, 'onlineRef')).padStart(6, '0')}` : `POS-${String(nextId(d, 'posRef')).padStart(6, '0')}`
  const at = now()

  return {
    id: nextId(d, 'order'), reference: ref, channel, status, status_label: '', allowed_actions: [],
    customer: { id: null, first_name: null, last_name: null, phone: null, phone2: null },
    wilaya: null, commune: null, address: null, delivery_mode: channel === 'pos' ? 'boutique' : null,
    customer_note: null, admin_note: null, awaiting_stock: false,
    subtotal, delivery_fee: 0, discount: 0, total: subtotal, payment_method: channel === 'pos' ? 'especes' : 'cod', amount_received: null, change_due: null,
    call_attempts: 0, delivery_company: null, tracking_number: null, cancel_reason: null, stock_deducted: false,
    items, items_count: items.reduce((n, i) => n + i.quantity, 0),
    history: [{ from: null, to: status, note: channel === 'pos' ? 'Vente en caisse' : 'Commande passée en ligne', user: null, at }],
    created_by: null, confirmed_at: null, shipped_at: null, delivered_at: null, completed_at: null, cancelled_at: null, returned_at: null, created_at: at,
    ...over,
  }
}

const LABELS: Record<string, string> = {
  en_attente: 'En attente', confirmee: 'Confirmée', annulee: 'Annulée', en_livraison: 'En livraison', livree: 'Livrée', retournee: 'Retournée', vendue_boutique: 'Vendue en boutique',
}

/** What the API sends for an order right now: label, allowed actions, stock check and loyalty note are derived. */
export function present(d: Db, order: Order): Order {
  const customerId = order.customer.id
  const file = customerId ? d.loyalty[customerId] : undefined
  const loyalty = customerId && loyaltyOn(d) ? { ...(file?.loyalty ?? { every: LOYALTY_EVERY, counted: 0, total: 0, pending: [], given: 0 }), adds: perfumeUnits(d, order).length } : null

  return {
    ...order,
    status_label: LABELS[order.status] ?? order.status,
    allowed_actions: d.actions[order.status] as Order['allowed_actions'],
    items_count: (order.items ?? []).reduce((n, i) => n + i.quantity, 0),
    stock_check: order.status === 'en_attente' ? checkOrder(d, order) : undefined,
    customer: { ...order.customer, ...(loyalty ? { loyalty } : {}) },
  }
}

export function history(order: Order, to: Order['status'], user: string | null, note: string | null) {
  order.history = [...(order.history ?? []), { from: order.status, to, note, user, at: now() }]
}

export function bumpCounters(d: Db, order: Order, to: Order['status']) {
  const c = d.customers.find((x) => x.id === order.customer.id)
  if (!c) return
  if (to === 'livree' || to === 'vendue_boutique') c.delivered_count++
  if (to === 'annulee') c.cancelled_count++
  if (to === 'retournee') c.returned_count++
}

// ── dashboard ─────────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0')
export const ymd = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const dayOf = (iso: string | null) => (iso ? ymd(new Date(iso)) : '')
const REVENUE = ['livree', 'vendue_boutique']

export function dashboard(d: Db, from: string, to: string): Dashboard {
  const inRange = (day: string) => day >= from && day <= to
  const created = d.orders.filter((o) => inRange(dayOf(o.created_at)))
  const online = created.filter((o) => o.channel === 'online')
  const sold = d.orders.filter((o) => REVENUE.includes(o.status) && inRange(dayOf(o.completed_at)))
  const sum = (rows: Order[]) => rows.reduce((n, o) => n + o.total, 0)

  const costOf = (item: CostedItem) => item.unit_cost ?? (item.variant_id ? findVariant(d, item.variant_id)?.v.cost_price : null) ?? null
  let revenue = 0
  let cost = 0
  let counted = 0
  let missing = 0
  for (const o of sold) {
    const items = (o.items ?? []) as CostedItem[]
    if (items.some((i) => costOf(i) === null)) {
      missing++
      continue
    }
    counted++
    revenue += items.reduce((n, i) => n + i.line_total, 0) - o.discount
    cost += items.reduce((n, i) => n + (costOf(i) ?? 0) * i.quantity, 0)
  }

  const days: DashboardDay[] = []
  for (let t = new Date(`${from}T12:00:00`); ymd(t) <= to; t.setDate(t.getDate() + 1)) {
    const day = ymd(t)
    const rows = sold.filter((o) => dayOf(o.completed_at) === day)
    days.push({ date: day, revenue: sum(rows), revenue_online: sum(rows.filter((o) => o.channel === 'online')), revenue_pos: sum(rows.filter((o) => o.channel === 'pos')), orders: rows.length })
  }

  const groups = new Map<string, { product: string; variant: string; quantity: number; revenue: number; cost: number; costed: number; lines: number }>()
  for (const o of sold) {
    for (const i of (o.items ?? []) as CostedItem[]) {
      const key = `${i.product_name}|${i.variant_label}`
      const g = groups.get(key) ?? { product: i.product_name, variant: i.variant_label, quantity: 0, revenue: 0, cost: 0, costed: 0, lines: 0 }
      g.quantity += i.quantity
      g.revenue += i.line_total
      g.lines++
      const c = costOf(i)
      if (c !== null) {
        g.costed++
        g.cost += c * i.quantity
      }
      groups.set(key, g)
    }
  }

  const cancelled = online.filter((o) => o.status === 'annulee').length

  return {
    range: { from, to },
    orders_count: created.length,
    online_orders_count: online.length,
    pos_orders_count: created.length - online.length,
    revenue: sum(sold),
    revenue_online: sum(sold.filter((o) => o.channel === 'online')),
    revenue_pos: sum(sold.filter((o) => o.channel === 'pos')),
    pending_count: d.orders.filter((o) => o.status === 'en_attente').length,
    in_delivery_count: d.orders.filter((o) => o.status === 'en_livraison').length,
    cancel_rate: online.length ? Math.round((cancelled / online.length) * 1000) / 10 : 0,
    profit: { amount: revenue - cost, cost, revenue, percent: cost > 0 ? Math.round(((revenue - cost) / cost) * 1000) / 10 : null, orders_counted: counted, orders_without_cost: missing },
    sales_by_day: days,
    top_products: [...groups.values()]
      .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
      .map((g) => ({ product: g.product, variant: g.variant, quantity: g.quantity, revenue: g.revenue, profit: g.costed === g.lines ? g.revenue - g.cost : null })),
    low_stock: d.products
      .filter((p) => p.is_active && p.kind !== 'pack' && stockLevel(d, p) !== 'ok')
      .sort((a, b) => a.stock_ml - b.stock_ml || a.name.localeCompare(b.name))
      .slice(0, 20)
      .map((p) => ({ id: p.id, name: p.name, kind: p.kind as 'perfume' | 'standard', stock_ml: p.stock_ml, units: (p.variants ?? []).filter((v) => v.stock_mode === 'unit' && v.is_active).reduce((n, v) => n + v.stock_qty, 0) })),
  }
}
