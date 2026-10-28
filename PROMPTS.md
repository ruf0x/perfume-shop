# Claude Code prompts — Perfume Shop

How to use:
- Open Claude Code in the `perfume-shop/` folder (it must contain `PLAN.md`).
- Run the prompts **one phase at a time**, in order. Review + test + commit after each phase before starting the next (`git commit` gives you a rollback point).
- Start a **new session per phase** (or `/clear`) — every prompt re-points Claude at `PLAN.md` and `CLAUDE.md`, so it doesn't need the old chat.
- If something in a phase is wrong, fix it in that same session before moving on.

---

## Phase 0 — Setup

```
Read PLAN.md fully. It is the spec for this project; follow it unless I say otherwise.

Phase 0 — project setup:
1. `git init` in this folder with a sensible .gitignore (vendor, node_modules, .env, dist, storage stuff).
2. Create `backend/` as a fresh Laravel 12 app (PHP 8.3+), MySQL/MariaDB driver configured in .env.example. Install Laravel Sanctum for SPA cookie auth (`php artisan install:api`), intervention/image, and Pest.
   Configure CORS + Sanctum stateful domains for local dev (frontend on http://localhost:5173, API on http://localhost:8000), `supports_credentials=true`.
   Add a FRONTEND_URL env var.
3. Create `frontend/` with Vite + React + TypeScript. Install and configure: Tailwind CSS v4, shadcn/ui (init + button, input, select, dialog, sheet, table, tabs, badge, card, dropdown-menu, form, toast/sonner), react-router, @tanstack/react-query, zustand, axios, react-hook-form, zod, @hookform/resolvers, recharts, lucide-react, react-i18next.
   Create `src/lib/api.ts`: axios instance with baseURL from VITE_API_URL, `withCredentials: true`, `withXSRFToken: true`, and a helper that calls `/sanctum/csrf-cookie` before admin login.
   Folder layout from PLAN.md §7 (src/shop, src/admin, src/components, src/stores, src/i18n). One app: shop routes + lazy-loaded /admin routes. Placeholder pages are fine for now.
4. Write CLAUDE.md at the root: short project summary, the stack, how to run backend and frontend locally, coding conventions (money = integer DZD; all stock changes go through StockService; all order status changes go through OrderWorkflow; French UI labels, English code), and "PLAN.md is the spec".
5. Verify: `php artisan serve` and `npm run dev` both start, and a test GET from the frontend to an `/api/ping` route works with credentials.

Don't build features yet. Tell me what you created and anything I need to install on my machine (PHP, Composer, MariaDB/MySQL, Node).
```

---

## Phase 1 — Database

```
Read CLAUDE.md and PLAN.md (§3 business rules and §4 schema are the important parts).

Phase 1 — database layer in backend/:
1. PHP backed enums in app/Enums: OrderStatus, OrderChannel, DeliveryMode, PaymentMethod, StockMode, StockMovementType, ProductKind, Gender, UserRole — values exactly as in PLAN.md. Give OrderStatus a `label()` (French) and `allowedTransitions()`.
2. Migrations for every table in PLAN.md §4 with the listed columns, FKs (restrict on delete where history must be kept, cascade for child rows like images/variants/order_items), indexes and soft deletes. Money columns unsigned integers. Replace the default users table with the admin one (username login).
3. Eloquent models with casts (enums, booleans, datetimes), relationships, fillable, and useful scopes: Product::active(), ::perfumes(), ::packs(), ::available(threshold); Order::status(), ::channel(), ::between(from,to).
4. A Setting model + `settings()` helper / SettingsService with typed getters and defaults (show_unavailable=false, low_stock_threshold_ml=10, etc.), cached.
5. Seeders:
   - Wilayas + communes from a JSON file in database/data/ (use a public Algerian dataset such as othmanus/algeria-cities; download it into database/data and tell me the source + how many wilayas/communes it contains so I can check it's current). Default home_fee=600, desk_fee=400, Alger lower — I'll edit later.
   - Perfume types: Designer, Niche, Arabe, Dupe, Création maison.
   - One owner admin: username + password read from env (ADMIN_USERNAME / ADMIN_PASSWORD), never hardcoded.
   - Demo data factory/seeder (only when APP_ENV=local): ~15 perfumes across types with pool variants (10/20/30 ml) and some unit variants (full sealed bottle), initial stock via stock_movements of type 'entree', and 2 packs.
6. Run `php artisan migrate:fresh --seed` and fix any error. Show me a short summary of the tables.

No controllers yet.
```

