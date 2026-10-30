# Perfume Shop API

Laravel JSON API. Base URL in development: `http://localhost:8000/api`.
Amounts are **integers in DZD**. Messages are in French. Timestamps are stored in Algeria time (`Africa/Algiers`, UTC+1) and returned as UTC ISO strings. 54 operations; the complete, always-current list is generated from the code.

## Testing it

| Tool | How |
|---|---|
| **Swagger-style docs** | Start the server (`php artisan serve`) and open **http://localhost:8000/docs/api**. Every route, its fields and a "Try it" button. Local development only. |
| **Postman** | Import `docs/perfume-shop.postman_collection.json` (58 ready-made requests with example bodies). Or import `docs/openapi.json` for the full route list. |
| **curl / scripts** | See the examples below. |

### Signing in for the admin routes (Swagger and Postman)

The real frontend uses a cookie session. For testing tools there is a **local-only** shortcut that answers 404 outside development (`DEV_API_TOKENS`, on by default when `APP_ENV=local`):

```bash
curl -X POST http://localhost:8000/api/admin/token \
  -H "Content-Type: application/json" -H "Accept: application/json" \
  -d '{"username":"admin","password":"<ADMIN_PASSWORD from backend/.env>"}'
```

```json
{ "token": "1|VFbkOqDX...", "user": { "id": 1, "username": "admin", "role": "owner", ... } }
```

Send it on every admin request as `Authorization: Bearer <token>`.

- **Swagger page:** call `POST /admin/token` there, copy the token, click **Authorize**, paste it.
- **Postman:** fill the collection variable `password`, then run **0. Auth › Get token**. It stores the token for all other requests.

### The cookie flow (what the React app does)

1. `GET /sanctum/csrf-cookie`
2. `POST /api/admin/login` with `X-XSRF-TOKEN: <value of the XSRF-TOKEN cookie, URL-decoded>`
3. Then call any admin route with the same cookies.

The request must carry an `Origin` (or `Referer`) from `SANCTUM_STATEFUL_DOMAINS` (`localhost:3000`, `localhost:5173`, ...). Without it login answers `400` with an explanation. In the frontend, axios does all of this when `withCredentials` and `withXSRFToken` are on (already set in `src/lib/api.ts`).

## Conventions

- **Errors.** `422` `{ "message": "..." }` for business rules (stock, invalid transition, blacklisted phone...). Stock problems add `shortages`:
  ```json
  { "message": "Stock insuffisant pour : Sauvage (demandé 40 ml, disponible 8 ml)",
    "shortages": [{ "name": "Sauvage", "unit": "ml", "requested": 40, "available": 8 }] }
  ```
  Field validation errors use Laravel's format: `422` `{ "message": "...", "errors": { "phone": ["..."] } }`.
  `401` not signed in · `403` role or deactivated account · `404` not found · `429` rate limited.
- **Pagination.** Lists return `{ data, links, meta }` (`?page=2&per_page=20`). `meta.total` is the full count.
- **Roles.** `owner` does everything. `staff` handles orders, the caisse and reads the catalogue and stock (the **Staff** column below). Every other admin route answers `403` for staff.
- **Rate limits.** Placing an order: 5 per minute per IP. Login / token: 5 per minute per username + IP.

## Public routes (no authentication)

| Method | Route | Purpose |
|---|---|---|
| GET | `/settings/public` | Shop name, phone, socials, pickup on/off, free-delivery threshold |
| GET | `/types`, `/brands` | Active perfume families and cosmetic categories (`kind` tells them apart) / brands |
| GET | `/products` | Catalogue. `q, type, brand, gender, kind (one or several of perfume, cosmetic, pack, comma-separated), min_price, max_price, featured, sort (newest, price_asc, price_desc, name), per_page, page` |
| GET | `/products/{slug}` | Product page: notes, photos, variants with `available` and `max_qty`, pack `contains` |
| GET | `/wilayas` | Wilayas we deliver to, with `home_fee` and `desk_fee` |
| GET | `/wilayas/{id}/communes` | Communes of a wilaya |
| POST | `/cart/validate` | Re-price a cart; reports removed lines, availability, delivery fee and total |
| POST | `/orders` | Place an order (cash on delivery). Returns the `reference` |

