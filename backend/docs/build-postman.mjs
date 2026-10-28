// Builds docs/perfume-shop.postman_collection.json
//   node docs/build-postman.mjs
// Curated requests with realistic example bodies. The complete, always-current list of routes is
// docs/openapi.json (php artisan scramble:export --path=docs/openapi.json).
import { writeFileSync } from 'node:fs'

const json = [{ key: 'Content-Type', value: 'application/json' }]

const script = (...lines) => ({ listen: 'test', script: { type: 'text/javascript', exec: lines } })

function request(name, method, path, { query = {}, body, form, description, tests } = {}) {
  const parts = path.split('/').filter(Boolean)
  const q = Object.entries(query).map(([key, value]) => {
    const disabled = String(value).startsWith('~')
    return { key, value: disabled ? String(value).slice(1) : String(value), disabled }
  })
  const rawQuery = q.filter((p) => !p.disabled).map((p) => `${p.key}=${p.value}`).join('&')

  const req = {
    method,
    header: body ? json : [],
    url: { raw: `{{baseUrl}}/${parts.join('/')}${rawQuery ? `?${rawQuery}` : ''}`, host: ['{{baseUrl}}'], path: parts, query: q },
    description,
  }
  if (body) req.body = { mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } }
  if (form) req.body = { mode: 'formdata', formdata: form }

  return { name, request: req, event: tests ? [tests] : undefined }
}

const folder = (name, item, description) => ({ name, item, description })

const order = {
  first_name: 'Amine',
  last_name: 'Benali',
  phone: '0550123456',
  wilaya_id: 16,
  address: '12 rue des Fleurs, Bab El Oued',
  delivery_mode: 'domicile',
  customer_note: 'Appelez avant 18h',
  lines: [{ variant_id: '{{variantId}}', quantity: 2 }],
}

const transition = (label, body) => request(label, 'POST', 'api/admin/orders/{{orderId}}/transition', { body })

