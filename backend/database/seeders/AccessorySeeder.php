<?php

namespace Database\Seeders;

use App\Enums\Gender;
use App\Enums\ProductKind;
use App\Enums\StockMode;
use App\Models\Brand;
use App\Models\PackItem;
use App\Models\Product;
use App\Models\ProductType;
use App\Models\ProductVariant;
use App\Services\StockService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * Demo products for the Montres and Lunettes types, plus packs mixing several types:
 *   php artisan db:seed --class=AccessorySeeder
 * Safe to run twice (existing names are skipped). Local use only: the owner enters the real catalogue.
 */
class AccessorySeeder extends Seeder
{
    private const GENDERS = ['h' => Gender::Homme, 'f' => Gender::Femme, 'm' => Gender::Mixte];

    public function run(): void
    {
        if (app()->environment('production')) {
            $this->command?->error('Refusing to add demo products in production.');

            return;
        }

        $this->call(ProductTypeSeeder::class);
        mt_srand(31);

        $created = 0;
        foreach ($this->catalogue() as $typeSlug => $categories) {
            $type = ProductType::query()->where('slug', $typeSlug)->firstOrFail();
            $ids = $type->categories()->pluck('id', 'slug');

            foreach ($categories as $categorySlug => $products) {
                foreach ($products as $i => [$name, $brandName, $gender, $description, $options]) {
                    if (Product::withTrashed()->where('slug', Str::slug($name))->exists()) {
                        continue;
                    }

                    $this->create($type, $ids[$categorySlug], $name, $brandName, $gender, $description, $options, $i);
                    $created++;
                }
            }
        }

        $packs = $this->packs();

        $this->command?->info("{$created} produit(s) et {$packs} pack(s) ajoutés.");
    }

    /**
     * name, brand, gender (h = homme, f = femme, m = mixte, null = none), description, options [label, price].
     *
     * @return array<string, array<string, list<array{0: string, 1: ?string, 2: ?string, 3: string, 4: list<array{0: string, 1: int}>}>>>
     */
    private function catalogue(): array
    {
        return [
            'montres' => [
                'montres-classiques' => [
                    ['Casio Vintage A168', 'Casio', 'm', 'Montre digitale rétro, bracelet acier.', [['Argent', 6500], ['Doré', 7500], ['Noir', 7000]]],
                    ['Casio Edifice EFB-108', 'Casio', 'h', 'Chronographe acier, verre minéral.', [['Noir', 28000], ['Bleu', 29000]]],
                    ['Citizen Eco-Drive BM7', 'Citizen', 'h', 'Solaire : jamais de pile à changer.', [['Noir', 42000], ['Bleu', 43500]]],
                    ['Orient Bambino', 'Orient', 'h', 'Automatique, cadran bombé élégant.', [['Blanc', 38000], ['Bleu', 38000], ['Noir', 38000]]],
                    ['Fossil Grant', 'Fossil', 'h', 'Chronographe, bracelet cuir.', [['Marron', 26000], ['Noir', 26000]]],
                    ['Daniel Wellington Classic', 'Daniel Wellington', 'f', 'Ultra-fine, bracelet NATO interchangeable.', [['36 mm Or rose', 32000], ['36 mm Argent', 32000], ['40 mm Noir', 34000]]],
                    ['Tissot PRX', 'Tissot', 'h', 'Quartz, bracelet intégré.', [['Bleu', 115000], ['Noir', 115000]]],
                ],
                'montres-sport' => [
                    ['G-Shock GA-2100', 'Casio', 'h', "Résistante aux chocs, étanche jusqu'à 200 m.", [['Noir', 24000], ['Vert', 25000], ['Blanc', 25000]]],
                    ['Seiko 5 Sports', 'Seiko', 'h', 'Automatique, étanche 100 m.', [['Noir', 38000], ['Bleu', 38000]]],
                    ['Baby-G BA-110', 'Casio', 'f', 'Sportive et résistante aux chocs.', [['Rose', 22000], ['Blanc', 22000], ['Noir', 22000]]],
                ],
                'montres-connectees' => [
                    ['Xiaomi Smart Band 8', 'Xiaomi', 'm', "Écran AMOLED, 16 jours d'autonomie.", [['Noir', 8500], ['Or', 9000]]],
                    ['Samsung Galaxy Watch 6', 'Samsung', 'm', 'Suivi santé et sport, écran saphir.', [['40 mm Graphite', 58000], ['44 mm Argent', 64000]]],
                    ['Huawei Watch Fit 3', 'Huawei', 'm', 'Fine et légère, GPS intégré.', [['Noir', 27000], ['Rose', 27000]]],
                ],
                'bracelets-et-accessoires' => [
                    ['Bracelet cuir', null, 'm', 'Cuir véritable, fermoir ardillon.', [['18 mm Noir', 1800], ['20 mm Marron', 1800], ['22 mm Noir', 2000]]],
                    ['Bracelet acier milanais', null, 'm', 'Inox, fermoir magnétique réglable.', [['20 mm Argent', 2500], ['22 mm Argent', 2700]]],
                    ['Écrin à montre', null, null, 'Boîte de présentation, coussin amovible.', [['Noir', 1500], ['Brun', 1500]]],
                ],
            ],
            'lunettes' => [
                'lunettes-de-soleil' => [
                    ['Ray-Ban Wayfarer RB2140', 'Ray-Ban', 'm', 'Le classique, verres G-15.', [['Noir', 24000], ['Havane', 24000]]],
                    ['Ray-Ban Aviator RB3025', 'Ray-Ban', 'm', 'Monture métal légère.', [['Or / Vert', 26000], ['Argent / Miroir', 27500]]],
                    ['Oakley Holbrook', 'Oakley', 'h', 'Légères, pour la ville et le sport.', [['Noir mat', 21000], ['Bleu', 21500]]],
                    ['Polaroid PLD 2057', 'Polaroid', 'm', 'Verres polarisés, protection UV400.', [['Noir', 9500], ['Écaille', 9500]]],
                    ['Carrera 8052', 'Carrera', 'h', 'Style aviateur, monture fine.', [['Noir', 17000], ['Gris', 17000]]],
                    ["Guess œil de chat", 'Guess', 'f', 'Monture galbée, verres dégradés.', [['Noir', 11000], ['Rose', 11000]]],
                ],
                'lunettes-de-vue' => [
                    ['Ray-Ban Clubmaster optique', 'Ray-Ban', 'm', 'Monture pour verres correcteurs.', [['Noir', 18000], ['Écaille', 18000]]],
                    ['Monture titane', null, 'h', 'Ultra-légère, hypoallergénique.', [['Gris', 9000], ['Bleu nuit', 9000]]],
                    ['Monture papillon', null, 'f', 'Acétate, charnières renforcées.', [['Rose', 7500], ['Noir', 7500]]],
                ],
                'lunettes-de-lecture' => [
                    ['Lunettes de lecture', null, 'm', 'Verres anti-reflet.', [['+1.0', 1500], ['+1.5', 1500], ['+2.0', 1500], ['+2.5', 1500], ['+3.0', 1500]]],
                    ['Lunettes de lecture pliantes', null, 'm', 'Se glissent dans une poche, étui inclus.', [['+1.5', 2200], ['+2.0', 2200], ['+2.5', 2200]]],
                ],
                'etuis-et-accessoires' => [
                    ['Étui rigide', null, null, 'Protège vos lunettes des chocs.', [['Noir', 900], ['Marron', 900]]],
                    ['Chiffon microfibre', null, null, 'Nettoie sans rayer.', [['Lot de 3', 300]]],
                    ['Chaînette pour lunettes', null, null, 'Maille fine, ne se perd pas.', [['Or', 700], ['Argent', 700]]],
                ],
            ],
        ];
    }

