/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AdminProduct, AdminVariant, Customer, Order, OrderItem, StockRow } from '@/admin/types'
import type { CartQuote, ProductCard } from '@/shop/types'
import { getLang } from '@/admin/i18n/lang'
import { nextId, persist, type Db } from './db'
import {
  ApiFail, LOYALTY_EVERY, loyaltyOn, SHOP_MAX_QTY, assertStock, blankOrder, bottleTotals, bumpCounters, checkOrder, dashboard, fail, findVariant, history, loyaltyFile, maxQtyOf, moveStock, needPhone,
  newItem, normalizePhone, present, productOf, recomputeBottles, recordLoyalty, refreshAvailability, stockRows, upsertCustomer, ymd,
} from './engine'

type Body = Record<string, any>
interface Ctx {
  d: Db
  p: string[]
  q: Record<string, string>
  body: Body
}
type Handler = (c: Ctx) => unknown | Promise<unknown>
type Access = 'public' | 'auth' | 'owner'

export interface Reply {
  status: number
  body: unknown
}
export const reply = (body: unknown, status = 200): Reply => ({ status, body })

const table: { method: string; re: RegExp; run: Handler; access: Access }[] = []
const route = (method: string, pattern: string, access: Access, run: Handler) => {
  table.push({ method, re: new RegExp(`^${pattern.replace(/:[a-z]+/g, '([^/]+)')}$`), run, access })
}

const now = () => new Date().toISOString()
const num = (v: unknown) => (v === undefined || v === null || v === '' ? null : Number(v))
const slugify = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const plain = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const uniqueSlug = (name: string, taken: (slug: string) => boolean) => {
  const base = slugify(name) || 'article'
  let slug = base
  for (let i = 2; taken(slug); i++) slug = `${base}-${i}`

  return slug
}

function paginate<T>(rows: T[], page: number, perPage: number) {
  const last = Math.max(1, Math.ceil(rows.length / perPage))
  const current = Math.min(Math.max(1, page), last)

  return { data: rows.slice((current - 1) * perPage, current * perPage), meta: { current_page: current, last_page: last, per_page: perPage, total: rows.length } }
}

const me = (d: Db) => d.users.find((u) => u.id === d.session) ?? null
const userName = (d: Db) => me(d)?.name ?? null
const find = <T extends { id: number }>(rows: T[], id: string | number): T => rows.find((r) => r.id === Number(id)) ?? fail(404, 'Introuvable.')

// ═══ public shop ═════════════════════════════════════════════════════════
/** The demo's own names of rayons and categories, in Arabic when the visitor chose Arabic (the shop's data is French). */
const AR_NAMES: Record<string, string> = {
  Parfums: 'عطور', Cosmétiques: 'مستحضرات التجميل', Montres: 'ساعات', Lunettes: 'نظارات',
  Designer: 'ماركات عالمية', Niche: 'نيش', Arabe: 'شرقي', Dupe: 'مماثل', 'Création maison': 'تركيبة خاصة',
  Maquillage: 'مكياج', Ongles: 'أظافر', 'Soin du corps': 'العناية بالجسم', 'Douche et bain': 'استحمام', Cheveux: 'الشعر', Déodorants: 'مزيلات العرق', 'Soin du visage': 'العناية بالبشرة', Accessoires: 'إكسسوارات',
  'Montres classiques': 'ساعات كلاسيكية', 'Montres sport': 'ساعات رياضية', 'Montres connectées': 'ساعات ذكية', 'Bracelets et accessoires': 'أساور وإكسسوارات',
  'Lunettes de soleil': 'نظارات شمسية', 'Lunettes de vue': 'نظارات طبية', 'Lunettes de lecture': 'نظارات قراءة', 'Étuis et accessoires': 'علب وإكسسوارات',
}
const loc = (name: string) => (getLang() === 'ar' ? (AR_NAMES[name] ?? name) : name)
const locLabel = (label: string) => (getLang() === 'ar' ? label.replace('Flacon complet', 'قارورة كاملة').replace(/\bml\b/, 'مل').replace(/^Pack$/, 'باقة') : label)
const locKind = <T extends { name: string } | null>(row: T): T => (row ? { ...row, name: loc(row.name) } : row)
const listed = (d: Db, p: AdminProduct) => p.is_active && (p.available || d.settings.show_unavailable)
const activeVariants = (p: AdminProduct) => (p.variants ?? []).filter((v) => v.is_active)

function card(p: AdminProduct): ProductCard {
  const sizes = activeVariants(p).map((v) => ({ id: v.id, label: locLabel(v.label), price: v.price }))

  return {
    id: p.id, slug: p.slug, kind: p.kind, name: p.name, brand: p.brand?.name ?? null, product_type: locKind(p.product_type ?? null),
    type: p.type ? { id: p.type.id, name: loc(p.type.name), slug: p.type.slug, product_type_id: p.type.product_type_id } : null,
    gender: p.gender, inspired_by: p.inspired_by, short_description: p.short_description, image: p.image, is_featured: p.is_featured,
    price_from: sizes.length ? Math.min(...sizes.map((s) => s.price)) : null, sizes, available: p.available,
  }
}

route('GET', '/settings/public', 'public', ({ d }) => ({
  data: {
    shop_name: d.settings.shop_name, shop_phone: d.settings.shop_phone, shop_address: d.settings.shop_address, socials: d.settings.socials,
    store_pickup_enabled: d.settings.store_pickup_enabled, free_delivery_over: d.settings.free_delivery_over, show_unavailable: d.settings.show_unavailable,
    web_admin_enabled: true, default_location: { wilaya_id: 31, commune_id: d.communes[31]?.find((c) => c.name === 'Oran')?.id ?? null },
  },
}))

route('GET', '/types', 'public', ({ d }) => ({ data: d.types.filter((t) => t.is_active !== false).map((t) => ({ id: t.id, name: loc(t.name), slug: t.slug, product_type_id: t.product_type_id })) }))

route('GET', '/product-types', 'public', ({ d }) => ({
  data: d.productTypes.filter((t) => t.is_active).sort((a, b) => a.sort_order - b.sort_order).map((t) => ({
    id: t.id, name: loc(t.name), slug: t.slug, profile: t.profile, uses_gender: t.uses_gender,
    categories: d.types.filter((c) => c.product_type_id === t.id && c.is_active !== false).map((c) => ({ id: c.id, name: loc(c.name), slug: c.slug, product_type_id: c.product_type_id })),
  })),
}))

route('GET', '/brands', 'public', ({ d, q }) => {
  const rayon = q.rayon ? d.productTypes.find((t) => t.slug === q.rayon) : undefined

  return { data: d.brands.filter((b) => (!rayon || b.product_type_ids?.includes(rayon.id)) && d.products.some((p) => p.brand?.id === b.id)).map((b) => ({ id: b.id, name: b.name, slug: b.slug })) }
})

