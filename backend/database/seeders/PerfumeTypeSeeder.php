<?php

namespace Database\Seeders;

use App\Enums\ProductKind;
use App\Models\PerfumeType;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * Perfume families and cosmetic categories. Safe to run again: existing rows are only refreshed,
 * and anything the owner added is left alone.
 */
class PerfumeTypeSeeder extends Seeder
{
    public const FAMILIES = ['Designer', 'Niche', 'Arabe', 'Dupe', 'Création maison'];

    public const CATEGORIES = ['Maquillage', 'Ongles', 'Soin du corps', 'Douche et bain', 'Cheveux', 'Déodorants', 'Soin du visage', 'Accessoires'];

    public function run(): void
    {
        foreach (self::FAMILIES as $i => $name) {
            $this->save($name, ProductKind::Perfume, $i);
        }

        foreach (self::CATEGORIES as $i => $name) {
            $this->save($name, ProductKind::Cosmetic, 100 + $i);
        }
    }

    private function save(string $name, ProductKind $kind, int $order): void
    {
        $type = PerfumeType::withTrashed()->firstOrNew(['slug' => Str::slug($name)]);

        // A category the owner renamed, hid or reordered keeps their choices.
        if (! $type->exists) {
            $type->fill(['name' => $name, 'sort_order' => $order, 'is_active' => true]);
        }
        $type->kind = $kind;
        $type->save();
    }
}
