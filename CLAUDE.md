# Perfume Shop

Web app for a perfume shop in Algeria: public catalogue + cart + cash-on-delivery orders, and an admin dashboard (orders, products, packs, stock, caisse/POS). **`PLAN.md` is the spec** — follow it unless told otherwise. `PROMPTS.md` holds the phase-by-phase build prompts.

## Stack
- `backend/` — Laravel 13 (PHP 8.3+), MariaDB, Sanctum (SPA cookie auth), intervention/image, Pest.
- `frontend/` — React 19 + Vite + TypeScript, Tailwind v4, shadcn/ui, React Router, TanStack Query, Zustand, react-hook-form + zod, Recharts, react-i18next. Shop and `/admin` are one app (admin lazy-loaded).
- Production: cPanel shared hosting. Frontend is a static build in `public_html/`; API on `api.<domain>`.

## Run locally (Windows)
PHP and Composer come from Laravel Herd and are not on the Git Bash PATH by default:
```bash
export PATH="$HOME/.config/herd/bin/php85:$HOME/.config/herd/bin:$PATH"
```
Composer: `php "$HOME/.config/herd/bin/composer.phar" <args>`.

```bash
# backend (http://localhost:8000)
cd backend && php artisan serve
vendor/bin/pest

# frontend (http://localhost:5173)
cd frontend && npm run dev
npm run build
```
Env: copy `backend/.env.example` → `backend/.env` and set the DB password (`DB_PASSWORD`; local MariaDB root has one). `frontend/.env` needs `VITE_API_URL=http://localhost:8000`. Create two databases: `perfume_shop` (dev) and `perfume_shop_test` (tests).
Use `127.0.0.1` or `localhost` consistently in the browser — Sanctum cookies are host-specific.

## Conventions
- Code, identifiers and comments in English; **UI text in French** through react-i18next (`src/i18n/fr.json`), never hardcoded in components.
- Money is an **integer in DZD**. No floats, no decimals.
- **All stock changes go through `StockService`** and are recorded in `stock_movements`; never edit `stock_ml` / `stock_qty` directly.
- **All order status changes go through `OrderWorkflow`**, which enforces the state machine in PLAN.md §3.3 and writes `order_status_history`.
- Order items snapshot name/label/price; never recompute old orders from current prices.
- Never trust client-sent prices; re-price from the DB.
- Controllers stay thin: Form Requests for validation, API Resources for output, services for logic.
- Soft deletes on products, packs, brands, types.
- Admin credentials come from env (`ADMIN_USERNAME` / `ADMIN_PASSWORD`), never hardcoded.
- Tests with Pest in `backend/tests/Feature`. Run them before finishing a phase.

## Database
- `php artisan migrate:fresh --seed` rebuilds everything (wilayas/communes, types, owner admin from `ADMIN_*` env via `config/shop.php`, and demo catalogue when `APP_ENV=local`).
- Settings live in the `settings` table: use `settings('key')` or `settings()->showUnavailable()` (`SettingsService`, cached, defaults in `SettingsService::DEFAULTS`).
- Wilaya `id` is the official code. Seed data: `database/data/algeria_cities.json` (58 wilayas / 1541 communes, from othmanus/algeria-cities) plus wilayas 59-69 from the 2025 reform, hardcoded in `WilayaSeeder::NEW_WILAYAS`. The new ones only have their seat as a placeholder commune (the dataset predates the reform, so the old wilayas still hold the communes that moved).
- Models use `$guarded = ['id']`: always build them from validated data, never from raw request input.

