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
| backorder
|   true  = the customer never sees the stock. A product is either listed or not (the low-stock thresholds of the
|           settings decide), and when it is listed the customer can order any quantity (up to 50). The owner sees
|           the stock left on each line of the order and decides: confirm, or keep the order aside until stock arrives.
|   false = the shop caps the quantity at what is in stock and tells the customer when only a few are left.
|
| loyalty_every
|   6    = every 6 perfumes a customer buys (any size, counted by phone number over all their orders) earn a gift
|          flacon, about the value of the average price of those 6. null = the programme is off.
|
| On a server the configuration is cached: after changing a value, send this file and run
|   php artisan optimize:clear && php artisan optimize
| (the website reads the value from /api/settings/public, so the frontend needs no rebuild).
|
*/

return [

    'web_admin' => true,

    'backorder' => true,

    // Buy this many perfumes (over any number of orders), the next one is a gift. null = no loyalty programme.
    'loyalty_every' => 6,

];
