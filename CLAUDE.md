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

## Tests
- Pest, run from `backend/`: `vendor/bin/pest`. They use the **`perfume_shop_test`** MariaDB database (see `phpunit.xml`); `Tests\TestCase` refuses to run on any database whose name does not end in `_test`, because `RefreshDatabase` wipes the schema.
- Helpers (`makePerfume`, `makePack`, `placeOnline`, ...) are in `tests/Helpers.php`.

## Notes
- Laravel 13 / TypeScript 7 were the latest at setup time (PLAN.md says Laravel 12); TS 7 has no `baseUrl`, the `@/*` alias is set via `paths` only.
- shadcn `form` component is not in the registry anymore; use react-hook-form directly with `Label`/`Input`.