route('GET', '/wilayas', 'public', ({ d }) => ({ data: d.wilayas.filter((w) => w.is_active).map(({ id, code, name, name_ar, home_fee, desk_fee }) => ({ id, code, name, name_ar, home_fee, desk_fee })) }))
route('GET', '/wilayas/:id/communes', 'public', ({ d, p }) => ({ data: d.communes[Number(p[0])] ?? [] }))

route('GET', '/products', 'public', ({ d, q }) => {
  const kinds = q.kind ? q.kind.split(',') : null
  const type = q.rayon ? d.productTypes.find((t) => t.slug === q.rayon) : undefined
  const brand = q.brand ? d.brands.find((b) => b.slug === q.brand) : undefined
  const needle = plain(q.q)

  let rows = d.products.filter((p) => listed(d, p))
  rows = rows.filter((p) => (!kinds || kinds.includes(p.kind)) && (!q.type || p.type?.slug === q.type))
  if (type) rows = rows.filter((p) => p.product_type?.id === type.id)
  if (brand) rows = rows.filter((p) => p.brand?.id === brand.id)
  if (q.gender) rows = rows.filter((p) => p.gender === q.gender || p.gender === 'mixte')
  if (q.featured === '1' || q.featured === 'true') rows = rows.filter((p) => p.is_featured)
  if (needle) rows = rows.filter((p) => [p.name, p.brand?.name, p.inspired_by, p.short_description].some((s) => plain(s).includes(needle)))

  let cards = rows.map((p) => card(p))
  if (q.min_price) cards = cards.filter((c) => (c.price_from ?? 0) >= Number(q.min_price))
  if (q.max_price) cards = cards.filter((c) => (c.price_from ?? 0) <= Number(q.max_price))
  const sort = q.sort ?? 'newest'
  cards.sort((a, b) => (sort === 'price_asc' ? (a.price_from ?? 0) - (b.price_from ?? 0) : sort === 'price_desc' ? (b.price_from ?? 0) - (a.price_from ?? 0) : sort === 'name' ? a.name.localeCompare(b.name) : Number(b.is_featured) - Number(a.is_featured) || a.id - b.id))

  return paginate(cards, Number(q.page ?? 1), Number(q.per_page ?? 12))
})

route('GET', '/products/:slug', 'public', ({ d, p: [slug] }) => {
  const p = d.products.find((x) => x.slug === slug)
  if (!p || !listed(d, p)) return fail(404, 'Produit introuvable.')
  const { sizes: _s, price_from: _f, ...rest } = card(p)

  return {
    data: {
      ...rest,
      description: p.description,
      notes: { top: p.notes_top, heart: p.notes_heart, base: p.notes_base },
      images: (p.images ?? []).map((i) => i.url).concat(p.images?.length || !p.image ? [] : [p.image]),
      variants: activeVariants(p).map((v) => ({ id: v.id, label: locLabel(v.label), ml: v.ml, price: v.price, compare_at_price: v.compare_at_price, available: maxQtyOf(d, p, v) >= 1, max_qty: maxQtyOf(d, p, v) >= 1 ? SHOP_MAX_QTY : 0 })),
      ...(p.kind === 'pack' ? { contains: (p.variants?.[0]?.components ?? []).map((c) => ({ product: c.product, label: c.label, quantity: c.quantity })) } : {}),
    },
  }
})

function quote(d: Db, body: Body): CartQuote {
  const lines: CartQuote['lines'] = []
  const removed: number[] = []
  for (const l of (body.lines ?? []) as { variant_id: number; quantity: number }[]) {
    const hit = findVariant(d, Number(l.variant_id))
    if (!hit || !hit.v.is_active || !listed(d, hit.p)) {
      removed.push(Number(l.variant_id))
      continue
    }
    const ok = maxQtyOf(d, hit.p, hit.v) >= 1
    const quantity = Math.max(1, Math.min(Number(l.quantity) || 1, SHOP_MAX_QTY))
    lines.push({ variant_id: hit.v.id, product: hit.p.name, label: hit.v.label, image: hit.p.image, quantity, unit_price: hit.v.price, line_total: hit.v.price * quantity, available: ok, max_qty: ok ? SHOP_MAX_QTY : 0 })
  }
  const subtotal = lines.reduce((n, l) => n + l.line_total, 0)
  let fee: number | null = null
  const wilaya = d.wilayas.find((w) => w.id === Number(body.wilaya_id))
  if (body.delivery_mode === 'boutique') fee = 0
  else if (wilaya && (body.delivery_mode === 'domicile' || body.delivery_mode === 'stop_desk')) fee = body.delivery_mode === 'domicile' ? wilaya.home_fee : wilaya.desk_fee
  if (fee !== null && d.settings.free_delivery_over && subtotal >= d.settings.free_delivery_over) fee = 0

  return { lines, removed, subtotal, delivery_fee: fee, total: subtotal + (fee ?? 0), all_available: lines.every((l) => l.available) }
}

route('POST', '/cart/validate', 'public', ({ d, body }) => ({ data: quote(d, body) }))

route('POST', '/orders', 'public', ({ d, body }) => {
  const phone = needPhone(body.phone)
  const mode = body.delivery_mode as string
  if (!['domicile', 'stop_desk', 'boutique'].includes(mode)) fail(422, 'Mode de livraison invalide.')
  if (mode === 'domicile' && !String(body.address ?? '').trim()) fail(422, "L'adresse est obligatoire pour une livraison.")
  if (d.customers.some((c) => c.phone === phone && c.is_blacklisted)) fail(422, 'Impossible de passer commande avec ce numéro. Contactez la boutique.')

  const q = quote(d, { ...body, delivery_mode: mode, wilaya_id: body.wilaya_id })
  if (q.lines.length === 0 || q.removed.length > 0 || !q.all_available) fail(422, "Un article de votre panier n'est plus disponible.")

  const items: OrderItem[] = q.lines.map((l) => newItem(d, l.variant_id, l.quantity))
  const wilaya = d.wilayas.find((w) => w.id === Number(body.wilaya_id))
  const commune = wilaya ? d.communes[wilaya.id]?.find((c) => c.id === Number(body.commune_id)) : undefined
  const customer = upsertCustomer(d, phone, body.first_name, body.last_name, wilaya?.id ?? null, commune?.id ?? null, body.address ?? null)
  customer.orders_count++

  const order = blankOrder(d, 'online', 'en_attente', items, {
    customer: { id: customer.id, first_name: body.first_name, last_name: body.last_name, phone, phone2: normalizePhone(body.phone2) },
    wilaya: wilaya ? { id: wilaya.id, name: wilaya.name } : null, commune: commune ? { id: commune.id, name: commune.name } : null,
    address: body.address ?? null, delivery_mode: mode as Order['delivery_mode'], customer_note: body.customer_note ?? null,
    delivery_fee: q.delivery_fee ?? 0, total: q.subtotal + (q.delivery_fee ?? 0),
  })
  d.orders.unshift(order)

  return reply({ data: { reference: order.reference, total: order.total } }, 201)
})

