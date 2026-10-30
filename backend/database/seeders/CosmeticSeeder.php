<?php

namespace Database\Seeders;

use App\Enums\ProductKind;
use App\Enums\StockMode;
use App\Models\Brand;
use App\Models\PackItem;
use App\Models\PerfumeType;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Services\StockService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * Demo cosmetics, mixed packs included:
 *   php artisan db:seed --class=CosmeticSeeder
 * Safe to run twice (existing names are skipped). Local use only: the owner enters the real catalogue.
 * Stock goes in through StockService so the ledger and the cached totals agree.
 */
class CosmeticSeeder extends Seeder
{
    public function run(): void
    {
        if (app()->environment('production')) {
            $this->command?->error('Refusing to add demo products in production.');

            return;
        }

        $this->call(PerfumeTypeSeeder::class);
        mt_srand(2026);

        $types = PerfumeType::pluck('id', 'slug');
        $created = 0;

        foreach ($this->catalogue() as $categorySlug => $products) {
            foreach ($products as $i => [$name, $brandName, $description, $options]) {
                if (Product::withTrashed()->where('slug', Str::slug($name))->exists()) {
                    continue;
                }

                $this->create($types[$categorySlug], $name, $brandName, $description, $options, $i);
                $created++;
            }
        }

        $packs = $this->packs();

        $this->command?->info("{$created} cosmétique(s) et {$packs} pack(s) ajoutés.");
    }

