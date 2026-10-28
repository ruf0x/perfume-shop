# Perfume Shop — Project Plan

Web app for a perfume shop (Algeria): a public catalogue where clients build a cart and place a cash-on-delivery order, plus an admin dashboard for orders, products, stock, packs and an in-shop cash register (caisse).

---

## 1. Tech stack decision

### Hosting constraint
The target host is **cPanel shared hosting** (PHP 8.4, MariaDB, Node 22 *CommonJS only*, Python via Passenger, 1 GB RAM, terminal + Composer + Git, cron).

| Option | Fits cPanel? | Verdict |
|---|---|---|
| **Laravel (PHP) + MariaDB** | Native. PHP is what cPanel is built for. Composer, cron, `.htaccess` all available. | ✅ **Chosen backend** |
| Django (Python) | Works through Passenger, but setup/debugging on shared hosting is painful, static/media handling is extra work. | ❌ |
| Node/Express | "CommonJS only" + process limits on 1 GB RAM. | ❌ |
| **React + Vite SPA (static build)** | Build on your PC, upload `dist/` — it's just HTML/JS/CSS. | ✅ **Chosen frontend** |
| Next.js | `next start` needs a long-running Node process (bad on shared hosting). `output: 'export'` works but every new product would need a rebuild/redeploy, and you lose the parts of Next that are worth it (SSR, ISR). | ❌ for now |

### Final stack

**Backend — `backend/`**
- Laravel 12, PHP 8.3+
- MariaDB (MySQL driver)
- Laravel Sanctum (cookie-based SPA auth for the admin)
- `intervention/image` (resize + convert uploaded photos to WebP, using GD)
- Form Requests for validation, API Resources for JSON output
- Pest for tests

**Frontend — `frontend/`**
- React 19 + Vite + TypeScript
- Tailwind CSS v4 + shadcn/ui (admin tables, dialogs, forms)
- React Router (shop routes + lazy-loaded `/admin` routes, one app)
- TanStack Query (server data), Zustand + `persist` (cart in localStorage)
- react-hook-form + zod (forms), axios
- Recharts (dashboard charts)
- i18n ready: French first, Arabic (RTL) later via `react-i18next`

**Domains on the host**
- `monshop.dz` → `public_html/` = React build (`frontend/dist`)
- `api.monshop.dz` (subdomain) → `laravel/public` (Laravel code lives **outside** `public_html`)
- Same parent domain ⇒ Sanctum cookie auth works (`SESSION_DOMAIN=.monshop.dz`).

> Alternative with zero CORS: put Laravel under `monshop.dz/api` with an `.htaccess` rewrite. Subdomain is cleaner; pick one in phase 7.

---

## 2. Features

### 2.1 Public shop (clients)
- Home: hero, featured perfumes, new arrivals, packs, filter by type.
- Catalogue: search by name/brand, filter by type (Designer / Niche / Arabic / Dupe / House-made…), gender, price range, sort (new, price ↑↓, popular).
- Product page: photos, description, olfactory notes, "inspired by" (for dupes), **choose a size/variant** (10 ml, 20 ml, 30 ml, full bottle 100 ml…) — each with its own price; quantity; add to cart.
- Packs page: bundles with description, contents and a pack price.
- Availability: if admin setting `show_unavailable = false`, hide items under the threshold; if `true`, show them greyed with "Rupture de stock" and disable add-to-cart. Variants that need more ml than available are disabled individually.
- Cart (localStorage): change qty, remove, subtotal.
- Checkout (no account needed): Nom, Prénom, Téléphone (+ optional 2nd phone), Wilaya (select), Baladiya/Commune (select filtered by wilaya), Adresse, delivery mode (domicile / stop-desk / retrait en boutique), note. Delivery fee is computed from the wilaya + mode. Shows total → **Lancer la commande**.
- Confirmation page with the order reference (e.g. `CMD-000123`) and "we will call you to confirm".
- Anti-fake-orders: Algerian phone validation (`^0[5-7][0-9]{8}$`), rate limit per IP, honeypot field, blacklisted phones refused.

