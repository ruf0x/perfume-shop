// Takes the data of a LOCAL API running on the demo database (see deploy/DEMO.md) and writes it to
// src/demo/data/snapshot.json, the starting point of the static demo site.
//   node scripts/demo-snapshot.mjs [http://127.0.0.1:8001]
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const origin = process.argv[2] ?? 'http://127.0.0.1:8001'
const base = `${origin}/api`
let token = ''

async function call(url, options = {}) {
  const res = await fetch(`${base}${url}`, {
    ...options,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  })
  if (!res.ok) throw new Error(`${url} -> ${res.status} ${await res.text()}`)

  return res.json()
}

/** Every page of a paginated list. */
async function all(url, perPage = 100) {
  const rows = []
  for (let page = 1; ; page++) {
    const r = await call(`${url}${url.includes('?') ? '&' : '?'}per_page=${perPage}&page=${page}`)
    rows.push(...r.data)
    if (!r.meta || page >= r.meta.last_page) break
  }

  return rows
}

/** Runs the tasks a few at a time. */
async function pool(items, size, fn) {
  const out = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }))

  return out
}

const login = await call('/admin/token', { method: 'POST', body: JSON.stringify({ username: 'admin', password: 'demo1234' }) })
token = login.token

const snapshot = { generatedAt: new Date().toISOString() }
// The shop's own name and contact are replaced by the demo's (src/demo/db.ts): nothing of a client goes into the snapshot.
snapshot.settingsAdmin = { ...(await call('/admin/settings')).data, shop_name: 'Parfumerie Démo', shop_phone: null, shop_address: null, socials: {} }
snapshot.shopProductTypes = (await call('/product-types')).data
snapshot.productTypes = (await call('/admin/product-types')).data
snapshot.types = (await call('/admin/types')).data
snapshot.brands = (await call('/admin/brands')).data
snapshot.wilayas = (await call('/admin/wilayas')).data
snapshot.users = (await call('/admin/users')).data
snapshot.me = login.user

console.log('communes…')
snapshot.communes = {}
await pool(snapshot.wilayas, 8, async (w) => {
  snapshot.communes[w.id] = (await call(`/wilayas/${w.id}/communes`)).data
})

console.log('products…')
const productRows = await all('/admin/products')
snapshot.products = await pool(productRows, 8, async (p) => (await call(`/admin/products/${p.id}`)).data)

console.log('orders…')
const orderRows = await all('/admin/orders')
snapshot.orders = await pool(orderRows, 8, async (o) => (await call(`/admin/orders/${o.id}`)).data)

console.log('customers…')
snapshot.customers = await all('/admin/customers')
snapshot.loyalty = {}
await pool(snapshot.customers.filter((c) => c.loyalty && c.loyalty.total > 0), 8, async (c) => {
  snapshot.loyalty[c.id] = (await call(`/admin/customers/${c.id}/loyalty`)).data
})

console.log('stock…')
snapshot.movements = (await call('/admin/stock/movements?per_page=200&page=1')).data
snapshot.stockThresholds = (({ low_stock_threshold_ml, low_stock_threshold_qty }) => ({ low_stock_threshold_ml, low_stock_threshold_qty }))(await call('/admin/stock'))

console.log('bottles…')
snapshot.bottles = await call('/admin/bottles')
snapshot.bottleMovements = (await call('/admin/bottles/movements?per_page=100')).data

const file = path.join(import.meta.dirname, '..', 'src', 'demo', 'data', 'snapshot.json')
await mkdir(path.dirname(file), { recursive: true })
await writeFile(file, JSON.stringify(snapshot))
console.log(`${file}: ${snapshot.products.length} products, ${snapshot.orders.length} orders, ${snapshot.customers.length} customers, ${snapshot.movements.length} movements`)
