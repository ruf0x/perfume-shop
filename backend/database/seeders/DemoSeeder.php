<?php

namespace Database\Seeders;

use App\Enums\Gender;
use App\Enums\ProductKind;
use App\Enums\StockMode;
use App\Enums\StockMovementType;
use App\Models\Brand;
use App\Models\PackItem;
use App\Models\PerfumeType;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\StockMovement;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * Local demo catalogue. Stock goes through stock_movements ('entree') so the
 * ledger and the cached totals stay consistent from the start.
 */
class DemoSeeder extends Seeder
{
    /** Price per size in DZD, by type: [10 ml, 20 ml, 30 ml, sealed 100 ml]. */
    private const PRICES = [
        'designer' => [1500, 2800, 4000, 14000],
        'niche' => [2800, 5200, 7500, 28000],
        'arabe' => [900, 1700, 2400, 8000],
        'dupe' => [800, 1500, 2100, 6500],
        'creation-maison' => [1000, 1900, 2700, 9000],
    ];

    public function run(): void
    {
        $types = PerfumeType::pluck('id', 'slug');
        $made = [];

        // name, brand, type, gender, inspired_by, [top, heart, base], pool ml, sealed bottles
        $perfumes = [
            ['Sauvage', 'Dior', 'designer', Gender::Homme, null, ['Bergamote', 'Poivre', 'Ambroxan'], 400, 3],
            ['Bleu de Chanel', 'Chanel', 'designer', Gender::Homme, null, ['Agrumes', 'Gingembre', 'Cèdre'], 300, 2],
            ['La Vie Est Belle', 'Lancôme', 'designer', Gender::Femme, null, ['Poire', 'Iris', 'Praliné'], 500, 4],
            ['Black Opium', 'Yves Saint Laurent', 'designer', Gender::Femme, null, ['Café', 'Jasmin', 'Vanille'], 8, 0],
            ['Aventus', 'Creed', 'niche', Gender::Homme, null, ['Ananas', 'Bouleau', 'Musc'], 200, 1],
            ['Baccarat Rouge 540', 'Maison Francis Kurkdjian', 'niche', Gender::Mixte, null, ['Safran', 'Jasmin', 'Ambre'], 300, 2],
            ['Layton', 'Parfums de Marly', 'niche', Gender::Homme, null, ['Pomme', 'Lavande', 'Vanille'], 0, 0],
            ['Khamrah', 'Lattafa', 'arabe', Gender::Mixte, null, ['Cannelle', 'Dattes', 'Praliné'], 600, 5],
            ['Hawas', 'Rasasi', 'arabe', Gender::Homme, null, ['Pomme', 'Cannelle', 'Ambre'], 450, 3],
            ['Amber Oud Gold Edition', 'Al Haramain', 'arabe', Gender::Mixte, null, ['Bergamote', 'Rose', 'Oud'], 350, 2],
            ['Club de Nuit Intense Man', 'Armaf', 'dupe', Gender::Homme, 'Creed Aventus', ['Citron', 'Bouleau', 'Musc'], 700, 4],
            ['Asad', 'Lattafa', 'dupe', Gender::Homme, 'Dior Sauvage Elixir', ['Poivre noir', 'Tabac', 'Vanille'], 500, 3],
            ['Nuit d\'Ambre', null, 'creation-maison', Gender::Mixte, null, ['Safran', 'Rose', 'Ambre gris'], 300, 0],
            ['Oud Royal', null, 'creation-maison', Gender::Mixte, null, ['Cardamome', 'Oud', 'Santal'], 250, 0],
            ['Rose Sahara', null, 'creation-maison', Gender::Femme, null, ['Rose', 'Pivoine', 'Musc blanc'], 200, 0],
        ];

        foreach ($perfumes as $i => [$name, $brandName, $typeSlug, $gender, $inspiredBy, $notes, $poolMl, $sealed]) {
            $brand = $brandName
                ? Brand::firstOrCreate(['slug' => Str::slug($brandName)], ['name' => $brandName])
                : null;

            $product = Product::create([
                'kind' => ProductKind::Perfume,
                'name' => $name,
                'slug' => Str::slug($name),
                'brand_id' => $brand?->id,
                'perfume_type_id' => $types[$typeSlug],
                'gender' => $gender,
                'inspired_by' => $inspiredBy,
                'short_description' => "{$name} — parfum ".($gender->value === 'mixte' ? 'mixte' : "pour {$gender->value}").'.',
                'notes_top' => $notes[0],
                'notes_heart' => $notes[1],
                'notes_base' => $notes[2],
                'is_featured' => $i % 4 === 0,
                'sort_order' => $i,
            ]);

            [$p10, $p20, $p30, $pFull] = self::PRICES[$typeSlug];
            $variants = [];
            foreach ([[10, $p10], [20, $p20], [30, $p30]] as $n => [$ml, $price]) {
                $variants[$ml] = $product->variants()->create([
                    'label' => "{$ml} ml",
                    'ml' => $ml,
                    'price' => $price,
                    'stock_mode' => StockMode::Pool,
                    'sort_order' => $n,
                ]);
            }
            $full = $product->variants()->create([
                'label' => 'Flacon complet 100 ml',
                'ml' => 100,
                'price' => $pFull,
                'stock_mode' => StockMode::Unit,
                'sort_order' => 3,
            ]);

            if ($poolMl > 0) {
                $this->receive($product, null, $poolMl, 0, 'Stock initial (démo)');
            }
            if ($sealed > 0) {
                $this->receive($product, $full, 0, $sealed, 'Flacons scellés (démo)');
            }

            $made[$name] = $variants;
        }

        $this->pack('Pack Découverte', 'Trois décants de 10 ml pour découvrir nos best-sellers.', 2200, [
            ['Sauvage', 10, 1], ['Khamrah', 10, 1], ['Club de Nuit Intense Man', 10, 1],
        ], $made);

        $this->pack('Pack Couple', 'Un parfum homme et un parfum femme en 30 ml.', 5500, [
            ['Bleu de Chanel', 30, 1], ['La Vie Est Belle', 30, 1],
        ], $made);
    }

    /** Add stock through the ledger and keep the cached totals in sync. */
    private function receive(Product $product, ?ProductVariant $variant, int $ml, int $qty, string $note): void
    {
        StockMovement::create([
            'product_id' => $product->id,
            'variant_id' => $variant?->id,
            'type' => StockMovementType::Entree,
            'ml_change' => $ml,
            'qty_change' => $qty,
            'note' => $note,
        ]);

        $product->increment('stock_ml', $ml);
        $variant?->increment('stock_qty', $qty);
    }

    /**
     * @param  list<array{0: string, 1: int, 2: int}>  $components  [perfume name, ml, quantity]
     * @param  array<string, array<int, ProductVariant>>  $made
     */
    private function pack(string $name, string $description, int $price, array $components, array $made): void
    {
        $pack = Product::create([
            'kind' => ProductKind::Pack,
            'name' => $name,
            'slug' => Str::slug($name),
            'short_description' => $description,
            'description' => $description,
            'is_featured' => true,
        ]);

        $variant = $pack->variants()->create([
            'label' => 'Pack',
            'price' => $price,
            'stock_mode' => StockMode::Pack,
        ]);

        foreach ($components as [$perfume, $ml, $quantity]) {
            PackItem::create([
                'pack_variant_id' => $variant->id,
                'component_variant_id' => $made[$perfume][$ml]->id,
                'quantity' => $quantity,
            ]);
        }
    }
}
