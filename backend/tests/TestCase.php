<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use RuntimeException;

abstract class TestCase extends BaseTestCase
{
    /**
     * RefreshDatabase wipes the schema, so never let tests run against the dev database.
     * This runs before any trait touches the database.
     */
    public function createApplication()
    {
        $app = parent::createApplication();

        $connection = $app['config']->get('database.default');
        $database = (string) $app['config']->get("database.connections.{$connection}.database");

        if ($connection !== 'sqlite' && ! str_ends_with($database, '_test')) {
            throw new RuntimeException("Refusing to run tests on database '{$database}': its name must end with _test.");
        }

        return $app;
    }
}