const collection = {
  info: {
    name: 'Perfume Shop API',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    description:
      'Run **0. Auth › Get token** first: it stores the Bearer token for every other request.\n' +
      'Token login only exists in local development. Variables (baseUrl, orderId, productId, variantId...) are on the collection.\n' +
      'Run **Orders › List orders** and **Products › List products** to fill `orderId` / `productId` automatically.',
  },
  auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] },
  variable: [
    { key: 'baseUrl', value: 'http://localhost:8000' },
    { key: 'username', value: 'admin' },
    { key: 'password', value: '' },
    { key: 'token', value: '' },
    { key: 'orderId', value: '1' },
    { key: 'productId', value: '1' },
    { key: 'variantId', value: '1' },
    { key: 'slug', value: 'sauvage' },
  ],
  event: [
    {
      listen: 'prerequest',
      script: { type: 'text/javascript', exec: ["pm.request.headers.upsert({ key: 'Accept', value: 'application/json' })"] },
    },
  ],
  item: [
    folder('0. Auth (run first)', [
      request('Get token', 'POST', 'api/admin/token', {
        body: { username: '{{username}}', password: '{{password}}' },
        description: 'Local development only. Fill the `password` collection variable first (the ADMIN_PASSWORD from backend/.env).',
        tests: script(
          "pm.test('logged in', () => pm.response.to.have.status(200))",
          "pm.collectionVariables.set('token', pm.response.json().token)",
        ),
      }),
      request('Me', 'GET', 'api/admin/me'),
      request('Change my password', 'PUT', 'api/admin/me/password', {
        body: { current_password: 'old-password', password: 'new-password-1', password_confirmation: 'new-password-1' },
      }),
    ]),

    folder('1. Storefront (public)', [
      request('Public settings', 'GET', 'api/settings/public'),
      request('Types', 'GET', 'api/types'),
      request('Brands', 'GET', 'api/brands'),
      request('Wilayas (with delivery fees)', 'GET', 'api/wilayas'),
      request('Communes of a wilaya', 'GET', 'api/wilayas/16/communes'),
      request('Products', 'GET', 'api/products', {
        query: { q: '~sauvage', type: '~arabe', brand: '~lattafa', gender: '~homme', kind: '~perfume', min_price: '~1000', max_price: '~5000', sort: 'newest', per_page: '12', page: '1' },
        description: 'Tick the query parameters you want. Sort: newest, price_asc, price_desc, name.',
        tests: script("const d = pm.response.json().data; if (d.length) pm.collectionVariables.set('slug', d[0].slug)"),
      }),
      request('Product page', 'GET', 'api/products/{{slug}}', {
        tests: script("const v = pm.response.json().data.variants; if (v.length) pm.collectionVariables.set('variantId', v[0].id)"),
      }),
      request('Validate cart', 'POST', 'api/cart/validate', {
        body: { lines: [{ variant_id: '{{variantId}}', quantity: 2 }], wilaya_id: 16, delivery_mode: 'domicile' },
        description: 'Re-prices the cart from the database. Prices sent by the client are ignored.',
      }),
      request('Place order', 'POST', 'api/orders', { body: order, description: 'Creates a pending order (5 per minute per IP). The `website` field is a honeypot: leave it out.' }),
    ]),

    folder('2. Orders', [
      request('List orders', 'GET', 'api/admin/orders', {
        query: { status: '~en_attente', channel: '~online', from: '~2026-01-01', to: '~2026-12-31', wilaya_id: '~16', min_total: '~1000', max_total: '~20000', q: '~Benali', sort: 'created_at', dir: 'desc', per_page: '20' },
        description: 'Response includes `counts` per status for the tabs. Tick the filters you want.',
        tests: script("const d = pm.response.json().data; if (d.length) pm.collectionVariables.set('orderId', d[0].id)"),
      }),
      request('Order detail', 'GET', 'api/admin/orders/{{orderId}}'),
      request('Edit order (pending or confirmed)', 'PUT', 'api/admin/orders/{{orderId}}', {
        body: { first_name: 'Yacine', delivery_fee: 400, discount: 200, admin_note: 'Le client a changé de taille', lines: [{ variant_id: '{{variantId}}', quantity: 3 }] },
      }),
      transition('Confirm (takes the stock out)', { action: 'confirm' }),
      transition("No answer (+1 call attempt)", { action: 'no_answer' }),
      transition('Cancel', { action: 'cancel', reason: 'Client injoignable' }),
      transition('Ship', { action: 'ship', delivery_company: 'Yalidine', tracking_number: 'YAL-123456' }),
      transition('Deliver', { action: 'deliver' }),
      transition('Return (put back in stock)', { action: 'return', restock: true }),
      transition('Sell in the shop', { action: 'sell_in_store' }),
      transition('Reopen a cancelled order', { action: 'reopen' }),
      request('Export CSV', 'GET', 'api/admin/orders/export', { query: { status: '~livree', from: '~2026-01-01' } }),
    ]),

    folder('3. Products', [
      request('List products (admin)', 'GET', 'api/admin/products', {
        query: { q: '~oud', kind: '~perfume', type_id: '~3', active: '~1', low_stock: '~1', per_page: '30' },
        tests: script("const d = pm.response.json().data; if (d.length) pm.collectionVariables.set('productId', d[0].id)"),
      }),
      request('Product detail (admin)', 'GET', 'api/admin/products/{{productId}}'),
      request('Create perfume', 'POST', 'api/admin/products', {
        body: {
          kind: 'perfume',
          name: 'Oud Royal',
          perfume_type_id: 3,
          gender: 'mixte',
          inspired_by: 'Tom Ford Oud Wood',
          short_description: 'Un oud profond et boisé.',
          notes_top: 'Cardamome',
          notes_heart: 'Oud',
          notes_base: 'Santal',
          variants: [
            { label: '10 ml', ml: 10, price: 900, stock_mode: 'pool' },
            { label: '20 ml', ml: 20, price: 1700, stock_mode: 'pool' },
            { label: 'Flacon complet 100 ml', ml: 100, price: 8000, stock_mode: 'unit' },
          ],
        },
        description: 'Stock cannot be set here: use Stock › Receive stock.',
      }),
      request('Create pack', 'POST', 'api/admin/products', {
        body: { kind: 'pack', name: 'Pack Découverte', description: 'Trois décants pour découvrir.', pack: { price: 2200, components: [{ variant_id: '{{variantId}}', quantity: 1 }] } },
      }),
      request('Update product (sizes and prices)', 'PUT', 'api/admin/products/{{productId}}', {
        body: { name: 'Oud Royal Prestige', is_featured: true, variants: [{ label: '10 ml', ml: 10, price: 1000, stock_mode: 'pool' }] },
        description: 'Send the full list of `variants`; include `id` to update an existing size. Sizes left out are removed (or deactivated if they have history).',
      }),
      request('Delete product', 'DELETE', 'api/admin/products/{{productId}}'),
      request('Upload photo', 'POST', 'api/admin/products/{{productId}}/images', {
        form: [{ key: 'image', type: 'file', src: [] }],
        description: 'jpg / png / webp, 5 MB max. Resized to 1200 px and stored as WebP.',
      }),
      request('Reorder photos', 'PUT', 'api/admin/products/{{productId}}/images/order', { body: { ids: [2, 1] } }),
      request('Delete photo', 'DELETE', 'api/admin/images/1'),
    ]),

    folder('4. Types and brands', [
      request('List types', 'GET', 'api/admin/types'),
      request('Create type', 'POST', 'api/admin/types', { body: { name: 'Oud Prestige' } }),
      request('Update type', 'PUT', 'api/admin/types/1', { body: { name: 'Designer', is_active: true } }),
      request('Delete type', 'DELETE', 'api/admin/types/1'),
      request('List brands', 'GET', 'api/admin/brands'),
      request('Create brand', 'POST', 'api/admin/brands', { body: { name: 'Rasasi' } }),
      request('Update brand', 'PUT', 'api/admin/brands/1', { body: { name: 'Rasasi' } }),
      request('Delete brand', 'DELETE', 'api/admin/brands/1'),
    ]),

    folder('5. Stock', [
      request('Stock overview', 'GET', 'api/admin/stock', { query: { q: '~sauv', status: '~low' } }),
      request('Movements (ledger)', 'GET', 'api/admin/stock/movements', { query: { product_id: '~{{productId}}', type: '~vente_en_ligne', from: '~2026-01-01', per_page: '50' } }),
      request('Receive stock (ml)', 'POST', 'api/admin/stock/entries', {
        body: { product_id: '{{productId}}', ml: 200, unit_cost: 5200, note: '2 flacons de 100 ml à décanter' },
      }),
      request('Receive sealed bottles', 'POST', 'api/admin/stock/entries', { body: { product_id: '{{productId}}', variant_id: '{{variantId}}', qty: 3 } }),
      request('Adjustment / loss', 'POST', 'api/admin/stock/adjustments', { body: { product_id: '{{productId}}', type: 'perte', ml_change: -20, note: 'Flacon renversé' } }),
      request('Open a sealed bottle', 'POST', 'api/admin/stock/open-bottle', { body: { variant_id: '{{variantId}}' } }),
    ]),

    folder('6. Caisse (POS)', [
      request('Record a sale', 'POST', 'api/admin/pos/sales', {
        body: { lines: [{ variant_id: '{{variantId}}', quantity: 1 }], discount: 0, payment_method: 'especes', amount_received: 2000, first_name: 'Walid', phone: '0550999888' },
        description: 'Completed immediately; stock is deducted at once. The response has `change_due`.',
      }),
    ]),

    folder('7. Dashboard, customers, settings, users', [
      request('Dashboard', 'GET', 'api/admin/dashboard', { query: { from: '2026-10-01', to: '2026-10-31' } }),
      request('Customers', 'GET', 'api/admin/customers', { query: { q: '~Benali', blacklisted: '~1', sort: 'orders_count' } }),
      request('Blacklist a customer', 'PATCH', 'api/admin/customers/1', { body: { is_blacklisted: true, note: 'Faux ordres' } }),
      request('Get settings', 'GET', 'api/admin/settings'),
      request('Save settings', 'PUT', 'api/admin/settings', {
        body: { shop_name: 'Parfumerie Elégance', show_unavailable: false, low_stock_threshold_ml: 10, store_pickup_enabled: true, free_delivery_over: 8000 },
      }),
      request('Wilayas (fees)', 'GET', 'api/admin/wilayas'),
      request('Edit a wilaya fee', 'PUT', 'api/admin/wilayas/16', { body: { home_fee: 450, desk_fee: 300, is_active: true } }),
      request('List users', 'GET', 'api/admin/users'),
      request('Create user', 'POST', 'api/admin/users', { body: { name: 'Karim', username: 'karim', password: 'long-password', role: 'staff' } }),
      request('Update user', 'PUT', 'api/admin/users/2', { body: { is_active: false } }),
      request('Delete user', 'DELETE', 'api/admin/users/2'),
    ]),
  ],
}

writeFileSync(new URL('./perfume-shop.postman_collection.json', import.meta.url), JSON.stringify(collection, null, 2))
const count = (items) => items.reduce((n, i) => n + (i.item ? count(i.item) : 1), 0)
console.log(`Postman collection written: ${count(collection.item)} requests`)