---

## Phase 2 — Core services (stock + order workflow) with tests

```
Read CLAUDE.md and PLAN.md §3 (business rules) carefully — this phase is the heart of the app.

Phase 2 — in backend/app/Services:

1. StockService
   - `availability(ProductVariant $v, int $qty): bool` and `maxQty(ProductVariant $v): int` for pool / unit / pack modes.
   - `addEntry(product, ?variant, ml, qty, ?unitCost, note, user)` (type entree).
   - `adjust(...)` (ajustement / perte, signed values, refuse going below zero).
   - `openBottle(unitVariant, user)`: −1 unit, +variant.ml to pool (two movements, one transaction).
   - `deductForOrder(Order)`: for every item, expand packs into components, lock rows (`lockForUpdate`), check availability, write movements (vente_en_ligne or vente_caisse with order_id), update cached `products.stock_ml` / `product_variants.stock_qty`, set `orders.stock_deducted = true`. All-or-nothing; throw a domain exception (InsufficientStockException with which item is missing) if anything is short.
   - `restoreForOrder(Order, type)`: reverse movements (annulation / retour), only if stock_deducted, then set it false.
   - `recalculate(Product)`: rebuild cached totals from the ledger (artisan command `stock:recalculate` too).

2. OrderWorkflow
   - `transition(Order, string $action, User, array $data)` implementing the state machine table in PLAN.md §3.3 exactly: confirm (deduct stock), cancel (reason; restore if deducted), no_answer (call_attempts+1, stays pending), ship (delivery_company, tracking_number), deliver, return (restock flag → restore or record perte), sell_in_store.
   - Set the matching *_at timestamp, write order_status_history, update customer counters, all in a DB transaction. Reject invalid transitions with a clear exception.

3. OrderPlacement / Pricing
   - `quote(array $lines, wilayaId, deliveryMode)`: re-price from DB (never trust client prices), check availability, compute subtotal, delivery fee from the wilaya (0 for boutique pickup, apply free_delivery_over setting), total.
   - `placeOnline(data)`: validate, upsert customer by phone, refuse blacklisted phones, create order (status en_attente, channel online, payment cod) + snapshot items, generate reference via OrderReference (CMD-000001, POS-000001, race-safe).
   - `placePos(data, user)`: create order (channel pos, status vendue_boutique, completed_at now), deduct stock immediately, compute change from amount_received.

4. Pest feature tests covering at least: pool deduction, unit deduction, pack deduction, oversell refused (and nothing partially written), cancel after confirm restores stock, cancel before confirm touches nothing, return with/without restock, invalid transition rejected, open bottle, client-sent prices ignored, blacklisted phone refused, POS sale deducts immediately.

Run the tests until green and show me the results.
```

---

## Phase 3 — API

```
Read CLAUDE.md and PLAN.md §5 (API).

Phase 3 — implement every endpoint in PLAN.md §5 in backend/:
- Controllers split into App\Http\Controllers\Public and App\Http\Controllers\Admin, kept thin: validation in Form Requests, output through API Resources, logic in the Phase 2 services.
- Domain exceptions (InsufficientStock, InvalidTransition…) rendered as 422 JSON with a French message.
- Public product listing respects settings: if show_unavailable=false, hide unavailable products; else return them with `available=false`. Each variant returns `available` and `max_qty`. Never expose cost prices or stock_movements publicly.
- POST /api/orders: throttle 5/min per IP, honeypot field `website` must be empty, phone regex ^0[5-7][0-9]{8}$, returns {reference}.
- Admin auth: Sanctum SPA cookie auth with username+password, login throttled, inactive users refused. Role middleware: `staff` can only access orders, POS, and read products/stock; `owner` everything.
- GET /api/admin/orders: filters (status, channel, from, to, wilaya, min_total, max_total, q on reference/name/phone), sort (created_at, total), pagination, plus `counts` per status for the tabs.
- GET /api/admin/dashboard: KPIs for a date range (orders count, revenue = livree + vendue_boutique, pending count, in delivery count, cancel rate), sales per day series, top 10 variants sold, low-stock list.
- Product create/update accepts variants (and pack items for packs) in the same payload and syncs them; image upload resizes to max 1200px WebP with intervention/image and stores on the public disk; slug auto-generated.
- GET /api/admin/orders/export streams a CSV (UTF-8 BOM so Excel shows accents/Arabic).
- Feature tests for each endpoint group (happy path + auth/role + validation).

Finally write `backend/API.md` listing every route with an example request/response, and run all tests.
```