// ═══ admin: session ══════════════════════════════════════════════════════
route('POST', '/admin/login', 'public', ({ d, body }) => {
  const user = d.users.find((u) => u.username === String(body.username).trim() && u.is_active)
  if (!user || !String(body.password ?? '')) return fail(422, 'Identifiants incorrects.', { errors: { username: ['Identifiants incorrects.'] } })
  d.session = user.id
  user.last_login_at = now()

  return { data: user }
})
route('POST', '/admin/logout', 'public', ({ d }) => {
  d.session = null

  return reply(null, 204)
})
route('GET', '/admin/me', 'public', ({ d }) => ({ data: me(d) ?? fail(401, 'Unauthenticated.') }))
route('PUT', '/admin/me/password', 'auth', () => reply(null, 204))

// ═══ admin: orders ═══════════════════════════════════════════════════════
function filteredOrders(d: Db, q: Record<string, string>, withStatus = true) {
  const needle = plain(q.q)

  return d.orders.filter((o) => {
    if (withStatus && q.status && o.status !== q.status) return false
    if (q.channel && o.channel !== q.channel) return false
    if (q.from && ymd(new Date(o.created_at)) < q.from) return false
    if (q.to && ymd(new Date(o.created_at)) > q.to) return false
    if (q.wilaya_id && o.wilaya?.id !== Number(q.wilaya_id)) return false
    if (q.customer_id && o.customer.id !== Number(q.customer_id)) return false
    if (q.min_total && o.total < Number(q.min_total)) return false
    if (q.max_total && o.total > Number(q.max_total)) return false
    if (needle && ![o.reference, o.customer.first_name, o.customer.last_name, o.customer.phone].some((s) => plain(s).includes(needle))) return false

    return true
  })
}

function sortOrders(rows: Order[], q: Record<string, string>) {
  const dir = q.dir === 'asc' ? 1 : -1

  return [...rows].sort((a, b) => dir * (q.sort === 'total' ? a.total - b.total : a.created_at.localeCompare(b.created_at) || a.id - b.id))
}

route('GET', '/admin/orders/export', 'auth', ({ d, q }) => {
  const rows = sortOrders(filteredOrders(d, q), q).map((o) => [o.reference, o.created_at.slice(0, 10), present(d, o).status_label, `${o.customer.first_name ?? ''} ${o.customer.last_name ?? ''}`.trim(), o.customer.phone ?? '', o.wilaya?.name ?? '', o.total].join(';'))

  return new Blob([['Référence;Date;Statut;Client;Téléphone;Wilaya;Total', ...rows].join('\n')], { type: 'text/csv' })
})

route('GET', '/admin/orders', 'auth', ({ d, q }) => {
  const base = filteredOrders(d, q, false)
  const counts: Record<string, number> = { all: base.length }
  for (const o of base) counts[o.status] = (counts[o.status] ?? 0) + 1
  for (const s of Object.keys(d.actions)) counts[s] ??= 0
  const page = paginate(sortOrders(filteredOrders(d, q), q), Number(q.page ?? 1), Number(q.per_page ?? 20))

  return { ...page, data: page.data.map((o) => present(d, o)), counts }
})

route('GET', '/admin/orders/:id', 'auth', ({ d, p }) => ({ data: present(d, find(d.orders, p[0])) }))

const TARGET: Record<string, Order['status']> = { confirm: 'confirmee', cancel: 'annulee', ship: 'en_livraison', deliver: 'livree', return: 'retournee', sell_in_store: 'vendue_boutique', reopen: 'en_attente' }

route('POST', '/admin/orders/:id/transition', 'auth', ({ d, p, body }) => {
  const o = find(d.orders, p[0])
  const action = String(body.action)
  const user = userName(d)
  if (!d.actions[o.status]?.includes(action)) fail(422, `Cette action n'est pas possible pour une commande « ${present(d, o).status_label} ».`)

  if (action === 'no_answer') {
    o.call_attempts++
    o.history = [...(o.history ?? []), { from: o.status, to: o.status, note: body.note || 'Pas de réponse', user, at: now() }]

    return { data: present(d, o) }
  }

  const to = TARGET[action]
  const at = now()
  let note: string | null = body.note ?? null
  switch (action) {
    case 'confirm':
      assertStock(d, o)
      moveStock(d, o, -1, 'vente_en_ligne', user)
      o.stock_deducted = true
      o.confirmed_at = at
      break
    case 'cancel':
      if (o.stock_deducted) {
        moveStock(d, o, 1, 'annulation', user)
        o.stock_deducted = false
      }
      o.cancelled_at = at
      o.cancel_reason = body.reason ?? null
      note ??= body.reason ?? null
      break
    case 'ship':
      o.shipped_at = at
      o.delivery_company = body.delivery_company ?? null
      o.tracking_number = body.tracking_number ?? null
      break
    case 'deliver':
      o.delivered_at = at
      o.completed_at = at
      break
    case 'return':
      o.returned_at = at
      if (body.restock && o.stock_deducted) {
        moveStock(d, o, 1, 'retour', user)
        o.stock_deducted = false
        note ??= 'Remis en stock'
      } else note ??= 'Non remis en stock'
      break
    case 'sell_in_store':
      if (!o.stock_deducted) {
        assertStock(d, o)
        moveStock(d, o, -1, 'vente_caisse', user)
        o.stock_deducted = true
      }
      o.completed_at = at
      break
    case 'reopen': {
      o.cancelled_at = null
      o.cancel_reason = null
      o.confirmed_at = null
      note ??= 'Commande rouverte'
      const c = d.customers.find((x) => x.id === o.customer.id)
      if (c && c.cancelled_count > 0) c.cancelled_count--
      break
    }
  }
  history(o, to, user, note)
  o.status = to
  if (action !== 'reopen') bumpCounters(d, o, to)
  if (action === 'deliver' || action === 'sell_in_store') recordLoyalty(d, o)

  return { data: present(d, o) }
})

