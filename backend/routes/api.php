<?php

use App\Http\Controllers\Admin\AuthController;
use App\Http\Controllers\Admin\BottleController;
use App\Http\Controllers\Admin\BrandController;
use App\Http\Controllers\Admin\CustomerController;
use App\Http\Controllers\Admin\LoyaltyController;
use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\OrderController;
use App\Http\Controllers\Admin\PosController;
use App\Http\Controllers\Admin\ProductController;
use App\Http\Controllers\Admin\ProductImageController;
use App\Http\Controllers\Admin\ProductTypeController;
use App\Http\Controllers\Admin\SettingsController;
use App\Http\Controllers\Admin\StockController;
use App\Http\Controllers\Admin\TypeController;
use App\Http\Controllers\Admin\UserController;
use App\Http\Controllers\Public\CatalogController;
use App\Http\Controllers\Public\GeoController;
use App\Http\Controllers\Public\ShopController;
use Illuminate\Support\Facades\Route;

Route::get('/ping', fn () => response()->json(['pong' => true]));

/*
| Public storefront (no authentication).
*/
Route::get('/settings/public', [ShopController::class, 'settings']);
// Lists that almost never change are cached by the browser for a few minutes (fewer requests to the host).
Route::middleware('cache.headers:public;max_age=300;etag')->group(function () {
    Route::get('/product-types', [CatalogController::class, 'productTypes']);
    Route::get('/types', [CatalogController::class, 'types']);
    Route::get('/brands', [CatalogController::class, 'brands']);
    Route::get('/wilayas', [GeoController::class, 'wilayas']);
    Route::get('/wilayas/{wilaya}/communes', [GeoController::class, 'communes']);
});
Route::get('/products', [CatalogController::class, 'index']);
Route::get('/products/{slug}', [CatalogController::class, 'show']);
Route::post('/cart/validate', [ShopController::class, 'validateCart']);
Route::post('/orders', [ShopController::class, 'placeOrder'])->middleware('throttle:orders');

/*
| Admin (cookie session via Sanctum).
| Staff can use orders, the caisse and read the catalogue / stock; everything else is owner-only.
*/
Route::prefix('admin')->group(function () {
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:login');
    Route::post('/token', [AuthController::class, 'token'])->middleware('throttle:login');
    // The desktop app signs in here and keeps the token (no cookie, no CSRF).
    Route::post('/desktop/login', [AuthController::class, 'desktopLogin'])->middleware('throttle:login');

    Route::middleware(['auth:sanctum', 'active', 'web.admin'])->group(function () {
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::get('/me', [AuthController::class, 'me']);
        Route::put('/me/password', [AuthController::class, 'changePassword']);

        // Owner and staff.
        Route::get('/orders/export', [OrderController::class, 'export']);
        Route::get('/orders', [OrderController::class, 'index']);
        Route::get('/orders/{order}', [OrderController::class, 'show']);
        Route::put('/orders/{order}', [OrderController::class, 'update']);
        Route::post('/orders/{order}/transition', [OrderController::class, 'transition']);

        Route::post('/pos/sales', [PosController::class, 'store']);
        Route::get('/loyalty', [LoyaltyController::class, 'lookup']);

        Route::get('/products', [ProductController::class, 'index']);
        Route::get('/products/{product}', [ProductController::class, 'show']);
        Route::get('/product-types', [ProductTypeController::class, 'index']);
        Route::get('/types', [TypeController::class, 'index']);
        Route::get('/brands', [BrandController::class, 'index']);
        Route::get('/stock', [StockController::class, 'index']);
        Route::get('/stock/movements', [StockController::class, 'movements']);

        // Owner only.
        Route::middleware('role:owner')->group(function () {
            Route::get('/dashboard', DashboardController::class);

            Route::post('/products', [ProductController::class, 'store']);
            Route::put('/products/{product}', [ProductController::class, 'update']);
            Route::delete('/products/{product}', [ProductController::class, 'destroy']);
            Route::post('/products/{product}/images', [ProductImageController::class, 'store']);
            Route::put('/products/{product}/images/order', [ProductImageController::class, 'reorder']);
            Route::delete('/images/{image}', [ProductImageController::class, 'destroy']);

            Route::post('/product-types', [ProductTypeController::class, 'store']);
            Route::put('/product-types/{productType}', [ProductTypeController::class, 'update']);
            Route::delete('/product-types/{productType}', [ProductTypeController::class, 'destroy']);
            Route::post('/types', [TypeController::class, 'store']);
            Route::put('/types/{type}', [TypeController::class, 'update']);
            Route::delete('/types/{type}', [TypeController::class, 'destroy']);
            Route::post('/brands', [BrandController::class, 'store']);
            Route::put('/brands/{brand}', [BrandController::class, 'update']);
            Route::delete('/brands/{brand}', [BrandController::class, 'destroy']);

            Route::get('/bottles', [BottleController::class, 'index']);
            Route::get('/bottles/movements', [BottleController::class, 'movements']);
            Route::post('/bottles/entries', [BottleController::class, 'entry']);
            Route::post('/bottles/adjustments', [BottleController::class, 'adjustment']);

            Route::post('/stock/entries', [StockController::class, 'entry']);
            Route::post('/stock/adjustments', [StockController::class, 'adjustment']);
            Route::post('/stock/open-bottle', [StockController::class, 'openBottle']);

            Route::get('/customers', [CustomerController::class, 'index']);
            Route::get('/customers/{customer}', [CustomerController::class, 'show']);
            Route::patch('/customers/{customer}', [CustomerController::class, 'update']);
            Route::get('/customers/{customer}/loyalty', [LoyaltyController::class, 'show']);
            Route::post('/customers/{customer}/loyalty/redeem', [LoyaltyController::class, 'redeem']);

            Route::get('/settings', [SettingsController::class, 'show']);
            Route::put('/settings', [SettingsController::class, 'update']);
            Route::get('/wilayas', [SettingsController::class, 'wilayas']);
            Route::put('/wilayas/{wilaya}', [SettingsController::class, 'updateWilaya']);

            Route::get('/users', [UserController::class, 'index']);
            Route::post('/users', [UserController::class, 'store']);
            Route::put('/users/{user}', [UserController::class, 'update']);
            Route::delete('/users/{user}', [UserController::class, 'destroy']);
        });
    });
});