The catalogue hides out-of-stock items unless the owner enabled `show_unavailable`; then they come back with `available: false`. Stock quantities are never exposed publicly.

**Place an order**

```bash
curl -X POST http://localhost:8000/api/orders -H "Content-Type: application/json" -H "Accept: application/json" -d '{
  "first_name": "Amine", "last_name": "Benali", "phone": "0550123456",
  "wilaya_id": 16, "address": "12 rue des Fleurs", "delivery_mode": "domicile",
  "lines": [{ "variant_id": 1, "quantity": 2 }]
}'
```
```json
{ "data": { "reference": "CMD-000001", "total": 3600, "delivery_fee": 600 } }
```

`delivery_mode`: `domicile`, `stop_desk` or `boutique` (pickup; no address or wilaya needed). Phones: `05/06/07` + 8 digits (`+213 550 12 34 56` also accepted). Prices and delivery fee are always recomputed on the server.

## Admin routes (`/api/admin/...`)

| Method | Route | Staff | Purpose |
|---|---|---|---|
| POST | `/login` | – | Cookie sign-in (see above) |
| POST | `/token` | – | Bearer token, **local only** |
| POST | `/logout` | ✅ | Sign out |
| GET | `/me` | ✅ | Current user |
| PUT | `/me/password` | ✅ | `current_password`, `password`, `password_confirmation` |
| GET | `/orders` | ✅ | List. Filters: `status, channel, from, to, wilaya_id, customer_id, min_total, max_total, q, sort (created_at, total), dir, per_page`. Also returns `counts` per status |
| GET | `/orders/export` | ✅ | CSV of the filtered list (UTF-8, `;` separated) |
| GET | `/orders/{id}` | ✅ | Detail: client, items, totals, history, `allowed_actions` |
| PUT | `/orders/{id}` | ✅ | Edit a pending/confirmed order (client info, `lines`, `delivery_fee`, `discount`, `admin_note`) |
| POST | `/orders/{id}/transition` | ✅ | Workflow action (below) |
| POST | `/pos/sales` | ✅ | Caisse sale |
| GET | `/products`, `/products/{id}` | ✅ | Catalogue with stock and hidden items. Filters: `q, kind (comma-separated), type_id, active, low_stock` |
| GET | `/types`, `/brands` | ✅ | With product counts |
| GET | `/stock`, `/stock/movements` | ✅ | Overview (`q, status ok/low/out`) and ledger (`product_id, variant_id, order_id, type, from, to`) |
| GET | `/dashboard` | | KPIs for `from`/`to` (default today): revenue split online / caisse, order counts, cancel rate, `sales_by_day` (each day has `revenue_online` and `revenue_pos`), `top_products`, `low_stock` |
| POST/PUT/DELETE | `/products`, `/products/{id}` | | Create / edit / hide perfumes, cosmetics and packs |
| POST | `/products/{id}/images` | | Upload a photo (`image`, multipart) |
| PUT | `/products/{id}/images/order` | | `{ "ids": [..] }`; the first becomes the main photo |
| DELETE | `/images/{id}` | | Delete a photo |
| POST/PUT/DELETE | `/types`, `/types/{id}`, `/brands`, `/brands/{id}` | | Refused while products use them (`types` takes a `kind`: `perfume` family or `cosmetic` category) |
| POST | `/stock/entries` | | Receive stock |
| POST | `/stock/adjustments` | | Correction or loss |
| POST | `/stock/open-bottle` | | Sealed bottle → decant pool |
| GET/PATCH | `/customers`, `/customers/{id}` | | List, blacklist, note |
| GET/PUT | `/settings` | | Shop settings |
| GET/PUT | `/wilayas`, `/wilayas/{id}` | | Delivery fees, switch a wilaya off |
| GET/POST/PUT/DELETE | `/users`, `/users/{id}` | | Admin accounts |

### Order workflow

`POST /admin/orders/{id}/transition` with `{ "action": ... }`:

| Action | From → To | Extra fields | Stock |
|---|---|---|---|
| `confirm` | en_attente → confirmee | | **taken out** (422 + `shortages` if short) |
| `no_answer` | en_attente (stays) | | counts a call attempt |
| `cancel` | en_attente / confirmee → annulee | `reason` | put back if it had been taken |
| `ship` | confirmee → en_livraison | `delivery_company`, `tracking_number` | |
| `deliver` | en_livraison → livree | | |
| `return` | en_livraison → retournee | `restock` (bool) | put back only if `restock` is true |
| `sell_in_store` | confirmee → vendue_boutique | | |
| `reopen` | annulee → en_attente | | none (it was put back when cancelled; confirming again takes it out) |

