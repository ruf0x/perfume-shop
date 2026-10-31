<?php

namespace Database\Seeders;

use App\Enums\ProductKind;
use App\Models\PerfumeType;
use App\Models\ProductType;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * The starting product types ("rayons") and their families / categories:
 * Parfums, Cosmétiques, Montres, Lunettes. The owner can add, rename, hide or reorder them afterwards.
 *
 * Safe to run again: it only creates what is missing and never touches what the owner changed.
 * `SHOP_TYPES=parfums,cosmetiques` in .env limits it to the types this shop sells (see config/shop.php).
 * On a server: php artisan db:seed --class=ProductTypeSeeder --force
 */
class ProductTypeSeeder extends Seeder
{
    /** name => [profile, uses a gender filter, [categories]] */
    public const TYPES = [
        'Parfums' => [ProductKind::Perfume, true, ['Designer', 'Niche', 'Arabe', 'Dupe', 'Création maison']],
        'Cosmétiques' => [ProductKind::Standard, false, ['Maquillage', 'Ongles', 'Soin du corps', 'Douche et bain', 'Cheveux', 'Déodorants', 'Soin du visage', 'Accessoires']],
        'Montres' => [ProductKind::Standard, true, ['Montres classiques', 'Montres sport', 'Montres connectées', 'Bracelets et accessoires']],
        'Lunettes' => [ProductKind::Standard, true, ['Lunettes de soleil', 'Lunettes de vue', 'Lunettes de lecture', 'Étuis et accessoires']],
    ];

    public function run(): void
    {
        $order = 0;

        $only = config('shop.types');

        foreach (self::TYPES as $name => [$profile, $gender, $categories]) {
            if ($only !== [] && ! in_array(Str::slug($name), $only, true)) {
                continue;
            }

            $type = ProductType::withTrashed()->firstOrNew(['slug' => Str::slug($name)]);

            if (! $type->exists) {
                $type->fill(['name' => $name, 'profile' => $profile, 'uses_gender' => $gender, 'sort_order' => $order, 'is_active' => true])->save();
            }

            foreach ($categories as $i => $categoryName) {
                $category = PerfumeType::withTrashed()->firstOrNew(['product_type_id' => $type->id, 'slug' => Str::slug($categoryName)]);

                if (! $category->exists) {
                    $category->fill(['name' => $categoryName, 'sort_order' => $order * 100 + $i, 'is_active' => true])->save();
                }
            }

            $order++;
        }
    }
}
