<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            WilayaSeeder::class,
            ProductTypeSeeder::class,
            AdminSeeder::class,
        ]);

        if (app()->environment('local')) {
            $this->call([DemoSeeder::class, PurchaseCostSeeder::class]);
        }
    }
}
