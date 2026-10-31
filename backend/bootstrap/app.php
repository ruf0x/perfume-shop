<?php

use App\Exceptions\InsufficientStockException;
use App\Exceptions\ShopException;
use App\Http\Middleware\EnsureActiveUser;
use App\Http\Middleware\EnsureRole;
use App\Http\Middleware\EnsureWebAdminAllowed;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Routing\Middleware\SubstituteBindings;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->statefulApi();
        $middleware->alias([
            'active' => EnsureActiveUser::class,
            'role' => EnsureRole::class,
            'web.admin' => EnsureWebAdminAllowed::class,
        ]);
        // Check access before route-model binding, so a forbidden user gets 403 whether or not the id exists.
        $middleware->prependToPriorityList(before: SubstituteBindings::class, prepend: EnsureActiveUser::class);
        $middleware->prependToPriorityList(before: SubstituteBindings::class, prepend: EnsureRole::class);
        $middleware->prependToPriorityList(before: SubstituteBindings::class, prepend: EnsureWebAdminAllowed::class);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        // Business-rule failures (stock, invalid transition, blacklist...) => 422 with a French message.
        $exceptions->render(function (ShopException $e, Request $request) {
            if (! ($request->is('api/*') || $request->expectsJson())) {
                return null;
            }

            return response()->json(array_filter([
                'message' => $e->getMessage(),
                'shortages' => $e instanceof InsufficientStockException ? $e->shortages : null,
            ]), 422);
        });
    })->create();