### 2.2 Admin (`/admin`, username + password)
1. **Dashboard** — today / this month: orders, revenue (online + caisse), pending to call, in delivery; chart of sales per day; top perfumes; **low-stock alerts**.
2. **Commandes** — one page with **status tabs** (Toutes · En attente · Confirmées · En livraison · Livrées · Vendues en boutique · Annulées · Retournées) + filters: date range, wilaya, price range, search (ref / name / phone), sort by date or total. Pagination.
   - Order detail drawer: client info (nom, prénom, phones as `tel:` links, wilaya, baladiya, adresse), items (name, variant, ml, unit price, qty, line total), subtotal, delivery fee, discount, total, status history timeline, admin notes, "call attempts" counter (Ne répond pas +1).
   - Actions depend on status (see state machine). Admin can edit an order while it is pending/confirmed (items, qty, delivery fee, discount) because clients often change their mind on the phone.
   - Print / export: order slip (bon de commande), CSV export of the filtered list.
3. **Produits (CRUD)** — name, brand, type, gender, description, notes, "inspired by", photos (main + gallery), active/featured flags, **variants** (label, ml, price, optional sale price, mode: from ml pool or sealed unit), stock summary.
4. **Types** — CRUD perfume types (Designer, Niche, Arabic, Dupe, Création maison…). Admin can add new ones.
5. **Marques** — CRUD brands (optional field on products).
6. **Packs (CRUD)** — name, description, photo, price, contents (list of product variants × qty). Stock of a pack = what its components allow.
7. **Stock** — current stock per perfume (ml in the pool + sealed bottles), **entrée de stock** (we received 2 × 100 ml of X ⇒ +200 ml, with optional purchase cost), manual adjustment (loss, spill, tester, correction) with a reason, full movement history (who, when, why, which order).
8. **Caisse (POS)** — quick product search / grid, pick variant, cart, discount, payment method (espèces / carte / CCP-BaridiMob), amount received → change. Validating creates a completed sale and decrements stock immediately. Receipt print (80 mm thermal friendly).
9. **Clients** — list built from orders (phone is the key): total orders, delivered/cancelled/returned counts, blacklist toggle.
10. **Paramètres** — shop name, phones, socials, `show_unavailable` toggle, low-stock threshold (default 10 ml), delivery fees per wilaya (domicile / stop-desk / active), store-pickup on/off, admin accounts & password change.

---

## 3. Business rules

### 3.1 Stock model (the important part)
A perfume is often bought as full bottles and sold either **as decants** (10/20/30 ml poured from a bottle) or **as full sealed bottles**. So stock is tracked in two ways:

- **ml pool** per product (`products.stock_ml`): total liquid available for decants.
  - Entrée: "2 bottles × 100 ml" ⇒ `+200 ml`.
  - Selling a variant of 20 ml × 2 ⇒ `−40 ml`.
- **Sealed unit stock** per variant (`product_variants.stock_qty`), only for variants with `stock_mode = 'unit'` (e.g. "Flacon complet 100 ml – scellé"). Selling 1 ⇒ `−1` unit, the ml pool is untouched.
- Admin can **open** a sealed bottle into the pool: `−1 unit`, `+100 ml` (one action, two movements).

**Availability**
- Pool variant available ⇔ `product.stock_ml ≥ variant.ml × qty`.
- Unit variant available ⇔ `variant.stock_qty ≥ qty`.
- Product "available" (for the public list) ⇔ `stock_ml ≥ settings.low_stock_threshold_ml` (default 10) **or** any unit variant has `stock_qty > 0`.
- Pack available ⇔ every component is available in the needed amount.

**Every change goes through `stock_movements`** (never edit the stock number directly). `products.stock_ml` and `product_variants.stock_qty` are cached totals updated in the same DB transaction, with row locks (`lockForUpdate`) to avoid overselling.