---

## Phase 4 — Shop frontend

```
Read CLAUDE.md, PLAN.md §2.1 and §6, and backend/API.md.

Phase 4 — build the public shop in frontend/src/shop. Use the frontend-design skill if available.
Design direction: luxury perfume boutique — elegant, dark/gold or cream/black palette, serif display font + clean sans for text, big product imagery, smooth but light animations. Mobile-first: most clients come from Instagram/TikTok on a phone. French UI, all strings through react-i18next so Arabic (RTL) can be added later.

Pages: Home, Boutique (filters + sort + search synced to the URL query string, infinite scroll or pagination), Product page (gallery, notes pyramid, "Inspiré de…", variant selector showing price per size, disabled variants when unavailable, qty limited by max_qty), Packs, Panier, Commande (checkout), Merci/:ref.
- Typed API layer (types matching API Resources) + TanStack Query hooks.
- Cart: zustand persisted store (variant id, qty, snapshot of name/label/price/image for display). On cart and checkout pages call POST /cart/validate and show updated prices / removed items / delivery fee.
- Checkout form with react-hook-form + zod: nom, prénom, téléphone (Algerian format), téléphone 2 (optional), wilaya select, commune select filtered by wilaya, adresse (required unless boutique pickup), delivery mode (domicile / stop-desk / retrait en boutique if enabled), note, hidden honeypot. Live total with delivery fee. Clear cart on success and go to the thank-you page.
- Header with cart badge + slide-over cart drawer, footer with shop info/socials from /settings/public.
- Loading skeletons, empty states, error toasts. Lighthouse-friendly: lazy images, proper alt text, meta title per page.

Run it against the local backend with the demo seed and walk through: browse → filter → product → add 2 variants → checkout → order created. Fix anything broken.
```

---

## Phase 5 — Admin frontend

```
Read CLAUDE.md, PLAN.md §2.2, §3.3 and §6, and backend/API.md.

Phase 5 — build the admin in frontend/src/admin (lazy-loaded under /admin), shadcn/ui based, clean and fast, works well on a phone too.
- Login page (username/password), auth guard, /me on load, logout, role-aware sidebar (staff sees fewer items).
- Commandes: status tabs with counts (Toutes, En attente, Confirmées, En livraison, Livrées, Vendues en boutique, Annulées, Retournées), filters (date range, wilaya, min/max total, search) and sort — all synced to the URL. Table: ref, date, client, phone (tel: link), wilaya, total, status badge, call attempts.
  Clicking a row opens a sheet/drawer with full client info, items, totals, status history timeline, admin note, and ONLY the action buttons allowed for the current status (from the state machine): Confirmer, Ne répond pas, Annuler (reason dialog), Expédier (company + tracking dialog), Vendue en boutique, Livrée, Retour (dialog "Remettre en stock ?"). Show the 422 message if stock is insufficient. Edit order (items/qty/delivery fee/discount) when pending or confirmed. Print order slip. Export CSV of current filters.
- Produits: list with search/type filter/stock column/active toggle; create/edit form with images upload (main + gallery, reorder, delete), brand/type selects, notes, inspired_by, and a variants editor (rows: label, ml, price, compare_at_price, stock_mode pool/unit, active, reorder) with quick presets buttons (+10 ml, +20 ml, +30 ml, +Flacon 100 ml).
- Packs: same idea, plus a component picker (search variant, qty) and computed availability.
- Stock: overview table (product, ml pool, unit stock per variant, status ok/low/out), "Entrée de stock" dialog (product, ml or bottles × size, unit cost, note), "Ajustement/Perte" dialog, "Ouvrir un flacon" action, movements history with filters.
- Types, Marques: simple CRUD tables with dialogs.
- Clients: list with counters and blacklist toggle; click → their orders.
- Paramètres: shop info, show_unavailable switch, low-stock threshold, pickup on/off, free delivery threshold, wilaya fees table (inline edit home/desk fee + active), admin users (owner only), change my password.
Use optimistic UI or invalidate queries so counts/tabs update right after each action.

Test the full lifecycle in the browser: order placed in the shop → confirm (stock goes down) → ship → deliver; another one → cancel after confirm (stock comes back).
```

