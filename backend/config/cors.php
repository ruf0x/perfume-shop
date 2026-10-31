<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Here you may configure your settings for cross-origin resource sharing
    | or "CORS". This determines what cross-origin operations may execute
    | in web browsers. You are free to adjust these settings as needed.
    |
    | To learn more: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
    |
    */

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    // `app://local` is the desktop app (a custom scheme only that app can load); it signs in with a Bearer token.
    'allowed_origins' => [...array_filter(explode(',', env('CORS_ALLOWED_ORIGINS', env('FRONTEND_URL', 'http://localhost:5173')))), 'app://local'],

    // Local dev only: the Vite/preview port changes (5173, 3000, ...), so accept any localhost port.
    'allowed_origins_patterns' => env('APP_ENV') === 'local'
        ? ['#^http://(localhost|127\.0\.0\.1)(:\d+)?$#']
        : [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => true,

];