    /**
     * Each option: [label, price, mode, ml]. `unit` = counted piece, `pool` = poured from the product's ml stock.
     *
     * @return array<string, list<array{0: string, 1: ?string, 2: string, 3: list<array{0: string, 1: int, 2?: string, 3?: ?int}>}>>
     */
    private function catalogue(): array
    {
        return [
            'maquillage' => [
                ['Rouge à lèvres mat', 'Maybelline', 'Tenue longue durée, fini mat velouté.', [['Rose nude', 1400], ['Rouge cerise', 1400], ['Corail', 1400], ['Brun chocolat', 1400]]],
                ['Mascara volume', "L'Oréal", 'Volume et courbure intenses, noir profond.', [['Noir', 1900]]],
                ['Fond de teint fluide', 'Maybelline', 'Couvrance modulable, 24 h de confort.', [['Beige clair', 2400], ['Beige moyen', 2400], ['Beige doré', 2400], ['Ambre', 2400]]],
                ['Palette de fards 12 couleurs', null, 'Teintes nude et irisées, très pigmentées.', [['Nude', 1800], ['Smoky', 1800]]],
                ['Poudre compacte', 'Rimmel', 'Matifie sans dessécher.', [['Translucide', 1300], ['Beige', 1300]]],
                ['Eye-liner liquide', 'Maybelline', 'Pointe fine, tracé précis.', [['Noir', 950], ['Marron', 950]]],
                ['Gloss repulpant', null, 'Brillance miroir, effet volume.', [['Transparent', 700], ['Rose', 700], ['Pêche', 700]]],
                ['Blush poudre', 'Rimmel', 'Joues lumineuses, longue tenue.', [['Rose poudré', 1100], ['Pêche', 1100]]],
            ],
            'ongles' => [
                ['Faux ongles Coffin', null, 'Faux ongles prêts à poser, boîte de 24 en 12 tailles.', [['Boîte de 24 - Nude', 800], ['Boîte de 24 - Rouge', 800], ['Boîte de 24 - French', 900]]],
                ['Faux ongles Amande', null, 'Forme amande naturelle, boîte de 24.', [['Boîte de 24 - Rose', 800], ['Boîte de 24 - Transparent', 800]]],
                ['Colle à ongles', null, 'Colle forte à séchage rapide.', [['3 g', 250], ['10 g', 500]]],
                ['Kit manucure', null, 'Pince, coupe-ongles, repousse-cuticules et lime.', [['Kit 5 pièces', 1200]]],
                ['Lime à ongles', null, 'Double face, grain 100/180.', [['Lot de 5', 300], ['Lot de 10', 500]]],
                ['Dissolvant sans acétone', 'Cutex', 'Enlève le vernis sans dessécher.', [['100 ml', 350], ['250 ml', 650]]],
                ['Vernis à ongles', 'Essie', 'Couleur intense, tenue 7 jours.', [['Rouge passion', 900], ['Rose pastel', 900], ['Nude', 900], ['Noir', 900]]],
                ['Gel UV semi-permanent', null, 'À polymériser sous lampe UV/LED.', [['Rose', 1200], ['Rouge', 1200], ['Nude', 1200]]],
            ],
            'soin-du-corps' => [
                ['Crème corps hydratante', 'Nivea', 'Hydratation 48 h, peaux sèches.', [['200 ml', 750], ['400 ml', 1200]]],
                ['Lait corporel karité', 'Nivea', 'Nourrit et adoucit la peau.', [['250 ml', 800], ['400 ml', 1250]]],
                ['Huile corporelle sèche', null, "Huile légère à l'argan, vendue au millilitre.", [['30 ml', 600, 'pool', 30], ['50 ml', 950, 'pool', 50], ['100 ml', 1700, 'pool', 100]]],
                ['Gommage corps sucre', null, 'Gommage doux, peau lisse.', [['200 g', 900]]],
                ['Beurre de karité pur', null, 'Non raffiné, multi-usages.', [['100 g', 650], ['250 g', 1400]]],
            ],
            'douche-et-bain' => [
                ['Gel douche coco', 'Dove', 'Douceur et parfum de noix de coco.', [['250 ml', 450], ['500 ml', 750]]],
                ['Gel douche vanille', 'Dove', 'Crémeux, parfum vanille.', [['250 ml', 450], ['500 ml', 750]]],
                ['Savon de Marseille', null, 'Pain de 200 g, 72 % huile.', [['Pain 200 g', 250], ['Lot de 3', 650]]],
                ['Bain moussant', 'Sanex', 'Mousse généreuse, parfum frais.', [['750 ml', 800]]],
                ['Sels de bain', null, 'Relaxants, à la lavande.', [['500 g', 600]]],
            ],
            'cheveux' => [
                ['Shampoing nourrissant', 'Elseve', "Cheveux secs, à l'huile de coco.", [['250 ml', 550], ['400 ml', 800], ['750 ml', 1300]]],
                ['Après-shampoing', 'Elseve', 'Démêle et adoucit.', [['250 ml', 550], ['400 ml', 800]]],
                ['Masque capillaire réparateur', 'Garnier', 'Cheveux abîmés, soin intensif.', [['300 ml', 1100]]],
                ["Huile d'argan", null, 'Pure, pour cheveux et peau.', [['30 ml', 800], ['100 ml', 2200]]],
                ['Sérum anti-frisottis', 'Garnier', 'Contrôle les frisottis, brillance.', [['50 ml', 950]]],
            ],
            'deodorants' => [
                ['Déodorant spray', 'Sanex', 'Protection 48 h, sans alcool.', [['150 ml', 450]]],
                ['Stick déodorant', 'Nivea', 'Sec et confortable, 48 h.', [['Stick 50 ml', 500]]],
                ['Déodorant roll-on', 'Dove', 'Peaux sensibles, sans parfum.', [['50 ml', 400]]],
                ['Déodorant crème', null, 'Naturel, au bicarbonate.', [['50 g', 700]]],
            ],
            'soin-du-visage' => [
                ['Crème hydratante visage', 'Vichy', 'Hydratation légère, toutes peaux.', [['50 ml', 2200]]],
                ['Sérum vitamine C', null, 'Éclat et anti-taches.', [['30 ml', 1800]]],
                ['Nettoyant visage moussant', 'Garnier', 'Élimine impuretés et maquillage.', [['150 ml', 900], ['200 ml', 1150]]],
                ['Masque argile purifiant', 'Garnier', 'Pores resserrés, peau nette.', [['50 ml', 700]]],
            ],
            'accessoires' => [
                ['Set de pinceaux maquillage', null, '12 pinceaux, poils doux.', [['Set de 12', 1800], ['Set de 24', 3200]]],
                ['Éponge à maquillage', null, 'Éponge goutte, finition parfaite.', [['Lot de 2', 450], ['Lot de 4', 800]]],
                ['Trousse de maquillage', null, 'Spacieuse, étanche.', [['Rose', 900], ['Noir', 900]]],
                ['Bandeau cheveux spa', null, 'Doux, pour les soins du visage.', [['Unique', 300]]],
            ],
        ];
    }