---

## Phase 6 — Caisse (POS) + Dashboard

```
Read CLAUDE.md, PLAN.md §2.2 (items 1 and 8) and backend/API.md.

Phase 6:
1. /admin/caisse — POS screen optimised for a tablet/laptop at the counter: product search + grid of perfumes with photos, clicking opens a variant picker (shows availability), cart on the right with qty +/- and remove, global discount (amount or %), payment method (espèces / carte / CCP-BaridiMob), amount received → change to give back, optional client name/phone. "Valider la vente" calls POST /admin/pos/sales; on success show a receipt view formatted for 80 mm thermal printers (window.print with a print stylesheet) and reset. Keyboard friendly (focus search with "/", Enter to validate).
2. /admin dashboard: date range picker (Aujourd'hui, 7 jours, Ce mois, custom), KPI cards (CA, commandes, en attente à appeler, en livraison, taux d'annulation, ventes caisse vs en ligne), line/bar chart of sales per day (recharts), top perfumes, low-stock alerts linking to the stock page, latest pending orders with quick Confirmer button.

Test: make a POS sale and check stock and dashboard numbers update.
```

---

## Phase 7 — Hardening & deploy to cPanel

```
Read CLAUDE.md and PLAN.md §8.

Phase 7 — production readiness:
1. Review security: mass assignment, authorization on every admin route (policies/role middleware), rate limits, upload validation (image mime + size limit), no debug in prod, CORS/Sanctum/session config for production domains via env, secure cookies, HTTPS only.
2. Performance: eager loading (no N+1 in listings), indexes used by the order filters, cache public settings/types/wilayas, `config:cache route:cache view:cache`.
3. Add `deploy/` with:
   - DEPLOY.md: step-by-step for cPanel shared hosting (subdomain api.<domain> → ~/laravel/public, MultiPHP version + extensions, DB creation, git clone/composer install --no-dev, .env production example, migrate --force, storage:link, caches, cron line for schedule:run, AutoSSL).
   - `.htaccess` for the React build (SPA fallback to index.html, cache headers for assets, gzip/brotli).
   - A `build-frontend` script that builds with the production VITE_API_URL and zips dist/ for upload.
   - A scheduled weekly mysqldump backup command into a non-public folder, keeping the last N files.
4. Run all backend tests and a production frontend build; fix warnings/errors.
List anything I must do by hand on the hosting panel.
```

---

## Handy one-off prompts

```
Add Arabic language with full RTL support to the shop (and optionally admin): language switcher, translate all strings in src/i18n, use logical CSS properties, Arabic font. Product names stay as entered.
```

```
Integrate the <Yalidine / ZR Express / …> delivery API: when I click "Expédier", create the parcel through their API, save the tracking number, and add a scheduled job that syncs parcel statuses and moves orders to Livrée / Retournée automatically. Keep it behind a setting so manual mode still works.
```

```
Add a "Confirmer par WhatsApp" button on pending orders that opens wa.me with a prefilled French/Arabic message containing the order summary.
```

```
Add purchase cost tracking per stock entry and a margins report (revenue − cost of goods per perfume per period) to the dashboard.
```