    /** @param list<array{0: string, 1: int}> $options */
    private function create(ProductType $type, int $categoryId, string $name, ?string $brandName, ?string $gender, string $description, array $options, int $order): void
    {
        $brand = $brandName ? Brand::firstOrCreate(['slug' => Str::slug($brandName)], ['name' => $brandName]) : null;
        $brand && $type->brands()->syncWithoutDetaching([$brand->id]);

        $product = Product::create([
            'kind' => ProductKind::Standard,
            'product_type_id' => $type->id,
            'name' => $name,
            'slug' => Str::slug($name),
            'brand_id' => $brand?->id,
            'perfume_type_id' => $categoryId,
            'gender' => $gender ? self::GENDERS[$gender] : null,
            'short_description' => $description,
            'is_featured' => $order === 0,
            'sort_order' => $order,
        ]);

        $stock = app(StockService::class);

        foreach ($options as $n => [$label, $price]) {
            $variant = $product->variants()->create(['label' => $label, 'price' => $price, 'stock_mode' => StockMode::Unit, 'sort_order' => $n]);

            $units = mt_rand(0, 9) === 0 ? 0 : mt_rand(2, 25);   // about one option in ten is sold out
            if ($units > 0) {
                $stock->addEntry($product, $variant, qty: $units, note: 'Stock initial (démo)');
            }
        }
    }

    /** Packs that mix several product types. Returns how many were created. */
    private function packs(): int
    {
        $find = fn (string $product, ?string $label = null): ?ProductVariant => Product::query()->where('slug', Str::slug($product))->first()
            ?->variants()->when($label, fn ($q) => $q->where('label', $label))->orderBy('sort_order')->first();

        $perfume = Product::query()->perfumes()->active()->where('stock_ml', '>', 100)->whereHas('variants', fn ($q) => $q->where('ml', 10))->orderBy('id')->first();
        $perfume10 = $perfume?->variants()->where('ml', 10)->first();

        $definitions = [
            ['Pack Cadeau Homme', 'montres', 'Un parfum en 10 ml, une montre Casio et son écrin : un cadeau complet.', 9500, [
                [$perfume10, 1], [$find('Casio Vintage A168', 'Noir'), 1], [$find('Écrin à montre', 'Noir'), 1],
            ]],
            ['Pack Soleil', 'lunettes', 'Lunettes Wayfarer, étui rigide et chiffon microfibre.', 25000, [
                [$find('Ray-Ban Wayfarer RB2140', 'Noir'), 1], [$find('Étui rigide', 'Noir'), 1], [$find('Chiffon microfibre'), 1],
            ]],
        ];

        $created = 0;
        foreach ($definitions as [$name, $typeSlug, $description, $price, $components]) {
            $components = array_filter($components, fn (array $c) => $c[0] !== null);
            if (count($components) < 2 || Product::withTrashed()->where('slug', Str::slug($name))->exists()) {
                continue;
            }

            $pack = Product::create([
                'kind' => ProductKind::Pack,
                'product_type_id' => ProductType::query()->where('slug', $typeSlug)->value('id'),
                'name' => $name,
                'slug' => Str::slug($name),
                'short_description' => $description,
                'description' => $description,
                'is_featured' => true,
            ]);
            $packVariant = $pack->variants()->create(['label' => 'Pack', 'price' => $price, 'stock_mode' => StockMode::Pack]);

            foreach ($components as [$component, $quantity]) {
                PackItem::create(['pack_variant_id' => $packVariant->id, 'component_variant_id' => $component->id, 'quantity' => $quantity]);
            }
            $created++;
        }

        return $created;
    }
}