### 3.2 When is stock deducted?
- **Online order**: deducted when the admin clicks **Confirmer** (he prepares/pours the decant at that moment). Pending orders don't block stock (avoids fake orders locking stock), but confirmation fails with a clear message if stock is insufficient.
- **Annulée after confirmation** ⇒ stock restored automatically.
- **Retournée** (delivery failed) ⇒ dialog "Remettre en stock ?" (sealed bottles yes; poured decants usually no ⇒ recorded as loss).
- **Caisse sale** ⇒ deducted immediately.

### 3.3 Order state machine

```
                ┌──────────► annulee (cancelled)
                │                 ▲
 en_attente ────┤                 │ (cancel, restores stock)
 (pending)      │                 │
                └──► confirmee ───┼──► vendue_boutique (sold / picked up in shop)   [final]
                     (confirmed)  │
                                  └──► en_livraison ──► livree (delivered)          [final]
                                       (shipping)   └─► retournee (returned)        [final]
```

| From | Action (button) | To |
|---|---|---|
| en_attente | Confirmer | confirmee (stock −) |
| en_attente | Annuler (reason) | annulee |
| en_attente | Ne répond pas | en_attente (call_attempts +1) |
| confirmee | Vendue en boutique | vendue_boutique |
| confirmee | Expédier (optional: delivery company + tracking no.) | en_livraison |
| confirmee | Annuler | annulee (stock +) |
| en_livraison | Livrée | livree |
| en_livraison | Retour | retournee (optional stock +) |

Caisse sales are stored as orders with `channel = 'pos'` and status `vendue_boutique` directly, so all revenue stats come from one table.

Revenue counts only `livree` + `vendue_boutique`.

### 3.4 Money
All amounts in **DZD as integers** (no decimals). Prices on order items are **snapshots** (changing a product price later never changes old orders).

---

## 4. Database schema (MariaDB)

Conventions: `id BIGINT UNSIGNED` PK, `created_at/updated_at` on every table, soft deletes on products/packs/brands/types (so old orders keep their references).

### `users` (admins)
| column | type | notes |
|---|---|---|
| id | bigint PK | |
| name | varchar(100) | |
| username | varchar(50) unique | login |
| password | varchar | bcrypt |
| role | enum('owner','staff') | staff: orders + caisse only |
| is_active | bool default 1 | |
| last_login_at | timestamp null | |

### `perfume_types`
| id | name varchar(60) unique | slug unique | sort_order int | is_active bool | deleted_at |
Seed: Designer, Niche, Arabe, Dupe, Création maison.

### `brands`
| id | name varchar(100) unique | slug unique | logo null | deleted_at |

### `products`
| column | type | notes |
|---|---|---|
| id | bigint PK | |
| kind | enum('perfume','pack') | packs live in the same table (simpler cart, catalogue, orders) |
| name | varchar(150) | |
| slug | varchar(170) unique | |
| brand_id | FK null → brands | |
| perfume_type_id | FK null → perfume_types | null for packs |
| gender | enum('homme','femme','mixte') null | |
| inspired_by | varchar(150) null | for dupes: "Inspiré de Sauvage – Dior" |
| short_description | varchar(255) null | |
| description | text null | |
| notes_top / notes_heart / notes_base | varchar(255) null | olfactory pyramid |
| main_image | varchar null | path |
| stock_ml | int unsigned default 0 | cached ml pool (perfumes only) |
| is_active | bool default 1 | hidden from shop if 0 |
| is_featured | bool default 0 | home page |
| sort_order | int default 0 | |
| deleted_at | timestamp null | |

Indexes: `(kind, is_active)`, `perfume_type_id`, `brand_id`, fulltext `(name, inspired_by)`.

### `product_images`
| id | product_id FK | path | sort_order |

