<?php

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

require_once __DIR__.'/Helpers.php';

// The database-name guard lives in Tests\TestCase::createApplication().
pest()->extend(TestCase::class)
    ->use(RefreshDatabase::class)
    ->in('Feature');