Anything else answers `422` (`Action « deliver » impossible pour une commande « En attente ».`). `allowed_actions` in the order tells the UI which buttons to show.

### Products

Perfume: several sizes, each with its own price. `stock_mode` `pool` = poured from the perfume's millilitre stock; `unit` = a sealed bottle counted on its own.

```json
POST /admin/products
{ "kind": "perfume", "name": "Oud Royal", "perfume_type_id": 3, "inspired_by": "Tom Ford Oud Wood",
  "variants": [
    { "label": "10 ml", "ml": 10, "price": 900, "stock_mode": "pool" },
    { "label": "20 ml", "ml": 20, "price": 1700, "stock_mode": "pool" },
    { "label": "Flacon complet 100 ml", "ml": 100, "price": 8000, "stock_mode": "unit" } ] }
```

Cosmetic: free-form options, each with its own price and stock. `unit` counts pieces (a shade, a box of 24, a 250 ml bottle); `pool` sells by the millilitre and then needs `ml`. A cosmetic has no gender, notes or "inspired by", and belongs to a cosmetic category.

```json
POST /admin/products
{ "kind": "cosmetic", "name": "Gel douche coco", "perfume_type_id": 9,
  "variants": [
    { "label": "250 ml", "price": 450, "stock_mode": "unit" },
    { "label": "500 ml", "price": 750, "stock_mode": "unit" } ] }
```

Pack (its components can be perfumes and cosmetics, mixed):

```json
{ "kind": "pack", "name": "Pack Découverte", "description": "Trois décants",
  "pack": { "price": 2200, "components": [{ "variant_id": 12, "quantity": 1 }, { "variant_id": 31, "quantity": 2 }] } }
```

- **Stock is not editable here**; use the stock routes.
- `PUT` replaces the full `variants` list: include `id` to update a size, omit a size to remove it (it is deactivated instead if it has orders, stock movements or pack membership).
- The slug is generated once and stays stable when the name changes.

### Stock

```json
POST /admin/stock/entries        { "product_id": 4, "ml": 200, "unit_cost": 5200, "note": "2 flacons à décanter" }
POST /admin/stock/entries        { "product_id": 4, "variant_id": 16, "qty": 3 }
POST /admin/stock/adjustments    { "product_id": 4, "type": "perte", "ml_change": -20, "note": "Flacon renversé" }
POST /admin/stock/open-bottle    { "variant_id": 16 }
GET  /admin/stock?kind=cosmetic&type_id=9&status=low
```

A cosmetic's pieces are received with `qty` and the `variant_id` of its option. `open-bottle` is for perfumes only. Cosmetics show as `low` at `low_stock_threshold_qty` units or fewer (a setting, 3 by default).

Receiving "2 bottles of 100 ml" for decanting is `ml: 200`. Every change is a row in the ledger (`/stock/movements`); the stock can never go below zero.

### Caisse

```json
POST /admin/pos/sales
{ "lines": [{ "variant_id": 3, "quantity": 2 }], "discount": 500, "payment_method": "especes",
  "amount_received": 6000, "first_name": "Walid", "phone": "0550999888" }
```

A line may carry `unit_price` to sell at another price than the catalogue's (a negotiated price): `{ "variant_id": 3, "quantity": 1, "unit_price": 1700 }`. The order item keeps both `unit_price` (charged) and `list_price` (catalogue). Online orders ignore any price sent by the client.

Returns the order with `total` and `change_due`. The sale is completed and the stock deducted in one step; if any item is short, nothing is recorded.

## Files

| File | What |
|---|---|
| `docs/openapi.json` | OpenAPI 3.1 spec, generated: `php artisan scramble:export --path=docs/openapi.json` |
| `docs/perfume-shop.postman_collection.json` | Postman collection, generated: `node docs/build-postman.mjs` |
| `/docs/api`, `/docs/api.json` | Live Swagger-style UI and spec (local development only) |

Regenerate both files after changing the API.