### `product_variants`
| column | type | notes |
|---|---|---|
| id | bigint PK | |
| product_id | FK → products cascade | |
| label | varchar(60) | "10 ml", "Flacon complet 100 ml", "Pack" |
| ml | int unsigned null | ml consumed per unit (pool mode) / bottle size (unit mode) |
| price | int unsigned | DZD |
| compare_at_price | int unsigned null | old price shown crossed |
| stock_mode | enum('pool','unit','pack') | pool = from `products.stock_ml`; unit = own `stock_qty`; pack = from components |
| stock_qty | int unsigned default 0 | only for `unit` |
| sku | varchar(50) null unique | |
| is_active | bool default 1 | |
| sort_order | int | |

A pack has exactly one variant (`stock_mode = 'pack'`, price = pack price).

### `pack_items`
| id | pack_variant_id FK → product_variants | component_variant_id FK → product_variants | quantity int |

### `stock_movements` (ledger — source of truth)
| column | type | notes |
|---|---|---|
| id | bigint PK | |
| product_id | FK | |
| variant_id | FK null | set for unit-mode movements |
| type | enum('entree','vente_en_ligne','vente_caisse','annulation','retour','ajustement','perte','ouverture_flacon') | |
| ml_change | int (signed) default 0 | |
| qty_change | int (signed) default 0 | |
| unit_cost | int unsigned null | purchase cost (for margin later) |
| order_id | FK null | |
| user_id | FK null | who did it |
| note | varchar(255) null | |
| created_at | timestamp | |

### `wilayas`
| id (official code 1..58/69) | code char(2) | name | name_ar | home_fee int | desk_fee int | is_active bool |

### `communes` (baladiyas)
| id | wilaya_id FK | name | name_ar | postal_code null |

Seed from an open dataset (e.g. the `othmanus/algeria-cities` JSON on GitHub — verify it is up to date with the current number of wilayas before seeding).

### `customers`
| id | phone varchar(15) unique | first_name | last_name | wilaya_id null | commune_id null | address null | orders_count int | delivered_count int | cancelled_count int | returned_count int | is_blacklisted bool | note null |
Upserted by phone on each order.

### `orders`
| column | type | notes |
|---|---|---|
| id | bigint PK | |
| reference | varchar(20) unique | `CMD-000123` / `POS-000045` |
| channel | enum('online','pos') | |
| status | enum('en_attente','confirmee','annulee','en_livraison','livree','retournee','vendue_boutique') | |
| customer_id | FK null | |
| first_name, last_name | varchar(80) | snapshot |
| phone, phone2 | varchar(15) | |
| wilaya_id | FK null | |
| commune_id | FK null | |
| address | varchar(255) null | |
| delivery_mode | enum('domicile','stop_desk','boutique') null | |
| customer_note | text null | |
| admin_note | text null | |
| subtotal | int unsigned | |
| delivery_fee | int unsigned default 0 | |
| discount | int unsigned default 0 | |
| total | int unsigned | |
| payment_method | enum('cod','especes','carte','ccp') | online = cod |
| amount_received | int null | caisse |
| call_attempts | tinyint default 0 | |
| delivery_company | varchar(50) null | Yalidine, ZR Express… |
| tracking_number | varchar(60) null | |
| stock_deducted | bool default 0 | guards double deduction/restore |
| cancel_reason | varchar(255) null | |
| confirmed_at, shipped_at, delivered_at, completed_at, cancelled_at, returned_at | timestamp null | |
| created_by | FK null → users | caisse/admin-created orders |
| ip_address | varchar(45) null | anti-spam |

Indexes: `(status, created_at)`, `(channel, created_at)`, `phone`, `wilaya_id`, `total`.

### `order_items`
| id | order_id FK cascade | product_id FK null | variant_id FK null | product_name (snapshot) | variant_label (snapshot) | ml null | unit_price int | quantity int | line_total int |

### `order_status_history`
| id | order_id FK | from_status null | to_status | user_id null | note null | created_at |

