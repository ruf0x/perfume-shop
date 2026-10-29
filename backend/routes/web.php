<?php

use Illuminate\Support\Facades\Route;

// The API domain has no pages of its own: send visitors to the shop instead of Laravel's welcome page.
Route::get('/', fn () => redirect()->away(rtrim(config('app.frontend_url'), '/').'/'));
