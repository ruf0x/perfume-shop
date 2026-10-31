<?php

use Illuminate\Support\Facades\Schedule;

// Needs one cron line on the server: * * * * * php artisan schedule:run (see deploy/DEPLOY.md).
// Desktop-app tokens expire after 30 days: tidy the expired ones.
Schedule::command('sanctum:prune-expired --hours=24')->daily();
Schedule::command('db:backup --keep=8')->weeklyOn(0, '03:00')->withoutOverlapping();