    /**
     * @param  list<array{0: string, 1: int, 2?: string, 3?: ?int}>  $options
     */
    private function create(int $typeId, string $name, ?string $brandName, string $description, array $options, int $order): void
    {
        $brand = $brandName ? Brand::firstOrCreate(['slug' => Str::slug($brandName)], ['name' => $brandName]) : null;

        $product = Product::create([
            'kind' => ProductKind::Cosmetic,
            'name' => $name,
            'slug' => Str::slug($name),
            'brand_id' => $brand?->id,
            'perfume_type_id' => $typeId,
            'short_description' => $description,
            'is_featured' => $order === 0,
            'sort_order' => $order,
        ]);

        $stock = app(StockService::class);
        $poolMl = 0;

        foreach ($options as $n => $option) {
            [$label, $price] = $option;
            $mode = ($option[2] ?? 'unit') === 'pool' ? StockMode::Pool : StockMode::Unit;

            $variant = $product->variants()->create([
                'label' => $label,
                'ml' => $option[3] ?? null,
                'price' => $price,
                'stock_mode' => $mode,
                'sort_order' => $n,
            ]);

            if ($mode === StockMode::Unit) {
                $units = mt_rand(0, 9) === 0 ? 0 : mt_rand(2, 40);   // about one option in ten is sold out
                if ($units > 0) {
                    $stock->addEntry($product, $variant, qty: $units, note: 'Stock initial (démo)');
                }
            } else {
                $poolMl = 400;
            }
        }

        if ($poolMl > 0) {
            $stock->addEntry($product, ml: $poolMl, note: 'Stock initial (démo)');
        }
    }

    /** Packs that mix a perfume with cosmetics. Returns how many were created. */
    private function packs(): int
    {
        $perfume = Product::query()->perfumes()->active()->where('stock_ml', '>', 100)->whereHas('variants', fn ($q) => $q->where('ml', 10))->orderBy('id')->first();
        $variant = fn (string $product, ?string $label = null): ?ProductVariant => Product::query()->where('slug', Str::slug($product))->first()
            ?->variants()->when($label, fn ($q) => $q->where('label', $label))->orderBy('sort_order')->first();

        $perfume10 = $perfume?->variants()->where('ml', 10)->first();

        $definitions = [
            ['Pack Parfum et Déodorant', 'Un parfum en 10 ml avec un déodorant spray et un stick, pour toute la journée.', 2200, [
                [$perfume10, 1], [$variant('Déodorant spray'), 1], [$variant('Stick déodorant'), 1],
            ]],
            ['Pack Routine Complète', 'Parfum 10 ml, stick déodorant, shampoing et gel douche : tout pour la salle de bain.', 3200, [
                [$perfume10, 1], [$variant('Stick déodorant'), 1], [$variant('Shampoing nourrissant', '250 ml'), 1], [$variant('Gel douche coco', '250 ml'), 1],
            ]],
            ['Pack Soin du corps', 'Gel douche, crème hydratante et gommage pour une peau douce.', 1900, [
                [$variant('Gel douche vanille', '250 ml'), 1], [$variant('Crème corps hydratante', '200 ml'), 1], [$variant('Gommage corps sucre'), 1],
            ]],
            ['Pack Ongles Prêts à Poser', 'Faux ongles, colle et lime : manucure en 10 minutes.', 1100, [
                [$variant('Faux ongles Coffin', 'Boîte de 24 - Nude'), 1], [$variant('Colle à ongles', '3 g'), 1], [$variant('Lime à ongles', 'Lot de 5'), 1],
            ]],
        ];

        $created = 0;
        foreach ($definitions as [$name, $description, $price, $components]) {
            $components = array_filter($components, fn (array $c) => $c[0] !== null);
            if (count($components) < 2 || Product::withTrashed()->where('slug', Str::slug($name))->exists()) {
                continue;
            }

            $pack = Product::create([
                'kind' => ProductKind::Pack,
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
