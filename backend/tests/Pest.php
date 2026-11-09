<?php

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

require_once __DIR__.'/Helpers.php';

// The database-name guard lives in Tests\TestCase::createApplication().
pest()->extend(TestCase::class)
    ->use(RefreshDatabase::class)
    ->in('Feature');

// Most tests describe a shop that caps orders at the stock; BackorderTest turns the other mode on.
pest()->beforeEach(fn () => config(['features.backorder' => false]))->in('Feature');