function applyClient(d: Db, o: Order, body: Body) {
  for (const k of ['first_name', 'last_name'] as const) if (body[k] !== undefined) o.customer[k] = body[k]
  if (body.phone !== undefined) {
    const phone = needPhone(body.phone)
    if (phone !== o.customer.phone) {
      const c = upsertCustomer(d, phone, o.customer.first_name ?? 'Client', o.customer.last_name ?? '', null, null, null)
      if (!o.customer.id) c.orders_count++
      o.customer.id = c.id
      o.customer.phone = phone
    }
  }
  if (body.phone2 !== undefined) o.customer.phone2 = normalizePhone(body.phone2)
  if (body.wilaya_id !== undefined) {
    const w = d.wilayas.find((x) => x.id === Number(body.wilaya_id))
    o.wilaya = w ? { id: w.id, name: w.name } : null
    o.commune = w ? (d.communes[w.id]?.find((c) => c.id === Number(body.commune_id)) ? { id: Number(body.commune_id), name: d.communes[w.id].find((c) => c.id === Number(body.commune_id))!.name } : null) : null
  }
  if (body.address !== undefined) o.address = body.address
  for (const k of ['admin_note', 'customer_note'] as const) if (body[k] !== undefined) o[k] = body[k]
  if (body.awaiting_stock !== undefined) o.awaiting_stock = Boolean(body.awaiting_stock)
  const c = d.customers.find((x) => x.id === o.customer.id)
  if (c) {
    c.first_name = o.customer.first_name ?? c.first_name
    c.last_name = o.customer.last_name ?? c.last_name
  }
}

route('PUT', '/admin/orders/:id', 'auth', ({ d, p, body }) => {
  const o = find(d.orders, p[0])
  applyClient(d, o, body)

  if (o.channel === 'pos' || ['livree', 'vendue_boutique', 'annulee', 'retournee', 'en_livraison'].includes(o.status)) {
    if (o.channel === 'pos' && body.payment_method) {
      o.payment_method = body.payment_method
      if (body.payment_method === 'especes') {
        o.amount_received = Number(body.amount_received ?? o.total)
        o.change_due = Math.max(0, o.amount_received - o.total)
      } else {
        o.amount_received = null
        o.change_due = null
      }
    }
    if (o.status === 'vendue_boutique' && o.customer.id) recordLoyalty(d, o)

    return { data: present(d, o) }
  }

  if (body.delivery_mode !== undefined) o.delivery_mode = body.delivery_mode
  if (body.lines) {
    if (o.stock_deducted) moveStock(d, o, 1, 'annulation', userName(d))
    o.items = (body.lines as { variant_id: number; quantity: number }[]).map((l) => newItem(d, Number(l.variant_id), Number(l.quantity)))
    if (o.stock_deducted) {
      assertStock(d, o)
      moveStock(d, o, -1, 'vente_en_ligne', userName(d))
    }
  }
  const subtotal = (o.items ?? []).reduce((n, i) => n + i.line_total, 0)
  o.subtotal = subtotal
  if (body.delivery_fee !== undefined) o.delivery_fee = Number(body.delivery_fee)
  if (body.discount !== undefined) o.discount = Number(body.discount)
  o.total = subtotal + o.delivery_fee - o.discount

  return { data: present(d, o) }
})

route('DELETE', '/admin/orders/:id', 'owner', ({ d, p }) => {
  const o = find(d.orders, p[0])
  if (!(o.channel === 'pos' || ['en_attente', 'annulee', 'retournee'].includes(o.status))) fail(422, 'Cette commande ne peut pas être supprimée : elle est en cours.')
  if (o.stock_deducted || o.channel === 'pos') moveStock(d, o, 1, 'annulation', userName(d))
  const c = d.customers.find((x) => x.id === o.customer.id)
  if (c && c.orders_count > 0) c.orders_count--
  d.orders = d.orders.filter((x) => x.id !== o.id)

  return reply(null, 204)
})

// ═══ admin: caisse ═══════════════════════════════════════════════════════
export function createPos(d: Db, body: Body, user: string | null, gift = false): Order {
  const lines = (body.lines ?? []) as { variant_id: number; quantity: number; unit_price?: number }[]
  if (lines.length === 0) fail(422, 'Le panier est vide.')
  const items = lines.map((l) => newItem(d, Number(l.variant_id), Number(l.quantity), l.unit_price === undefined ? undefined : Number(l.unit_price)))
  const draft = blankOrder(d, 'pos', 'vendue_boutique', items)
  const check = checkOrder(d, draft)
  if (!check.possible) fail(422, 'Stock insuffisant pour cette vente.', { shortages: check.shortages })

  const discount = Number(body.discount ?? 0)
  const payment = (body.payment_method ?? 'especes') as Order['payment_method']
  const total = Math.max(0, draft.subtotal - discount)
  const received = body.amount_received === undefined || body.amount_received === null ? null : Number(body.amount_received)
  if (payment === 'especes' && !gift && (received === null || received < total)) fail(422, 'Le montant reçu est inférieur au total.')

  const phone = body.phone ? needPhone(body.phone) : null
  const customer: Customer | undefined = phone ? upsertCustomer(d, phone, body.first_name ?? 'Client', body.last_name ?? 'Boutique', num(body.wilaya_id), num(body.commune_id), null) : undefined
  if (customer) customer.orders_count++

  Object.assign(draft, {
    customer: { id: customer?.id ?? null, first_name: body.first_name ?? null, last_name: body.last_name ?? null, phone, phone2: null },
    discount, total, payment_method: payment, amount_received: received, change_due: received === null ? null : Math.max(0, received - total),
    completed_at: now(), created_by: user, stock_deducted: true,
  })
  draft.history = [{ from: null, to: 'vendue_boutique', note: 'Vente en caisse', user, at: now() }]
  d.orders.unshift(draft)
  moveStock(d, draft, -1, 'vente_caisse', user)
  if (customer) bumpCounters(d, draft, 'vendue_boutique')
  if (customer && !gift) recordLoyalty(d, draft)

  return draft
}

route('POST', '/admin/pos/sales', 'auth', ({ d, body }) => reply({ data: present(d, createPos(d, body, userName(d))) }, 201))

// ═══ admin: products & taxonomy ══════════════════════════════════════════
const countProducts = (d: Db) => {
  for (const t of d.types) t.products_count = d.products.filter((p) => p.type?.id === t.id).length
  for (const b of d.brands) b.products_count = d.products.filter((p) => p.brand?.id === b.id).length
  for (const t of d.productTypes) {
    t.products_count = d.products.filter((p) => p.product_type?.id === t.id).length
    t.categories_count = d.types.filter((c) => c.product_type_id === t.id).length
  }
}

route('GET', '/admin/products', 'auth', ({ d, q }) => {
  const needle = plain(q.q)
  const kinds = q.kind ? q.kind.split(',') : null
  const rows = d.products
    .filter((p) => (!kinds || kinds.includes(p.kind)) && (!q.product_type_id || p.product_type?.id === Number(q.product_type_id)) && (!q.type_id || p.type?.id === Number(q.type_id)))
    .filter((p) => (q.active === undefined ? true : p.is_active === (q.active === '1')))
    .filter((p) => q.low_stock !== '1' || (p.kind !== 'pack' && checkLow(d, p)))
    .filter((p) => !needle || [p.name, p.brand?.name, p.inspired_by].some((s) => plain(s).includes(needle)))
    .sort((a, b) => b.id - a.id)

  return paginate(rows, Number(q.page ?? 1), Number(q.per_page ?? 30))
})

