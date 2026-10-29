<?php

namespace Database\Seeders;

use App\Enums\Gender;
use App\Enums\ProductKind;
use App\Enums\StockMode;
use App\Enums\StockMovementType;
use App\Models\Brand;
use App\Models\PerfumeType;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\StockMovement;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * Fills the demo catalogue so every famille has 20 active perfumes:
 *   php artisan db:seed --class=CatalogueSeeder
 * Safe to run twice: names that already exist (even deleted ones) are skipped. Local use only.
 */
class CatalogueSeeder extends Seeder
{
    private const PER_FAMILY = 20;

    /** Price per size in DZD: [10 ml, 20 ml, 30 ml, sealed 100 ml]. */
    private const PRICES = [
        'designer' => [1500, 2800, 4000, 14000],
        'niche' => [2800, 5200, 7500, 28000],
        'arabe' => [900, 1700, 2400, 8000],
        'dupe' => [800, 1500, 2100, 6500],
        'creation-maison' => [1000, 1900, 2700, 9000],
    ];

    private const GENDERS = ['h' => Gender::Homme, 'f' => Gender::Femme, 'm' => Gender::Mixte];

    /** name, brand, gender (h/f/m), inspired_by, top, heart, base */
    private function families(): array
    {
        return [
            'designer' => [
                ['Acqua di Giò', 'Armani', 'h', null, 'Bergamote', 'Jasmin marin', 'Patchouli'],
                ['Invictus', 'Paco Rabanne', 'h', null, 'Pamplemousse', 'Laurier', 'Bois de gaïac'],
                ['1 Million', 'Paco Rabanne', 'h', null, 'Mandarine', 'Cannelle', 'Cuir'],
                ['Libre', 'Yves Saint Laurent', 'f', null, 'Mandarine', 'Lavande', 'Vanille'],
                ['Y', 'Yves Saint Laurent', 'h', null, 'Pomme', 'Sauge', 'Fève tonka'],
                ['Eros', 'Versace', 'h', null, 'Menthe', 'Pomme verte', 'Vanille'],
                ['Dylan Blue', 'Versace', 'h', null, 'Bergamote', 'Violette', 'Musc'],
                ['Good Girl', 'Carolina Herrera', 'f', null, 'Amande', 'Tubéreuse', 'Cacao'],
                ['Bad Boy', 'Carolina Herrera', 'h', null, 'Poivre noir', 'Sauge sclarée', 'Cacao'],
                ['Light Blue', 'Dolce & Gabbana', 'f', null, 'Citron de Sicile', 'Jasmin', 'Cèdre'],
                ['The One', 'Dolce & Gabbana', 'h', null, 'Pamplemousse', 'Gingembre', 'Ambre'],
                ['Idôle', 'Lancôme', 'f', null, 'Poire', 'Rose', 'Musc blanc'],
                ['J\'adore', 'Dior', 'f', null, 'Poire', 'Jasmin', 'Musc'],
                ['Miss Dior', 'Dior', 'f', null, 'Mandarine', 'Pivoine', 'Patchouli'],
                ['Coco Mademoiselle', 'Chanel', 'f', null, 'Orange', 'Rose', 'Patchouli'],
                ['Alien', 'Mugler', 'f', null, 'Jasmin', 'Bois de cachemire', 'Ambre blanc'],
                ['Angel', 'Mugler', 'f', null, 'Noix de coco', 'Caramel', 'Patchouli'],
                ['Le Male', 'Jean Paul Gaultier', 'h', null, 'Menthe', 'Lavande', 'Vanille'],
                ['Boss Bottled', 'Hugo Boss', 'h', null, 'Pomme', 'Cannelle', 'Santal'],
                ['Terre d\'Hermès', 'Hermès', 'h', null, 'Orange', 'Silex', 'Vétiver'],
                ['Prada L\'Homme', 'Prada', 'h', null, 'Néroli', 'Iris', 'Ambre'],
                ['Flowerbomb', 'Viktor & Rolf', 'f', null, 'Thé', 'Jasmin', 'Patchouli'],
            ],
            'niche' => [
                ['Tobacco Vanille', 'Tom Ford', 'm', null, 'Tabac', 'Vanille', 'Fruits secs'],
                ['Oud Wood', 'Tom Ford', 'm', null, 'Oud', 'Bois de rose', 'Ambre'],
                ['Lost Cherry', 'Tom Ford', 'm', null, 'Cerise', 'Amande', 'Fève tonka'],
                ['Interlude Man', 'Amouage', 'h', null, 'Bergamote', 'Encens', 'Ambre'],
                ['Reflection Man', 'Amouage', 'h', null, 'Romarin', 'Iris', 'Santal'],
                ['Erba Pura', 'Xerjoff', 'm', null, 'Agrumes', 'Fruits', 'Musc'],
                ['Naxos', 'Xerjoff', 'm', null, 'Lavande', 'Miel', 'Tabac'],
                ['Ombre Nomade', 'Louis Vuitton', 'm', null, 'Oud', 'Rose', 'Encens'],
                ['Delina', 'Parfums de Marly', 'f', null, 'Litchi', 'Rose turque', 'Vanille'],
                ['Herod', 'Parfums de Marly', 'h', null, 'Cannelle', 'Tabac', 'Vanille'],
                ['Santal 33', 'Le Labo', 'm', null, 'Cardamome', 'Iris', 'Santal'],
                ['Black Afgano', 'Nasomatto', 'm', null, 'Cannabis', 'Résines', 'Oud'],
                ['Angels\' Share', 'Kilian', 'm', null, 'Cognac', 'Cannelle', 'Vanille'],
                ['Hacivat', 'Nishane', 'm', null, 'Ananas', 'Jasmin', 'Mousse de chêne'],
                ['Ani', 'Nishane', 'm', null, 'Bergamote', 'Vanille', 'Benjoin'],
                ['Gentle Fluidity Gold', 'Maison Francis Kurkdjian', 'm', null, 'Genièvre', 'Coriandre', 'Vanille'],
                ['Portrait of a Lady', 'Frédéric Malle', 'f', null, 'Rose', 'Patchouli', 'Encens'],
                ['Side Effect', 'Initio', 'm', null, 'Rhum', 'Tabac', 'Vanille'],
                ['Oud for Greatness', 'Initio', 'm', null, 'Safran', 'Oud', 'Musc'],
                ['Imagination', 'Louis Vuitton', 'm', null, 'Citron', 'Thé noir', 'Ambre'],
                ['Sospiro Accento', 'Xerjoff', 'm', null, 'Bergamote', 'Rose', 'Vanille'],
                ['Shalimar Parfum Initial', 'Guerlain', 'f', null, 'Bergamote', 'Iris', 'Vanille'],
            ],
            'arabe' => [
                ['Yara', 'Lattafa', 'f', null, 'Orchidée', 'Héliotrope', 'Vanille'],
                ['Fakhar Black', 'Lattafa', 'h', null, 'Pomme', 'Lavande', 'Ambre'],
                ['Oud Mood', 'Lattafa', 'm', null, 'Oud', 'Rose', 'Vanille'],
                ['Ana Abiyedh', 'Lattafa', 'm', null, 'Musc', 'Fleur blanche', 'Ambre'],
                ['Raghba', 'Lattafa', 'h', null, 'Cannelle', 'Oud', 'Vanille'],
                ['Eclaire', 'Lattafa', 'f', null, 'Caramel', 'Lait', 'Vanille'],
                ['La Yuqawam', 'Rasasi', 'h', null, 'Safran', 'Bois de rose', 'Oud'],
                ['Hawas Ice', 'Rasasi', 'h', null, 'Agrumes', 'Menthe', 'Musc'],
                ['L\'Aventure', 'Al Haramain', 'h', null, 'Bergamote', 'Bouleau', 'Musc'],
                ['Detour Noir', 'Al Haramain', 'h', null, 'Cuir', 'Safran', 'Oud'],
                ['Evoke', 'Ajmal', 'h', null, 'Cardamome', 'Rose', 'Ambre'],
                ['Shaghaf Oud', 'Swiss Arabian', 'm', null, 'Safran', 'Oud', 'Musc'],
                ['Kalemat', 'Arabian Oud', 'm', null, 'Rose', 'Oud', 'Ambre'],
                ['9PM', 'Afnan', 'h', null, 'Pomme', 'Cannelle', 'Vanille'],
                ['Mousuf', 'Ard Al Zaafaran', 'm', null, 'Citron', 'Rose', 'Oud'],
                ['Bade\'e Al Oud', 'Lattafa', 'm', null, 'Ananas', 'Rose', 'Oud'],
                ['Oud for Glory', 'Lattafa', 'm', null, 'Safran', 'Oud', 'Patchouli'],
                ['Hayaati', 'Lattafa', 'h', null, 'Pamplemousse', 'Safran', 'Ambre'],
                ['Mayar', 'Lattafa', 'f', null, 'Fruits rouges', 'Pivoine', 'Vanille'],
                ['Sharaf', 'Rasasi', 'm', null, 'Poivre', 'Rose', 'Ambre'],
                ['Amber Oud Rouge', 'Al Haramain', 'm', null, 'Safran', 'Rose', 'Ambre'],
                ['Pride of Dubai', 'Ard Al Zaafaran', 'm', null, 'Cardamome', 'Oud', 'Musc'],
            ],
            'dupe' => [
                ['Club de Nuit Milestone', 'Armaf', 'm', 'Creed Aventus', 'Ananas', 'Bouleau', 'Musc'],
                ['Club de Nuit Iconic', 'Armaf', 'h', 'Creed Green Irish Tweed', 'Citron', 'Violette', 'Cèdre'],
                ['Odyssey Mega', 'Armaf', 'h', 'Paco Rabanne Invictus Aqua', 'Pomme', 'Lavande', 'Ambre'],
                ['Tag-Him', 'Armaf', 'h', 'Dior Sauvage', 'Bergamote', 'Poivre', 'Ambroxan'],
                ['Jean Lowe Immortal', 'Maison Alhambra', 'h', 'Jean Paul Gaultier Ultra Male', 'Poire', 'Lavande', 'Vanille'],
                ['Salvo', 'Maison Alhambra', 'h', 'Dior Sauvage Elixir', 'Poivre', 'Lavande', 'Ambre'],
                ['Supremacy Not Pure', 'Afnan', 'h', 'Creed Aventus', 'Ananas', 'Bouleau', 'Musc'],
                ['Yara Tous', 'Lattafa', 'f', 'Lancôme La Vie Est Belle', 'Poire', 'Iris', 'Vanille'],
                ['Fakhar Rose', 'Lattafa', 'f', 'Chanel Chance', 'Rose', 'Jasmin', 'Musc'],
                ['Asad Bourbon', 'Lattafa', 'h', 'Dior Sauvage Elixir', 'Poivre', 'Tabac', 'Vanille'],
                ['Hawas for Her', 'Rasasi', 'f', 'Dior J\'adore', 'Poire', 'Fleurs blanches', 'Musc'],
                ['Cuir Intense', 'Armaf', 'h', 'Tom Ford Tuscan Leather', 'Safran', 'Cuir', 'Ambre'],
                ['Opulent Musk', 'Lattafa', 'f', 'Maison Francis Kurkdjian Baccarat Rouge 540', 'Safran', 'Jasmin', 'Ambre'],
                ['Pure Black', 'Afnan', 'h', 'Chanel Bleu de Chanel', 'Agrumes', 'Gingembre', 'Cèdre'],
                ['Delice Vanille', 'Maison Alhambra', 'f', 'Parfums de Marly Delina', 'Litchi', 'Rose', 'Vanille'],
                ['Black Noir', 'Armaf', 'm', 'Tom Ford Black Orchid', 'Truffe', 'Orchidée', 'Patchouli'],
                ['Velvet Oud', 'Lattafa', 'm', 'Initio Oud for Greatness', 'Safran', 'Oud', 'Musc'],
                ['Aqua Blu', 'Afnan', 'h', 'Armani Acqua di Giò', 'Bergamote', 'Jasmin', 'Patchouli'],
                ['Spice Emperor', 'Maison Alhambra', 'h', 'Parfums de Marly Layton', 'Pomme', 'Lavande', 'Vanille'],
                ['Sweet Candy', 'Armaf', 'f', 'Lancôme Idôle', 'Poire', 'Rose', 'Musc blanc'],
                ['Gold Intense', 'Lattafa', 'h', 'Paco Rabanne 1 Million', 'Mandarine', 'Cannelle', 'Cuir'],
                ['Midnight Rose', 'Afnan', 'f', 'Yves Saint Laurent Black Opium', 'Café', 'Jasmin', 'Vanille'],
            ],
            'creation-maison' => [
                ['Sable Doré', null, 'm', null, 'Cardamome', 'Ambre', 'Musc'],
                ['Jasmin d\'Orient', null, 'f', null, 'Bergamote', 'Jasmin', 'Santal'],
                ['Cèdre Atlas', null, 'h', null, 'Genièvre', 'Cèdre', 'Vétiver'],
                ['Musc Blanc', null, 'm', null, 'Coton', 'Musc', 'Bois blonds'],
                ['Ambre Safran', null, 'm', null, 'Safran', 'Ambre', 'Vanille'],
                ['Figue Méditerranée', null, 'm', null, 'Figue', 'Lait de coco', 'Cèdre'],
                ['Vanille Fumée', null, 'f', null, 'Cannelle', 'Vanille', 'Bois fumé'],
                ['Santal Impérial', null, 'm', null, 'Poivre rose', 'Santal', 'Ambre'],
                ['Fleur d\'Oranger', null, 'f', null, 'Néroli', 'Fleur d\'oranger', 'Musc'],
                ['Cuir Ténébreux', null, 'h', null, 'Safran', 'Cuir', 'Oud'],
                ['Menthe Verte', null, 'm', null, 'Menthe', 'Thé vert', 'Musc blanc'],
                ['Oud Noir', null, 'm', null, 'Poivre noir', 'Oud', 'Patchouli'],
                ['Encens du Désert', null, 'm', null, 'Encens', 'Myrrhe', 'Ambre'],
                ['Datte Miel', null, 'm', null, 'Datte', 'Miel', 'Vanille'],
                ['Iris Poudré', null, 'f', null, 'Bergamote', 'Iris', 'Poudre'],
                ['Bois de Rose', null, 'f', null, 'Rose', 'Bois de rose', 'Santal'],
                ['Café Épicé', null, 'h', null, 'Café', 'Cardamome', 'Tonka'],
                ['Néroli Blanc', null, 'm', null, 'Néroli', 'Fleurs blanches', 'Musc'],
                ['Patchouli Nuit', null, 'm', null, 'Bergamote', 'Patchouli', 'Vanille'],
                ['Ambre Rubis', null, 'f', null, 'Grenade', 'Rose', 'Ambre'],
                ['Lavande Atlas', null, 'h', null, 'Lavande', 'Géranium', 'Mousse'],
                ['Tabac Doux', null, 'h', null, 'Tabac', 'Miel', 'Vanille'],
            ],
        ];
    }

