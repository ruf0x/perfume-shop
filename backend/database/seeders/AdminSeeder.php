<?php

namespace Database\Seeders;

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Database\Seeder;
use RuntimeException;

class AdminSeeder extends Seeder
{
    public function run(): void
    {
        $admin = config('shop.admin');

        if (blank($admin['username']) || blank($admin['password'])) {
            throw new RuntimeException('Set ADMIN_USERNAME and ADMIN_PASSWORD in .env before seeding.');
        }

        User::updateOrCreate(
            ['username' => $admin['username']],
            [
                'name' => $admin['name'],
                'password' => $admin['password'],
                'role' => UserRole::Owner,
                'is_active' => true,
            ],
        );
    }
}