const checkLow = (d: Db, p: AdminProduct) => stockRows(d).find((r: StockRow) => r.product_id === p.id)?.status !== 'ok'

route('GET', '/admin/products/:id', 'auth', ({ d, p }) => ({ data: find(d.products, p[0]) }))

function writeProduct(d: Db, existing: AdminProduct | undefined, body: Body): AdminProduct {
  const typeRow = body.product_type_id ? d.productTypes.find((t) => t.id === Number(body.product_type_id)) : undefined
  const family = body.perfume_type_id ? d.types.find((t) => t.id === Number(body.perfume_type_id)) : undefined
  const brand = body.brand_id ? d.brands.find((b) => b.id === Number(body.brand_id)) : undefined
  if (!String(body.name ?? '').trim()) fail(422, 'Le nom est obligatoire.', { errors: { name: ['Le nom est obligatoire.'] } })

  const p: AdminProduct = existing ?? {
    id: nextId(d, 'product'), kind: body.kind === 'pack' ? 'pack' : typeRow?.profile ?? 'standard', name: '', slug: '', gender: null, inspired_by: null, short_description: null, description: null,
    notes_top: null, notes_heart: null, notes_base: null, image: null, images: [], stock_ml: 0, is_active: true, is_featured: false, sort_order: 0, available: false, variants: [],
  }
  p.name = String(body.name).trim()
  if (!existing || existing.name !== p.name) p.slug = uniqueSlug(p.name, (s) => d.products.some((x) => x.slug === s && x.id !== p.id))
  p.product_type = typeRow ? { id: typeRow.id, name: typeRow.name, slug: typeRow.slug, profile: typeRow.profile, uses_gender: typeRow.uses_gender } : null
  p.type = family ? { id: family.id, name: family.name, slug: family.slug, product_type_id: family.product_type_id } : null
  p.brand = brand ? { id: brand.id, name: brand.name } : null
  for (const k of ['gender', 'inspired_by', 'short_description', 'description', 'notes_top', 'notes_heart', 'notes_base'] as const) (p as any)[k] = body[k] ?? null
  p.is_active = Boolean(body.is_active)
  p.is_featured = Boolean(body.is_featured)
  if (brand && typeRow && !brand.product_type_ids?.includes(typeRow.id)) brand.product_type_ids = [...(brand.product_type_ids ?? []), typeRow.id]

  if (body.pack) {
    const comps = (body.pack.components as { variant_id: number; quantity: number }[]).map((c) => {
      const hit = findVariant(d, Number(c.variant_id)) ?? fail(422, 'Un produit du pack est introuvable.')

      return { variant_id: hit.v.id, product: hit.p.name, label: hit.v.label, quantity: Number(c.quantity), cost_price: hit.v.cost_price }
    })
    const cost = comps.every((c) => c.cost_price !== null) ? comps.reduce((n, c) => n + (c.cost_price ?? 0) * c.quantity, 0) : null
    const v = p.variants?.[0]
    const next: AdminVariant = { id: v?.id ?? nextId(d, 'variant'), label: 'Pack', ml: null, price: Number(body.pack.price), compare_at_price: num(body.pack.compare_at_price), cost_price: cost, stock_mode: 'pack', stock_qty: 0, sku: null, is_active: true, sort_order: 0, components: comps }
    p.variants = [next]
  } else if (Array.isArray(body.variants)) {
    const old = p.variants ?? []
    p.variants = (body.variants as Body[]).map((r, i) => {
      const prev = r.id ? old.find((x) => x.id === Number(r.id)) : undefined

      return {
        id: prev?.id ?? nextId(d, 'variant'), label: String(r.label), ml: num(r.ml), price: Number(r.price), compare_at_price: num(r.compare_at_price), cost_price: num(r.cost_price),
        stock_mode: r.stock_mode, stock_qty: prev?.stock_qty ?? 0, sku: prev?.sku ?? null, is_active: r.is_active !== false, sort_order: i, components: null,
      } as AdminVariant
    })
  }
  if (!existing) d.products.unshift(p)
  refreshAvailability(d)

  return p
}

route('POST', '/admin/products', 'owner', ({ d, body }) => reply({ data: writeProduct(d, undefined, body) }, 201))
route('PUT', '/admin/products/:id', 'owner', ({ d, p, body }) => ({ data: writeProduct(d, find(d.products, p[0]), body) }))
route('DELETE', '/admin/products/:id', 'owner', ({ d, p }) => {
  const product = find(d.products, p[0])
  d.products = d.products.filter((x) => x.id !== product.id)

  return reply(null, 204)
})

route('POST', '/admin/products/:id/images', 'owner', async ({ d, p, body }) => {
  const product = find(d.products, p[0])
  const file = body.image as File | undefined
  if (!file) return fail(422, 'Aucune image reçue.')
  const url = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
  const image = { id: nextId(d, 'image'), url, sort_order: (product.images?.length ?? 0) }
  product.images = [...(product.images ?? []), image]
  product.image = product.images[0].url

  return reply({ data: image }, 201)
})
route('PUT', '/admin/products/:id/images/order', 'owner', ({ d, p, body }) => {
  const product = find(d.products, p[0])
  const order = (body.ids as number[]) ?? []
  product.images = [...(product.images ?? [])].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)).map((im, i) => ({ ...im, sort_order: i }))
  product.image = product.images[0]?.url ?? null

  return reply(null, 204)
})
route('DELETE', '/admin/images/:id', 'owner', ({ d, p }) => {
  for (const product of d.products) {
    if (product.images?.some((i) => i.id === Number(p[0]))) {
      product.images = product.images.filter((i) => i.id !== Number(p[0]))
      product.image = product.images[0]?.url ?? null
    }
  }

  return reply(null, 204)
})

route('GET', '/admin/product-types', 'auth', ({ d }) => {
  countProducts(d)

  return { data: [...d.productTypes].sort((a, b) => a.sort_order - b.sort_order) }
})
route('POST', '/admin/product-types', 'owner', ({ d, body }) => {
  const row = { id: nextId(d, 'productType'), name: String(body.name), slug: uniqueSlug(String(body.name), (s) => d.productTypes.some((t) => t.slug === s)), profile: body.profile ?? 'standard', uses_gender: Boolean(body.uses_gender), sort_order: d.productTypes.length, is_active: true, products_count: 0, categories_count: 0 }
  d.productTypes.push(row)

  return reply({ data: row }, 201)
})
route('PUT', '/admin/product-types/:id', 'owner', ({ d, p, body }) => {
  const row = find(d.productTypes, p[0])
  Object.assign(row, Object.fromEntries(Object.entries(body).filter(([k]) => ['name', 'uses_gender', 'is_active', 'sort_order'].includes(k))))

  return { data: row }
})
route('DELETE', '/admin/product-types/:id', 'owner', ({ d, p }) => {
  const row = find(d.productTypes, p[0])
  if (d.products.some((x) => x.product_type?.id === row.id)) fail(422, 'Ce type contient des produits : masquez-le plutôt que de le supprimer.')
  d.productTypes = d.productTypes.filter((t) => t.id !== row.id)

  return reply(null, 204)
})