    public function run(): void
    {
        if (app()->environment('production')) {
            $this->command?->error('Refusing to add demo perfumes in production.');

            return;
        }

        mt_srand(540);
        $types = PerfumeType::pluck('id', 'slug');

        foreach ($this->families() as $family => $perfumes) {
            $have = Product::query()->where('kind', ProductKind::Perfume)->where('perfume_type_id', $types[$family])->count();
            $added = 0;

            foreach ($perfumes as [$name, $brandName, $g, $inspiredBy, $top, $heart, $base]) {
                if ($have + $added >= self::PER_FAMILY) {
                    break;
                }
                if (Product::withTrashed()->where('slug', Str::slug($name))->exists()) {
                    continue;
                }

                $this->create($family, $types[$family], $name, $brandName, self::GENDERS[$g], $inspiredBy, [$top, $heart, $base], $have + $added);
                $added++;
            }

            $this->command?->info("{$family}: +{$added} (total ".($have + $added).')');
        }
    }

    private function create(string $family, int $typeId, string $name, ?string $brandName, Gender $gender, ?string $inspiredBy, array $notes, int $order): void
    {
        $brand = $brandName ? Brand::firstOrCreate(['slug' => Str::slug($brandName)], ['name' => $brandName]) : null;

        $product = Product::create([
            'kind' => ProductKind::Perfume,
            'name' => $name,
            'slug' => Str::slug($name),
            'brand_id' => $brand?->id,
            'perfume_type_id' => $typeId,
            'gender' => $gender,
            'inspired_by' => $inspiredBy,
            'short_description' => "{$name} — parfum ".($gender === Gender::Mixte ? 'mixte' : "pour {$gender->value}").'.',
            'notes_top' => $notes[0],
            'notes_heart' => $notes[1],
            'notes_base' => $notes[2],
            'is_featured' => false,
            'sort_order' => $order,
        ]);

        // A little price variation between perfumes of the same family, rounded to 50 DA.
        $factor = [0.9, 1.0, 1.0, 1.1, 1.2][mt_rand(0, 4)];
        [$p10, $p20, $p30, $pFull] = array_map(fn (int $p) => (int) (round($p * $factor / 50) * 50), self::PRICES[$family]);

        foreach ([[10, $p10], [20, $p20], [30, $p30]] as $n => [$ml, $price]) {
            $product->variants()->create(['label' => "{$ml} ml", 'ml' => $ml, 'price' => $price, 'stock_mode' => StockMode::Pool, 'sort_order' => $n]);
        }
        $full = $product->variants()->create(['label' => 'Flacon complet 100 ml', 'ml' => 100, 'price' => $pFull, 'stock_mode' => StockMode::Unit, 'sort_order' => 3]);

        $poolMl = mt_rand(0, 9) === 0 ? 0 : mt_rand(8, 60) * 10;   // about one in ten is sold out
        $sealed = mt_rand(0, 2);

        if ($poolMl > 0) {
            $this->receive($product, null, $poolMl, 0);
        }
        if ($sealed > 0) {
            $this->receive($product, $full, 0, $sealed);
        }
    }

    private function receive(Product $product, ?ProductVariant $variant, int $ml, int $qty): void
    {
        StockMovement::create([
            'product_id' => $product->id,
            'variant_id' => $variant?->id,
            'type' => StockMovementType::Entree,
            'ml_change' => $ml,
            'qty_change' => $qty,
            'note' => 'Stock initial (démo)',
        ]);

        $product->increment('stock_ml', $ml);
        $variant?->increment('stock_qty', $qty);
    }
}