## Services (Phase 2)
- `StockService`: only writer of stock. `maxQty/availability` (pool, unit, pack), `addEntry`, `adjust`, `openBottle`, `deductForOrder`, `restoreForOrder` (reverses the order's own sale movements), `recalculate` (`php artisan stock:recalculate`).
- `OrderWorkflow::transition($order, $action, $user, $data)`: actions `confirm|cancel|no_answer|ship|deliver|return|sell_in_store`. Stock is deducted on `confirm`, restored on `cancel` of a confirmed order and on `return` with `restock=true`.
- `Pricing::quote()` re-prices a cart from the DB; `OrderPlacement::placeOnline()/placePos()` create orders; `OrderReference` gives `CMD-000001` / `POS-000001`.
- Business failures throw `ShopException` subclasses (French messages) — Phase 3 renders them as 422.
- Deactivating a perfume only hides it from new sales; existing orders containing it can still be confirmed.
- Models define `$attributes` for DB defaults used right after `create()` (e.g. `is_active`, `stock_deducted`).

## API (Phase 3)
- Full reference: `backend/API.md`. Live docs (local only): `http://localhost:8000/docs/api` (Scramble). Postman: `backend/docs/perfume-shop.postman_collection.json`. After changing the API regenerate: `php artisan scramble:export --path=docs/openapi.json` and `node docs/build-postman.mjs`.
- Controllers: `app/Http/Controllers/Public/*` (storefront) and `Admin/*`. Output through `Http/Resources`, input through Form Requests (or inline `validate()` for the tiny CRUDs). Logic stays in services (`ProductService`, `OrderEditor`, `DashboardService`...).
- Admin auth is a Sanctum **cookie session** (frontend). The SPA request needs an `Origin` in `SANCTUM_STATEFUL_DOMAINS`. For Postman/Swagger there is `POST /api/admin/token` (Bearer), enabled only when `config('shop.dev_tokens')` (local env).
- Roles: `role:owner` middleware group = owner-only; everything else under `/admin` is owner + staff. `EnsureRole`/`EnsureActiveUser` run before route-model binding so forbidden users get 403, not 404.
- Business failures are `ShopException`s => 422 `{message, shortages?}`.
- Stock is never editable through the product endpoints; only through `/admin/stock/*`, order workflow and the caisse.

## Shop frontend (Phase 4)
- Routes: `/`, `/boutique` (filters live in the URL), `/parfum/:slug`, `/pack/:slug`, `/packs`, `/panier`, `/commande`, `/commande/merci/:reference`. Code in `frontend/src/shop/` (pages, components, `queries.ts`, `types.ts`, `useCartSync.ts`).
- Design: chalk background, oud-brown ink, cardamom-green actions, saffron only in the liquid; Fraunces (display) + Geist (body), both self-hosted. Signature piece = `VolumeGauge` (the size picker as a vial). Products without photo get a drawn `Flacon` (shape and colour by perfume type, see `components/tones.ts`).
- Sizes are **per perfume**: each product page lists that perfume's own variants and prices; the cart holds one line per variant, so sizes can be mixed across perfumes. The vial on the home page is only an illustration.
- The cart (`stores/cart.ts`, localStorage) stores display data only. `useCartQuote` re-prices it through `POST /cart/validate`; `useCartSync` removes vanished lines and lowers quantities above the stock.
- This shadcn is built on base-ui: there is no `asChild`. For a link that looks like a button use `linkButton()` from `shop/components/ui.ts`.
- All UI text is in `src/i18n/fr.json`. Quick check that every `t('...')` key exists: see how `check-i18n` was done in the Phase 4 session (static keys + the dynamic groups sorts/genders/modes).
- Mobile first. Checked for horizontal overflow at 320, 375, 600, 768, 1024 and 1280 px. The browser pane's screenshot tool crops emulated viewports that differ from the pane size; measure with JS (`scrollWidth` vs `innerWidth`) when in doubt.
- Dev: `npm run dev` runs on port 3000 (see `vite.config.ts`) and opens a browser; use `npx vite --port 3000 --open false` to avoid that.

## Admin frontend (Phase 5)
- Routes under `/admin` (`frontend/src/admin/`, lazy-loaded; one chunk per page): `login`, `commandes` (list + drawer via `?order=ID`), `produits[/nouveau|/:id]`, `packs[/nouveau|/:id]`, `stock`, `types` (families), `marques`, `clients`, `parametres`. Dashboard and caisse come in Phase 6.
- Auth: cookie session. `auth.tsx` has `useMe`, `RequireAuth`, `OwnerOnly`, `useIsOwner`. Staff see Commandes, Produits, Packs, Stock (read-only); everything else is owner-only (the API enforces it too).
- Data: all hooks in `admin/queries.ts` (keys start with `['admin', ...]`; every write refreshes them). Shapes in `admin/types.ts`. API errors → `apiError()` / `fieldErrors()` in `admin/lib.ts`.
- The admin UI text is **French only and written inline** (not in `fr.json`): it is for the owner, and only the shop is planned for Arabic/RTL.
- Order actions live in `components/OrderDrawer.tsx` (confirm, no answer, cancel, ship, deliver, return, sell in store), editing in `OrderEdit.tsx`, printing in `print.ts` (opens a printable window).
- Local API: run `composer serve` (= `php backend/serve.php`), not `php artisan serve`. On this Windows/Herd setup `artisan serve` starts PHP without a temp dir and every photo upload fails.
- After adding npm packages while `vite` is running, restart it with `--force` (otherwise: "504 Outdated Optimize Dep" and a blank page).
- Validation messages are French (`backend/lang/fr/validation.php`).
- Timezone: app `Africa/Algiers` and DB session `+01:00` (`APP_TIMEZONE`, `DB_TIMEZONE`), so timestamps in the database read as local time. The API sends UTC ISO strings and the browser shows local time.
- A cancelled order can be reopened (`reopen` action: annulee → en_attente); confirming it again deducts the stock again.

## Caisse and dashboard (Phase 6)
- `/admin/caisse` (`pages/Caisse.tsx`, owner + staff): product grid → size dialog → cart, discount (DA or %), payment, cash received/change, optional client, then `POST /admin/pos/sales`. The receipt is an 80 mm ticket (`printReceipt` in `print.ts`). Keys: `/` focuses the search, Ctrl+Enter validates.
- `/admin` is the **dashboard** for the owner (staff are redirected to the orders): range presets, hero revenue, KPI tiles, sales chart, best sellers, low stock, pending orders with a quick "Confirmer".
- `components/SalesChart.tsx` is a hand-written SVG chart that follows the dataviz guidance: colours `ONLINE #12805c` and `POS #c4850a` were checked with the palette validator (all checks pass), ≤ 24 px columns with a 4 px rounded data end, 2 px gap between stacked segments, hairline grid, a legend, selective labels, a hover tooltip and a table view. Ranges over 45 days are grouped by week. Reuse these two colours for "online" and "caisse" everywhere.
- `GET /admin/dashboard` returns `sales_by_day` with `revenue_online` / `revenue_pos` per day.
- Vite on Windows sometimes serves a stale module after several quick edits: if a change does not show, `touch` the file or restart Vite.

## Product types (feature/product-types)
- The owner creates **product types** ("rayons"): Parfums, Cosmétiques, Montres, Lunettes... (`product_types`, `ProductType`; admin page "Types de produits"). Each type has its own families / categories, products, packs, stock and brands, and its own entry in the shop menu and home page. Nothing in the code names a type.
- A type has a **profile**: `perfume` (decants by the ml, notes, "inspired by", sealed bottles, the vial picker) or `standard` (free-form options counted in pieces, the option picker). `uses_gender` turns on the Homme / Femme field and filter. `products.kind` = the profile of the product's type (`perfume` | `standard`) or `pack`; `ProductKind::hasOwnStock()` is true for the first two.
- `perfume_types` (table kept for compatibility) holds the **families / categories** of every type, each with a `product_type_id`; names and slugs are unique per type. A product's family / category must belong to its type (`SaveProductRequest`). `products.product_type_id` is the type (a pack may have none: it then only shows in "Packs"). Packs can contain products from any type.
- Brands are many-to-many with types (`brand_product_type`): using a brand on a product lists it under that type (`ProductService::attachBrand`). `GET /brands?rayon=slug`.
- A product may move to another type of the same profile only. A type's profile cannot change once it has products; a type with products cannot be deleted (hide it).
- Starting types: `ProductTypeSeeder` (Parfums, Cosmétiques, Montres, Lunettes + categories; never touches the owner's edits). `SHOP_TYPES=parfums,cosmetiques` in .env limits it to what the shop sells (`config/shop.php`). On a server: `php artisan migrate --force && php artisan db:seed --class=ProductTypeSeeder --force`. The migration moves existing perfumes into "Parfums" (and cosmetics into "Cosmétiques").
- Low stock: `Product::scopeLowStock` / `StockService::stockStatus`. Perfumes: under the ml threshold and no sealed bottle; standard products: at or below `low_stock_threshold_qty` units. `openBottle` is perfume-only.
- Shop: `GET /product-types` feeds the menu (`Header`), the home sections and the filters; `GET /products?rayon=montres&type=montres-sport&kind=perfume,standard`. Boutique has a "Tout / each type" switch (`?rayon=`); standard products live at `/produit/:slug` with `OptionPicker`; products without a photo are drawn by `Flacon` from the category, else from the type (flacon, pot, watch, glasses: `tones.ts`).
- Admin: "Nouveau produit" asks for the type first (`/admin/produits/nouveau?type=ID`); the form shows only what the type uses. Stock, products, caisse and brands filter by type.
- Caisse: a line can be sold at a negotiated price (`lines.*.unit_price`, `Pricing::quote(allowPriceOverride: true)` only from `placePos`); `order_items.list_price` keeps the catalogue price. Never enabled for online orders.
- Demo data (local only): `db:seed --class=CosmeticSeeder`, `--class=AccessorySeeder` (watches, glasses, mixed packs), `--class=CatalogueSeeder` (perfumes).

## Desktop app and web-admin switch (feature/desktop-app)
- `desktop/` is an Electron app that ships the website's admin (the same React build, copied to `desktop/web` by `npm run web`) and serves it from a private `app://local` address. `window.desktop` (preload bridge, `src/preload.js`) tells the frontend it runs in the app: `lib/api.ts` then uses the server chosen on first launch and a Bearer token instead of cookies; `auth.tsx` signs in with `POST /admin/desktop/login`. The token is kept encrypted with Electron `safeStorage` (Windows DPAPI). No Node access in the page (`contextIsolation`, `sandbox`); navigation is limited to `app://local`, ticket windows (`about:blank`) are allowed so printing works.
- Commands (in `desktop/`): `npm install`, `npm start` (build + run), `npm run dev` (run), `npm run pack` (unpacked), `npm run dist` (Windows installer in `desktop/dist`). `SHOP_API_URL` presets the server, `SHOP_DESKTOP_DATA` moves the app's data (tests). Frontend change => `npm run web` again before `start`/`dist`.
- **Website admin switch, set in the code** (`backend/config/features.php`, `'web_admin' => true|false`; not an admin setting, chosen per shop when it is delivered; the desktop app is always part of the product). When false, `EnsureWebAdminAllowed` (alias `web.admin`, on the whole admin group) refuses every browser-session call with 403 `code: web_admin_disabled`, and `AuthController::login` refuses the cookie sign-in; Bearer-token calls (the desktop app) pass. The website's `AdminApp` shows `WebAdminDisabled` (it reads `web_admin_enabled` from `/settings/public`, so no frontend rebuild). On a server the config is cached: after editing the file run `php artisan optimize:clear && php artisan optimize`. Desktop tokens expire after 30 days (`sanctum:prune-expired` is scheduled).

## Tests
- Pest, run from `backend/`: `vendor/bin/pest`. They use the **`perfume_shop_test`** MariaDB database (see `phpunit.xml`); `Tests\TestCase` refuses to run on any database whose name does not end in `_test`, because `RefreshDatabase` wipes the schema.
- Helpers (`makePerfume`, `makePack`, `placeOnline`, ...) are in `tests/Helpers.php`.

## Notes
- Laravel 13 / TypeScript 7 were the latest at setup time (PLAN.md says Laravel 12); TS 7 has no `baseUrl`, the `@/*` alias is set via `paths` only.
- shadcn `form` component is not in the registry anymore; use react-hook-form directly with `Label`/`Input`.

## Roze Sham version (client/roze-sham)
- Client: Roze Sham (روز الشام), web only (the `desktop/` folder is not used for this client). Brand: grey and white (`frontend/src/index.css` palette, grey `tones.ts`, charcoal / grey chart colours), logo recoloured from the client's file into `frontend/public/brand/` (dark `logo.webp`, white `logo-light.webp`, emblem `logo-mark.*`, `favicon.png`). Name default in `SettingsService::DEFAULTS` and `fr.json` (`brand.name`); address, phone and social links are left empty for the owner to fill in Paramètres.
- **Admin in Arabic or French** (default Arabic, remembered per browser; switch in the sidebar and on the login page). The admin components stay written in French; `admin/i18n/translate.ts` swaps each French text for its Arabic one (`admin/i18n/ar.ts`: exact-text dictionary + regex patterns for sentences with data) while the language is Arabic, and sets `dir="rtl"` / `lang="ar"` on `<html>`. A text missing from `ar.ts` simply stays French: when you add UI text, add its Arabic line. Product / brand / wilaya names are data and are not translated. Dates follow the language (`langFormat` in `i18n/lang.ts`); admin classes use logical properties (`ms-`, `pe-`, `text-start`, `border-s`...). The shop (customer side) stays French. API error messages come from the backend in French unless listed in `ar.ts`. Printed tickets / bordereaux are still French.
- **Purchase prices and profit** (Roze Sham): `product_variants.cost_price` (what one unit costs; admin only, never in public resources; a pack's cost = sum of its components, `ProductVariant::unitCost()`) and `order_items.unit_cost` (frozen when the line is sold, kept on order edits, so later price changes never rewrite past profit). `DashboardService::profit()` = items sold − their cost − order discount, only for orders whose items all have a cost (`orders_without_cost` says how many were left out); the percent is on the purchase cost (20 % = sold at cost + 20 %). Product form: per-size "Prix d'achat" and "Bénéfice (%)" that follow each other (typing one sets the other; also for packs), and "Bénéfice voulu (%)" → all sale prices at once, rounded up to 50 DA. Dashboard ranges: today / this week (from Monday) / this month / this year / custom; default week.
- Demo purchase prices: `PurchaseCostSeeder` (run by `db:seed` locally after `DemoSeeder`; or `db:seed --class=PurchaseCostSeeder` after the cosmetic / accessory / catalogue seeders) gives every demo size the cost that yields a default gain: designer 20 %, niche 30 %, other perfume families (arabe, dupe, création maison) 15 %, everything else (cosmetics, watches, glasses) 20 %; it also gives past demo sales without a cost today's cost. Never run on a real shop.
- **Hidden stock / backorder** (Roze Sham): code switch `config/features.php` `'backorder' => true` (`settings()->backorderEnabled()`). The customer never sees stock: an item is listed or not (existing rules + low-stock thresholds), and when listed any quantity up to `StockService::ORDER_MAX_QTY` (50) can be ordered; the public API's `max_qty` is that flat cap (`shopMaxQty`, `QuoteLine::shopMaxQty`), never the stock, and `placeOnline` only refuses unlisted items (`assertAvailableOnline`). The caisse and `confirm` still need real stock. For the owner, `OrderResource.stock_check` (pending orders; `StockService::checkOrder`: lines drawing on the same ml pool are added up) gives `possible`, `shortages` and per line `ok` / `left`; the drawer shows it, disables "Confirmer" when impossible and offers "Mettre en attente d'arrivage" (`orders.awaiting_stock`, via `PUT /admin/orders/{id}`, badge in the list). With `false` the old behaviour (quantity capped at the stock, "plus que N") applies; tests default to `false` (tests/Pest.php), BackorderTest turns it on.
- **Decant bottles** (Roze Sham): the empty 10 / 20 / 30 ml… bottles are counted per size (`bottle_sizes`, ledger `bottle_movements`, `BottleService` is their only writer; page "Bouteilles", owner-only: bought, left, investment, average price, losses, history). Every pool (decant) variant sold takes one bottle of its size (`StockService::expand` adds `needs['bottles']`; `deductForOrder` locks, checks and consumes them, `restoreForOrder` gives them back; `maxQty` and `checkOrder` include them), sealed flacons never. A size is only limited once it has a row (nothing entered = no limit). The investment is not added to the profit figures (the owner enters each size's purchase price).
- **Loyalty programme** (Roze Sham): `config/features.php` `'loyalty_every' => 6` (null = off). Every perfume (kind `perfume`, any size, price > 0; a perfume inside a pack counts too, at its share of the pack price in proportion to the catalogue prices of the pack's contents) of a completed order (delivered / sold in shop, incl. caisse) counts for its customer (by phone): `loyalty_entries`, one row per unit (`LoyaltyService::record`, called from `OrderWorkflow` on deliver / sell_in_store and from `placePos`). Each full batch of 6 uncounted units creates a `loyalty_rewards` row whose `average_price` is the average sale price of those 6 (the suggested gift value). The owner gives a sealed perfume flacon of any price (`POST /admin/customers/{id}/loyalty/redeem`): a zero-price caisse sale (stock taken, cost recorded, note "Cadeau fidélité", never counted). Shown on the Clients page, in the order drawer (with `adds` = perfumes of that order) and in the caisse by phone (`GET /admin/loyalty?phone=`). `php artisan loyalty:backfill` counts older completed orders (safe to repeat).
- **Editing orders after the fact** (Roze Sham): `OrderEditor` still lets a pending / confirmed order change everything; for any other status (shipped, delivered, sold in shop, cancelled, returned) it only accepts the client (names, phones, address, wilaya / commune), notes, and for a caisse sale `payment_method` / `amount_received` (items, discount, fees and delivery mode are refused). `syncCustomer`: giving a caisse sale a phone creates / finds that customer, links the order, moves the `customers` counters and, for a completed order, counts its perfumes for loyalty; moving an order to another number takes them off the old customer (`LoyaltyService::forgetOrder` cancels an unused gift they had earned). The drawer's "Modifier" is always available (`OrderEdit` shows only the client, and the payment for a caisse sale, when the order is finished).
- **Clients added at the caisse / afterwards**: `ClientPicker` (caisse and the edit form of a finished caisse sale) searches existing clients (`GET /admin/customers/search`, owner + staff) or creates one: first name, last name and phone are required together (`PosSaleRequest` `required_with`; `OrderEditor::syncCustomer` for a finished sale), wilaya and commune start as the shop's own, `config('shop.default_wilaya_id')` 31 + `default_commune` "Oran" (`App\Support\DefaultLocation`, exposed as `default_location` in `/settings/public`). A known client keeps the place we have for them; a delivery order always takes its wilaya / commune from the order itself.
- **Edit / delete everywhere** (Roze Sham): orders (`OrderDeleter`, owner only: pending / cancelled / returned / caisse sale; a caisse sale puts its stock and bottles back; counters and loyalty are reversed, a gift given with it becomes pending again), clients (full edit; delete detaches their orders, `orders.customer_id` is restrict so it is nulled first), bottle sizes (rename, delete = stop tracking and drop the history) and the bottle movements made by hand (entries, losses, recounts: `BottleService::updateMovement` / `deleteMovement`, the count follows and never goes below zero; sale movements are never edited). Stock movements are still corrected with losses / adjustments, not deleted.
- **CSV import** (Roze Sham): `ProductImporter` (+ `ImportController`, page `/admin/importer`, owner only). Two shapes, because one would be clumsy: `perfumes` (one row per perfume; the sizes are header columns `prix_10ml`, `prix_flacon_100ml`, `achat_…`, `stock_ml`, `stock_flacon_100ml`) and `options` (cosmetics / watches / glasses: one row per option, grouped by type + name + brand). Models to download and test fixtures: `backend/resources/import/modele-parfums.csv` and `modele-autres-produits.csv`. Preview = the same run inside a rolled-back transaction, so it is exactly what the real import does. It only creates (an existing product is skipped), creates missing brands and families (never types), reads `;` / `,` / tab, UTF-8 or Windows-1252, headers without accents, prices like "1 500" or "1500 DA", and reports problems per line while importing the valid products. Starting stock goes through `StockService::addEntry` ("Import CSV").
- Test files for the import are in `exemples-import/` (repo root, with `LISEZ-MOI.md`: one example line and a column guide per model): `1-parfums-20.csv`, `2-autres-produits.csv`, and two with deliberate mistakes (`3-…`, `4-…`) to see the report. The import page also shows an example line under "Comment remplir le fichier".