for (const kind of ['types', 'brands'] as const) {
  route('GET', `/admin/${kind}`, 'auth', ({ d }) => {
    countProducts(d)

    return { data: d[kind] }
  })
  route('POST', `/admin/${kind}`, 'owner', ({ d, body }) => {
    const name = String(body.name ?? '').trim()
    if (!name) fail(422, 'Le nom est obligatoire.', { errors: { name: ['Le nom est obligatoire.'] } })
    const row = { id: nextId(d, kind === 'types' ? 'type' : 'brand'), name, slug: uniqueSlug(name, (s) => d[kind].some((t) => t.slug === s)), sort_order: d[kind].length, is_active: true, products_count: 0, ...(kind === 'types' ? { product_type_id: num(body.product_type_id) ?? undefined } : { product_type_ids: (body.product_type_ids as number[]) ?? [] }) }
    d[kind].push(row)

    return reply({ data: row }, 201)
  })
  route('PUT', `/admin/${kind}/:id`, 'owner', ({ d, p, body }) => {
    const row = find(d[kind], p[0])
    for (const k of ['name', 'is_active', 'sort_order', 'product_type_id', 'product_type_ids']) if (body[k] !== undefined) (row as any)[k] = body[k]

    return { data: row }
  })
  route('DELETE', `/admin/${kind}/:id`, 'owner', ({ d, p }) => {
    const row = find(d[kind], p[0])
    countProducts(d)
    if (row.products_count > 0) fail(422, 'Impossible : des produits utilisent cet élément.')
    d[kind] = d[kind].filter((t) => t.id !== row.id)

    return reply(null, 204)
  })
}

// ═══ admin: stock ════════════════════════════════════════════════════════
route('GET', '/admin/stock', 'auth', ({ d, q }) => {
  const needle = plain(q.q)
  const data = stockRows(d)
    .filter((r) => (!q.status || r.status === q.status) && (!q.product_type_id || r.product_type?.id === Number(q.product_type_id)) && (!needle || plain(r.name).includes(needle) || plain(r.brand).includes(needle)))
    .filter((r) => !q.type_id || productOf(d, r.product_id)?.type?.id === Number(q.type_id))

  return { data, low_stock_threshold_ml: d.settings.low_stock_threshold_ml, low_stock_threshold_qty: d.settings.low_stock_threshold_qty }
})

route('GET', '/admin/stock/movements', 'auth', ({ d, q }) => {
  const rows = d.movements.filter((m) => (!q.product_id || m.product.id === Number(q.product_id)) && (!q.type || m.type === q.type) && (!q.from || ymd(new Date(m.created_at)) >= q.from) && (!q.to || ymd(new Date(m.created_at)) <= q.to))

  return paginate(rows, Number(q.page ?? 1), Number(q.per_page ?? 30))
})

function pushMovement(d: Db, type: string, productId: number, variantId: number | undefined, ml: number, qty: number, note: string | null, cost: number | null = null) {
  const p = productOf(d, productId)!
  d.movements.unshift({ id: nextId(d, 'movement'), type, product: { id: p.id, name: p.name }, variant: variantId ? { id: variantId, label: findVariant(d, variantId)?.v.label ?? '' } : null, ml_change: ml, qty_change: qty, unit_cost: cost, order: null, user: userName(d), note, created_at: now() })
}

route('POST', '/admin/stock/entries', 'owner', ({ d, body }) => {
  const p = find(d.products, body.product_id)
  const ml = Number(body.ml ?? 0)
  const qty = Number(body.qty ?? 0)
  if (ml <= 0 && qty <= 0) fail(422, 'La quantité à ajouter doit être positive.')
  const variant = body.variant_id ? p.variants?.find((v) => v.id === Number(body.variant_id)) : undefined
  p.stock_ml += ml
  if (variant) variant.stock_qty += qty
  pushMovement(d, 'entree', p.id, variant?.id, ml, qty, body.note ?? null, num(body.unit_cost))
  refreshAvailability(d)

  return reply(null, 201)
})

route('POST', '/admin/stock/adjustments', 'owner', ({ d, body }) => {
  const p = find(d.products, body.product_id)
  const ml = Number(body.ml_change ?? 0)
  const qty = Number(body.qty_change ?? 0)
  if (ml === 0 && qty === 0) fail(422, 'Aucune quantité à ajuster.')
  if (body.type === 'perte' && (ml > 0 || qty > 0)) fail(422, 'Une perte ne peut que diminuer le stock.')
  const variant = body.variant_id ? p.variants?.find((v) => v.id === Number(body.variant_id)) : undefined
  if (p.stock_ml + ml < 0 || (variant && variant.stock_qty + qty < 0)) fail(422, 'Le stock ne peut pas passer sous zéro.')
  p.stock_ml += ml
  if (variant) variant.stock_qty += qty
  pushMovement(d, body.type, p.id, variant?.id, ml, qty, body.note ?? null)
  refreshAvailability(d)

  return reply(null, 201)
})

route('POST', '/admin/stock/open-bottle', 'owner', ({ d, body }) => {
  const hit = findVariant(d, Number(body.variant_id)) ?? fail(404, 'Introuvable.')
  if (hit.v.stock_mode !== 'unit' || !hit.v.ml || hit.p.kind !== 'perfume') fail(422, 'Seul un flacon de parfum peut être ouvert.')
  if (hit.v.stock_qty < 1) fail(422, 'Aucun flacon scellé en stock.')
  const ml = hit.v.ml ?? 0
  hit.v.stock_qty--
  hit.p.stock_ml += ml
  pushMovement(d, 'ouverture_flacon', hit.p.id, hit.v.id, ml, -1, 'Flacon ouvert pour décanter')
  refreshAvailability(d)

  return reply(null, 201)
})

// ═══ admin: customers & loyalty ══════════════════════════════════════════
const emptyLoyalty = { every: LOYALTY_EVERY, counted: 0, total: 0, pending: [], given: 0 }