### `settings` (key/value)
| key varchar(60) PK | value text (JSON) |
Keys: `shop_name`, `shop_phone`, `shop_address`, `socials`, `show_unavailable` (bool), `low_stock_threshold_ml` (10), `store_pickup_enabled`, `free_delivery_over` (null|int), `order_reference_counter`.

### Laravel default tables
`sessions`, `cache`, `jobs`, `personal_access_tokens` (Sanctum), `password_reset_tokens`.

### ER overview
```
perfume_types 1─* products *─1 brands
products 1─* product_variants 1─* pack_items (as pack) / (as component)
products 1─* product_images
products 1─* stock_movements *─1 orders
wilayas 1─* communes
customers 1─* orders 1─* order_items *─1 product_variants
orders 1─* order_status_history *─1 users
```

---

## 5. API (Laravel, JSON, prefix `/api`)

### Public
| Method | Route | Purpose |
|---|---|---|
| GET | `/settings/public` | shop info, show_unavailable, pickup enabled |
| GET | `/types` | active perfume types |
| GET | `/brands` | brands |
| GET | `/products` | `?q, type, brand, gender, kind, min_price, max_price, sort, page` — respects availability setting |
| GET | `/products/{slug}` | detail + variants with `available` / `max_qty` |
| GET | `/wilayas` | with fees |
| GET | `/wilayas/{id}/communes` | |
| POST | `/cart/validate` | re-price cart lines, return availability + delivery fee + total |
| POST | `/orders` | place order (throttle 5/min/IP, honeypot, phone regex, blacklist) → `{reference}` |

### Admin (`auth:sanctum`, prefix `/api/admin`)
| Method | Route | Purpose |
|---|---|---|
| GET | `/sanctum/csrf-cookie` (root) | CSRF cookie |
| POST | `/login`, `/logout`, GET `/me` | auth (throttle login 5/min) |
| GET | `/dashboard?from&to` | KPIs, sales per day, top products, low stock |
| GET | `/orders` | `?status, channel, from, to, wilaya, min_total, max_total, q, sort, per_page` + counts per status |
| GET | `/orders/{id}` | detail + history |
| PUT | `/orders/{id}` | edit items/fees/discount/notes (pending/confirmed only) |
| POST | `/orders/{id}/transition` | `{action: confirm|cancel|no_answer|ship|deliver|return|sell_in_store, note, restock, tracking_number, delivery_company}` |
| GET | `/orders/export` | CSV |
| CRUD | `/products` (+ `POST /products/{id}/images`, `DELETE /images/{id}`) | perfumes & packs, variants nested in payload |
| CRUD | `/types`, `/brands` | |
| GET | `/stock` | stock overview per product |
| GET | `/stock/movements` | ledger with filters |
| POST | `/stock/entries` | `{product_id, variant_id?, ml?, qty?, unit_cost?, note}` |
| POST | `/stock/adjustments` | `{…, type: ajustement|perte, ml_change, qty_change, note}` |
| POST | `/stock/open-bottle` | unit → pool |
| POST | `/pos/sales` | caisse sale |
| GET | `/customers`, PATCH `/customers/{id}` | list, blacklist |
| GET/PUT | `/settings` | |
| PUT | `/wilayas/{id}` | fees / active |
| CRUD | `/users` (owner only), PUT `/me/password` | |

All stock-changing logic lives in **one service** (`App\Services\StockService`) and all status logic in `App\Services\OrderWorkflow` — controllers stay thin.

---

## 6. Frontend routes

```
/                       Home
/boutique               Catalogue (filters in query string)
/parfum/:slug           Product page
/packs                  Packs
/panier                 Cart
/commande               Checkout
/commande/merci/:ref    Thank-you

/admin/login
/admin                  Dashboard
/admin/commandes        Orders (tabs + filters, ?status=…)
/admin/caisse           POS
/admin/produits         Products list → /admin/produits/nouveau, /admin/produits/:id
/admin/packs            Packs
/admin/stock            Stock overview + movements + entrée
/admin/types, /admin/marques
/admin/clients
/admin/parametres       Settings (+ wilaya fees, users)
```

