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
Env: copy `backend/.env.example` → `backend/.env` and set the DB password (`DB_PASSWORD`; local MariaDB root has one). `frontend/.env` needs `VITE_API_URL=http://localhost:8000`. Until Phase 1, `backend/.env` uses sqlite.
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

## Notes
- Laravel 13 / TypeScript 7 were the latest at setup time (PLAN.md says Laravel 12); TS 7 has no `baseUrl`, the `@/*` alias is set via `paths` only.
- shadcn `form` component is not in the registry anymore; use react-hook-form directly with `Label`/`Input`.