route('GET', '/admin/customers/search', 'auth', ({ d, q }) => {
  const needle = plain(q.q)
  const digits = (q.q ?? '').replace(/\D/g, '')

  return {
    data: d.customers.filter((c) => plain(`${c.first_name} ${c.last_name}`).includes(needle) || (digits.length >= 3 && c.phone.includes(digits))).slice(0, 8)
      .map((c) => ({ id: c.id, first_name: c.first_name, last_name: c.last_name, phone: c.phone, wilaya_id: c.wilaya_id, commune_id: c.commune_id, wilaya: c.wilaya, orders_count: c.orders_count })),
  }
})

route('GET', '/admin/loyalty', 'auth', ({ d, q }) => {
  const phone = normalizePhone(q.phone)
  const c = phone ? d.customers.find((x) => x.phone === phone) : undefined

  return { data: c ? { customer: { id: c.id, first_name: c.first_name, last_name: c.last_name }, loyalty: loyaltyOn(d) ? (d.loyalty[c.id]?.loyalty ?? emptyLoyalty) : null } : { customer: null, loyalty: null } }
})

route('GET', '/admin/customers', 'owner', ({ d, q }) => {
  const needle = plain(q.q)
  const digits = (q.q ?? '').replace(/\D/g, '')
  const rows = d.customers
    .filter((c) => (!q.blacklisted || c.is_blacklisted) && (!needle || plain(`${c.first_name} ${c.last_name}`).includes(needle) || (digits.length >= 3 && c.phone.includes(digits))))
    .sort((a, b) => (q.sort === 'created_at' ? b.created_at.localeCompare(a.created_at) : b.orders_count - a.orders_count || b.id - a.id))
    .map((c) => ({ ...c, loyalty: loyaltyOn(d) ? (d.loyalty[c.id]?.loyalty ?? emptyLoyalty) : null }))

  return paginate(rows, Number(q.page ?? 1), Number(q.per_page ?? 30))
})

route('PATCH', '/admin/customers/:id', 'owner', ({ d, p, body }) => {
  const c = find(d.customers, p[0])
  if (body.phone !== undefined) {
    const phone = needPhone(body.phone)
    if (d.customers.some((x) => x.phone === phone && x.id !== c.id)) fail(422, 'Ce numéro appartient déjà à un autre client.', { errors: { phone: ['Ce numéro appartient déjà à un autre client.'] } })
    c.phone = phone
  }
  for (const k of ['first_name', 'last_name', 'address', 'note', 'is_blacklisted', 'wilaya_id', 'commune_id'] as const) if (body[k] !== undefined) (c as any)[k] = body[k]
  if (body.wilaya_id !== undefined) c.wilaya = d.wilayas.find((w) => w.id === Number(body.wilaya_id))?.name ?? null

  return { data: c }
})

route('DELETE', '/admin/customers/:id', 'owner', ({ d, p }) => {
  const c = find(d.customers, p[0])
  for (const o of d.orders) if (o.customer.id === c.id) o.customer = { ...o.customer, id: null }
  d.customers = d.customers.filter((x) => x.id !== c.id)
  delete d.loyalty[c.id]

  return reply(null, 204)
})

route('GET', '/admin/customers/:id/loyalty', 'owner', ({ d, p }) => {
  const c = find(d.customers, p[0])
  const file = d.loyalty[c.id]
  if (!loyaltyOn(d)) return { data: { loyalty: null, history: [], tiers: [] } }

  return { data: { loyalty: file?.loyalty ?? emptyLoyalty, history: file?.history ?? [], tiers: file?.tiers ?? loyaltyFile(d, c.id).tiers } }
})

route('GET', '/admin/customers/:id/loyalty/suggestions', 'owner', ({ d, p }) => {
  const file = d.loyalty[find(d.customers, p[0]).id]
  const reward = loyaltyOn(d) ? file?.loyalty.pending[0] : undefined
  if (!reward) return { data: null }
  const avg = reward.average_price
  const from = Math.floor(avg * 0.75)
  const to = Math.ceil(avg * 1.25)
  const items = d.products
    .filter((x) => x.kind === 'perfume' && x.is_active)
    .flatMap((x) => (x.variants ?? []).filter((v) => v.is_active && (v.stock_mode === 'unit' || v.stock_mode === 'pool') && v.price >= from && v.price <= to && maxQtyOf(d, x, v) >= 1).map((v) => ({ variant_id: v.id, product: x.name, label: v.label, price: v.price, kind: v.stock_mode === 'unit' ? ('flacon' as const) : ('ml' as const), gap: v.price - avg })))
    .sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap))
    .slice(0, 12)

  return { data: { average: avg, from, to, items } }
})

route('POST', '/admin/customers/:id/loyalty/redeem', 'owner', ({ d, p, body }) => {
  const c = find(d.customers, p[0])
  if (!loyaltyOn(d)) fail(422, "Le programme de fidélité n'est pas activé.")
  const file = d.loyalty[c.id]
  const tier = file?.tiers.find((t) => t.complete && t.reward?.status === 'pending')
  if (!file || !tier?.reward) return fail(422, "Ce client n'a pas de cadeau disponible.")
  const hit = findVariant(d, Number(body.variant_id)) ?? fail(422, 'Article introuvable.')
  if (hit.p.kind !== 'perfume' || !['unit', 'pool'].includes(hit.v.stock_mode)) fail(422, 'Le cadeau doit être un parfum : un flacon ou une taille à décanter.')

  const order = createPos(d, { lines: [{ variant_id: hit.v.id, quantity: 1, unit_price: 0 }], payment_method: 'especes', amount_received: 0, phone: c.phone, first_name: c.first_name, last_name: c.last_name }, userName(d), true)
  order.admin_note = `Cadeau fidélité (${tier.perfumes.length} parfums achetés, valeur conseillée ${tier.average} DA)`
  tier.reward = { ...tier.reward, status: 'given', gift_name: `${hit.p.name} (${hit.v.label})`, gift_value: hit.v.price, given_at: now() }
  file.loyalty.pending = file.loyalty.pending.filter((x) => x.id !== tier.reward!.id)
  file.loyalty.given++

  return reply({ data: tier.reward }, 201)
})

// ═══ admin: dashboard, settings, wilayas, users ══════════════════════════
route('GET', '/admin/dashboard', 'owner', ({ d, q }) => ({ data: dashboard(d, q.from ?? ymd(new Date()), q.to ?? ymd(new Date())) }))

route('GET', '/admin/settings', 'owner', ({ d }) => ({ data: d.settings }))
route('PUT', '/admin/settings', 'owner', ({ d, body }) => {
  d.settings = { ...d.settings, ...body }

  return { data: d.settings }
})
route('GET', '/admin/wilayas', 'owner', ({ d }) => ({ data: d.wilayas }))
route('PUT', '/admin/wilayas/:id', 'owner', ({ d, p, body }) => {
  const w = find(d.wilayas, p[0])
  for (const k of ['home_fee', 'desk_fee', 'is_active'] as const) if (body[k] !== undefined) (w as any)[k] = body[k]

  return { data: w }
})