Shop is mobile-first (most Algerian buyers come from Instagram/TikTok/Facebook on a phone). Admin is responsive too (owner confirms orders from his phone).

---

## 7. Project structure

```
perfume-shop/
├─ PLAN.md
├─ PROMPTS.md
├─ CLAUDE.md            (created in phase 0)
├─ backend/             Laravel 12
│  ├─ app/Http/Controllers/{Public,Admin}/
│  ├─ app/Http/Requests/  app/Http/Resources/
│  ├─ app/Models/  app/Services/{StockService,OrderWorkflow,OrderReference,Pricing}.php
│  ├─ app/Enums/{OrderStatus,StockMovementType,StockMode,...}.php
│  ├─ database/migrations/ seeders/ (wilayas+communes JSON in database/data/)
│  └─ tests/Feature/
└─ frontend/            React + Vite + TS
   ├─ src/shop/   src/admin/   src/components/ui/ (shadcn)
   ├─ src/lib/api.ts  src/stores/cart.ts  src/i18n/
   └─ .env (VITE_API_URL)
```

---

## 8. Deployment on cPanel

1. Create subdomain `api.monshop.dz` with document root `/home/USER/laravel/public`.
2. Create MariaDB DB + user in cPanel, set PHP version 8.3+ (MultiPHP Manager), enable `gd`, `intl`, `fileinfo`, `pdo_mysql`.
3. `git clone` (or upload) backend to `/home/USER/laravel`, run `composer install --no-dev --optimize-autoloader`, copy `.env`, `php artisan key:generate`, `php artisan migrate --seed --force`, `php artisan storage:link`, `php artisan config:cache route:cache`.
4. `.env`: `APP_URL=https://api.monshop.dz`, `FRONTEND_URL=https://monshop.dz`, `SANCTUM_STATEFUL_DOMAINS=monshop.dz,www.monshop.dz`, `SESSION_DOMAIN=.monshop.dz`, `SESSION_SECURE_COOKIE=true`, `QUEUE_CONNECTION=database`.
5. cPanel cron (every minute): `php /home/USER/laravel/artisan schedule:run` (and queue work via scheduler if used).
6. Frontend: `npm run build` locally with `VITE_API_URL=https://api.monshop.dz`, upload `dist/*` to `public_html/`, add `.htaccess` SPA fallback to `index.html`.
7. Enable SSL (AutoSSL) for both domains. Backups are handled by the host (CDP) — also add a weekly `mysqldump` cron to a non-public folder.

1 GB RAM / 2.4 GHz is enough for this app (low traffic, mostly cached reads). Images are converted to WebP ≤ 1200 px to stay light.

---

## 9. Phases & milestones

| # | Phase | Done when |
|---|---|---|
| 0 | Repo setup, CLAUDE.md, Laravel + Vite skeletons | both run locally, CORS/Sanctum handshake works |
| 1 | DB: migrations, enums, models, seeders (wilayas, communes, types, admin, demo products) | `migrate:fresh --seed` OK |
| 2 | Core services: StockService, OrderWorkflow, pricing + feature tests | tests green (oversell, cancel restore, pack deduction) |
| 3 | Public API + admin API | all endpoints covered by feature tests |
| 4 | Shop frontend | can browse, cart, place an order on mobile |
| 5 | Admin frontend: login, orders, products/packs, stock, types/brands, customers, settings | full order lifecycle doable from UI |
| 6 | Caisse (POS) + dashboard stats + receipts/CSV | sale in shop updates stock + dashboard |
| 7 | Hardening + deploy to cPanel | live with SSL |
| 8 (later) | Arabic/RTL, delivery company API (Yalidine/ZR…), WhatsApp confirm link, margins report, promo codes | — |
