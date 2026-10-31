<?php

/*
|--------------------------------------------------------------------------
| Feature switches
|--------------------------------------------------------------------------
|
| Set in the code, per shop (not in the admin): this is a choice made when the shop is delivered.
| The desktop app is always part of the product; only the website's admin is optional.
|
| web_admin
|   true  = the admin works on the website (https://your-shop/admin) AND in the desktop app.
|   false = the desktop app only. The website's /admin page just says "use the desktop app",
|           and the server refuses the website's sign-in and every browser-session call.
|           The shop itself (catalogue, cart, orders) is not affected.
|
| On a server the configuration is cached: after changing a value, send this file and run
|   php artisan optimize:clear && php artisan optimize
| (the website reads the value from /api/settings/public, so the frontend needs no rebuild).
|
*/

return [

    'web_admin' => true,

];
