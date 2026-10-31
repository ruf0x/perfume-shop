# Commands

Run these from the `perfume-shop` folder in **PowerShell**.

## See the app

| What | Command |
|---|---|
| Start everything (API + shop/admin, two windows) | `.\start.ps1` |
| Start and open the admin in a **private window** (you must see the login page) | `.\start.ps1 -Private` |
| Start with a fresh demo database (erases orders and customers) | `.\start.ps1 -Reset` |
| Prove the admin is protected (17 checks, PASS/FAIL table) | `.\scripts\check-auth.ps1` |

Then open:

| Page | URL |
|---|---|
| Shop | http://localhost:3000 |
| Admin (login required) | http://localhost:3000/admin |
| API docs (Swagger-style, local only) | http://localhost:8000/docs/api |

Admin login: the `ADMIN_USERNAME` / `ADMIN_PASSWORD` from `backend\.env`.

## About the login

- The admin uses a **cookie session** (Laravel Sanctum + CSRF). Not signed in => `/admin` redirects to the login page and every `/api/admin/*` route answers `401`.
- Once you sign in, your browser stays signed in until you **close the browser**, click **Se déconnecter** (sidebar), or 60 minutes pass without activity. That is why reopening the admin in the same browser goes straight in.
- To see the login page again: use a private window, or sign everyone out:

```powershell
cd backend
php artisan auth:sign-out-everyone
```

- `POST /api/admin/token` (Bearer tokens) exists **only for Postman/Swagger testing** and only when `APP_ENV=local`. The real admin never uses tokens.

## Backend (`cd backend`)

| What | Command |
|---|---|
| Run the API alone | `composer serve` |
| Run all tests (139+) on the `perfume_shop_test` database | `vendor/bin/pest` |
| Rebuild the demo database | `php artisan migrate:fresh --seed` |
| Fix the cached stock totals from the ledger | `php artisan stock:recalculate` |
| Sign every admin out | `php artisan auth:sign-out-everyone` |
| Regenerate the API spec | `php artisan scramble:export --path=docs/openapi.json` |
| Regenerate the Postman collection | `node docs/build-postman.mjs` |

## Frontend (`cd frontend`)

| What | Command |
|---|---|
| Run the shop + admin | `npm run dev -- --open false` |
| Type-check and build | `npm run build` |
| Lint | `npm run lint` |

If the page is blank after adding a package: stop Vite and start it again with `npx vite --force`.

## Database

```powershell
& "C:\Program Files\MariaDB 13.0\bin\mariadb.exe" -uroot -p perfume_shop
```

Useful queries: `SELECT reference, status, total, created_at FROM orders;` and `SELECT name, stock_ml FROM products;`.

## Desktop app (Electron)

Run these from the `desktop` folder. The admin screens are the website's own, packed into a Windows app.

| What | Command |
|---|---|
| Install (once) | `npm install` |
| Build the admin, then open the app | `npm start` |
| Open the app without rebuilding the admin | `npm run dev` |
| Build the Windows installer (`desktop\dist\Administration-Boutique-Setup-1.0.0.exe`) | `npm run dist` |

First launch asks for the shop's server address (for example `https://api.arena-cosmetique.com`); for a local test, `http://localhost:8000`.
After changing the frontend, run `npm run web` again before `npm start` / `npm run dist`.

Switch the website's admin off or on (the desktop app keeps working), from `backend`:

```powershell
php artisan admin:web off
php artisan admin:web on
php artisan admin:web      # shows the current state
```

The same switch is in the admin: Paramètres > Accès.