route('GET', '/admin/users', 'owner', ({ d }) => ({ data: d.users }))
route('POST', '/admin/users', 'owner', ({ d, body }) => {
  if (d.users.some((u) => u.username === body.username)) fail(422, "Cet identifiant est déjà pris.", { errors: { username: ["Cet identifiant est déjà pris."] } })
  const user = { id: nextId(d, 'user'), name: body.name, username: body.username, role: body.role ?? 'staff', is_active: body.is_active !== false, last_login_at: null }
  d.users.push(user)

  return reply({ data: user }, 201)
})
route('PUT', '/admin/users/:id', 'owner', ({ d, p, body }) => {
  const u = find(d.users, p[0])
  for (const k of ['name', 'username', 'role', 'is_active'] as const) if (body[k] !== undefined) (u as any)[k] = body[k]

  return { data: u }
})
route('DELETE', '/admin/users/:id', 'owner', ({ d, p }) => {
  if (Number(p[0]) === d.session) fail(422, 'Vous ne pouvez pas supprimer votre propre compte.')
  d.users = d.users.filter((u) => u.id !== Number(p[0]))

  return reply(null, 204)
})

// ═══ admin: decant bottles ═══════════════════════════════════════════════
route('GET', '/admin/bottles', 'owner', ({ d }) => {
  recomputeBottles(d)

  return { data: [...d.bottles].sort((a, b) => a.ml - b.ml), totals: bottleTotals(d) }
})
route('GET', '/admin/bottles/movements', 'owner', ({ d, q }) => ({ data: d.bottleMovements.filter((m) => !q.ml || m.ml === Number(q.ml)).slice(0, 100) }))

route('POST', '/admin/bottles/entries', 'owner', ({ d, body }) => {
  const ml = Number(body.ml)
  const quantity = Number(body.quantity)
  if (!(ml > 0) || !(quantity > 0)) fail(422, 'Indiquez la taille et la quantité.')
  let size = d.bottles.find((b) => b.ml === ml)
  if (!size) {
    size = { id: nextId(d, 'bottleSize'), ml, qty: 0, bought: 0, invested: 0, unit_cost: null, value_left: null, low: false }
    d.bottles.push(size)
  }
  size.qty += quantity
  size.bought += quantity
  size.invested += Number(body.total_cost ?? 0)
  d.bottleMovements.unshift({ id: nextId(d, 'bottleMovement'), editable: true, ml, type: 'entree', qty_change: quantity, total_cost: num(body.total_cost), order: null, user: userName(d), note: body.note ?? null, created_at: now() })
  recomputeBottles(d)

  return reply(null, 201)
})
route('POST', '/admin/bottles/adjustments', 'owner', ({ d, body }) => {
  const size = d.bottles.find((b) => b.ml === Number(body.ml)) ?? fail(422, "Cette taille n'est pas suivie.")
  const quantity = Number(body.quantity)
  if (size.qty + quantity < 0) fail(422, 'Le stock ne peut pas passer sous zéro.')
  size.qty += quantity
  d.bottleMovements.unshift({ id: nextId(d, 'bottleMovement'), editable: true, ml: size.ml, type: body.type, qty_change: quantity, total_cost: null, order: null, user: userName(d), note: body.note ?? null, created_at: now() })
  recomputeBottles(d)

  return reply(null, 201)
})
route('PUT', '/admin/bottles/movements/:id', 'owner', ({ d, p, body }) => {
  const m = find(d.bottleMovements, p[0])
  const size = d.bottles.find((b) => b.ml === m.ml)
  if (size) {
    size.qty = Math.max(0, size.qty + (Number(body.quantity) - m.qty_change))
    if (m.type === 'entree') {
      size.bought += Number(body.quantity) - m.qty_change
      size.invested += Number(body.total_cost ?? 0) - (m.total_cost ?? 0)
    }
  }
  m.qty_change = Number(body.quantity)
  m.total_cost = num(body.total_cost)
  m.note = body.note ?? null
  recomputeBottles(d)

  return reply(null, 204)
})
route('DELETE', '/admin/bottles/movements/:id', 'owner', ({ d, p }) => {
  const m = find(d.bottleMovements, p[0])
  const size = d.bottles.find((b) => b.ml === m.ml)
  if (size) {
    size.qty = Math.max(0, size.qty - m.qty_change)
    if (m.type === 'entree') {
      size.bought -= m.qty_change
      size.invested -= m.total_cost ?? 0
    }
  }
  d.bottleMovements = d.bottleMovements.filter((x) => x.id !== m.id)
  recomputeBottles(d)

  return reply(null, 204)
})
route('PUT', '/admin/bottles/:id', 'owner', ({ d, p, body }) => {
  const size = find(d.bottles, p[0])
  size.ml = Number(body.ml)
  for (const m of d.bottleMovements) if (m.ml === size.ml) m.ml = size.ml

  return reply(null, 204)
})
route('DELETE', '/admin/bottles/:id', 'owner', ({ d, p }) => {
  const size = find(d.bottles, p[0])
  d.bottles = d.bottles.filter((b) => b.id !== size.id)
  d.bottleMovements = d.bottleMovements.filter((m) => m.ml !== size.ml)

  return reply(null, 204)
})

// ═══ admin: CSV import (not in the demo) ═════════════════════════════════
route('POST', '/admin/imports/products', 'owner', () => fail(403, "L'import de fichiers CSV est désactivé dans la démo en ligne. Il est disponible dans la version livrée au client."))
route('GET', '/admin/imports/templates/:format', 'owner', () => new Blob(['nom;marque;famille;genre;prix_10ml;prix_20ml;prix_30ml\nSauvage;Dior;Designer;Homme;1500;2800;4000\n'], { type: 'text/csv' }))

// ═══ dispatch ════════════════════════════════════════════════════════════
export async function dispatch(method: string, path: string, query: Record<string, string>, body: Body, d: Db): Promise<Reply> {
  const hit = table.find((r) => r.method === method && r.re.test(path))
  if (!hit) return reply({ message: `Démo : « ${method} ${path} » n'est pas disponible.` }, 404)

  try {
    if (hit.access !== 'public') {
      const user = me(d) ?? fail(401, 'Unauthenticated.')
      if (hit.access === 'owner' && user.role !== 'owner') fail(403, 'Accès réservé au propriétaire.')
    }
    const out = await hit.run({ d, p: (path.match(hit.re) ?? []).slice(1).map(decodeURIComponent), q: query, body })
    if (method !== 'GET') persist()

    return out instanceof Blob ? reply(out) : out && typeof out === 'object' && 'status' in out && 'body' in out ? (out as Reply) : reply(out)
  } catch (e) {
    if (e instanceof ApiFail) return reply({ message: e.message, ...e.extra }, e.status)
    throw e
  }
}
