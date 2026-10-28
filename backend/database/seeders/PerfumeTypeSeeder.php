<?php

namespace Database\Seeders;

use App\Models\PerfumeType;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class PerfumeTypeSeeder extends Seeder
{
    public function run(): void
    {
        foreach (['Designer', 'Niche', 'Arabe', 'Dupe', 'Création maison'] as $i => $name) {
            PerfumeType::updateOrCreate(
                ['slug' => Str::slug($name)],
                ['name' => $name, 'sort_order' => $i, 'is_active' => true],
            );
        }
    }
}
