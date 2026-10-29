<?php

use Illuminate\Support\Facades\Schedule;

// Needs one cron line on the server: * * * * * php artisan schedule:run (see deploy/DEPLOY.md).
Schedule::command('db:backup --keep=8')->weeklyOn(0, '03:00')->withoutOverlapping();
