<?php

namespace App\Services;

use App\Enums\ProductKind;
use App\Exceptions\ShopException;
use App\Models\Brand;
use App\Models\PerfumeType;
use App\Models\Product;
use App\Models\ProductType;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Adds many products at once from a CSV file, in two shapes:
 *
 *  - `perfumes`: one row per perfume. The sizes are columns (`prix_10ml`, `prix_20ml`, `prix_flacon_100ml`, with an
 *    optional `achat_…` purchase price each) and the starting stock is `stock_ml` and `stock_flacon_100ml`.
 *  - `options`: for cosmetics, watches, glasses…: one row per option (size, shade, colour) of a product; the rows of
 *    the same product (type + name + brand) are grouped.
 *
 * It only creates: a product that already exists (same type, name and brand) is skipped, never changed. A preview
 * (`$commit = false`) runs everything in a transaction and rolls it back, so what it reports is exactly what the real
 * import will do. A product with a problem is skipped with its line numbers; the others are still imported.
 */
class ProductImporter
{
    public const PERFUMES = 'perfumes';

    public const OPTIONS = 'options';

    public const MAX_ROWS = 2000;

    public function __construct(private ProductService $products, private StockService $stock) {}

    /**
     * @return array{format: string, committed: bool, rows: int, created: list<array<string, mixed>>, skipped: list<array<string, mixed>>, errors: list<array<string, mixed>>}
     */
    public function run(string $path, string $format, bool $commit, ?User $user = null): array
    {
        if (! in_array($format, [self::PERFUMES, self::OPTIONS], true)) {
            throw new ShopException('Format inconnu.');
        }

        [$headers, $rows] = $this->read($path);
        $report = ['format' => $format, 'committed' => $commit, 'rows' => count($rows), 'created' => [], 'skipped' => [], 'errors' => []];

        DB::beginTransaction();
        try {
            $format === self::PERFUMES
                ? $this->perfumes($headers, $rows, $report, $user)
                : $this->options($headers, $rows, $report, $user);
        } catch (\Throwable $e) {
            DB::rollBack();
            throw $e;
        }
        $commit ? DB::commit() : DB::rollBack();

        return $report;
    }

    // ───────────────────────────── perfumes ─────────────────────────────

    /**
     * @param  list<string>  $headers
     * @param  list<array{line: int, cells: array<string, string>}>  $rows
     */
    private function perfumes(array $headers, array $rows, array &$report, ?User $user): void
    {
        $sizes = $this->sizeColumns($headers);
        if ($sizes['decants'] === [] && $sizes['flacons'] === []) {
            throw new ShopException('Aucune colonne de prix : ajoutez par exemple prix_10ml, prix_20ml ou prix_flacon_100ml.');
        }

        foreach ($rows as $row) {
            $c = $row['cells'];
            $line = $row['line'];
            $name = $this->cell($c, 'nom', 'name', 'parfum');

            try {
                if ($name === null) {
                    throw new ShopException('Le nom est obligatoire.');
                }
                $type = $this->type($this->cell($c, 'type', 'rayon'), ProductKind::Perfume);

                $variants = [];
                $stock = ['ml' => $this->quantity($c['stock_ml'] ?? null, 'stock_ml'), 'sealed' => []];
                foreach ($sizes['decants'] as $ml => $col) {
                    if (($price = $this->money($c[$col['price']] ?? null, $col['price'])) !== null) {
                        $variants[] = ['label' => "{$ml} ml", 'ml' => $ml, 'price' => $price, 'cost_price' => isset($col['cost']) ? $this->money($c[$col['cost']] ?? null, $col['cost']) : null, 'stock_mode' => 'pool', 'is_active' => true];
                    }
                }
                foreach ($sizes['flacons'] as $ml => $col) {
                    if (($price = $this->money($c[$col['price']] ?? null, $col['price'])) !== null) {
                        $variants[] = ['label' => "Flacon complet {$ml} ml", 'ml' => $ml, 'price' => $price, 'cost_price' => isset($col['cost']) ? $this->money($c[$col['cost']] ?? null, $col['cost']) : null, 'stock_mode' => 'unit', 'is_active' => true];
                        $stock['sealed']["Flacon complet {$ml} ml"] = isset($col['stock']) ? $this->quantity($c[$col['stock']] ?? null, $col['stock']) : 0;
                    }
                }
                if ($variants === []) {
                    throw new ShopException('Aucun prix renseigné pour ce parfum.');
                }

                $this->createProduct($report, $line, $type, $name, $c, $variants, $stock, $user);
            } catch (ShopException $e) {
                $report['errors'][] = ['line' => $line, 'name' => $name, 'message' => $e->getMessage()];
            } catch (QueryException) {
                $report['errors'][] = ['line' => $line, 'name' => $name, 'message' => 'Une valeur est trop longue ou invalide (nom, marque, option…).'];
            }
        }
    }

    /**
     * Sizes found in the header: `prix_10ml` (a decant), `prix_flacon_100ml` (a sealed bottle), with `achat_…` for the
     * purchase price and `stock_flacon_100ml` for the bottles in stock.
     *
     * @param  list<string>  $headers
     * @return array{decants: array<int, array{price: string, cost?: string}>, flacons: array<int, array{price: string, cost?: string, stock?: string}>}
     */
    private function sizeColumns(array $headers): array
    {
        $out = ['decants' => [], 'flacons' => []];
        foreach ($headers as $h) {
            if (preg_match('/^prix_flacon_(\d+)ml$/', $h, $m)) {
                $out['flacons'][(int) $m[1]]['price'] = $h;
            } elseif (preg_match('/^achat_flacon_(\d+)ml$/', $h, $m)) {
                $out['flacons'][(int) $m[1]]['cost'] = $h;
            } elseif (preg_match('/^stock_flacon_(\d+)ml$/', $h, $m)) {
                $out['flacons'][(int) $m[1]]['stock'] = $h;
            } elseif (preg_match('/^prix_(\d+)ml$/', $h, $m)) {
                $out['decants'][(int) $m[1]]['price'] = $h;
            } elseif (preg_match('/^achat_(\d+)ml$/', $h, $m)) {
                $out['decants'][(int) $m[1]]['cost'] = $h;
            }
        }
        // A size with only a purchase price or a stock column has no price: it is not a size.
        $out['decants'] = array_filter($out['decants'], fn ($c) => isset($c['price']));
        $out['flacons'] = array_filter($out['flacons'], fn ($c) => isset($c['price']));
        ksort($out['decants']);
        ksort($out['flacons']);

        return $out;
    }

    // ───────────────────────────── options ─────────────────────────────

    /**
     * @param  list<string>  $headers
     * @param  list<array{line: int, cells: array<string, string>}>  $rows
     */
    private function options(array $headers, array $rows, array &$report, ?User $user): void
    {
        // Group the rows of one product (type + name + brand), keeping the order of the file.
        $groups = [];
        foreach ($rows as $row) {
            $c = $row['cells'];
            $key = Str::lower(($this->cell($c, 'type', 'rayon') ?? '').'|'.($this->cell($c, 'nom', 'name') ?? '').'|'.($this->cell($c, 'marque', 'brand') ?? ''));
            $groups[$key][] = $row;
        }

        foreach ($groups as $group) {
            $first = $group[0];
            $c = $first['cells'];
            $name = $this->cell($c, 'nom', 'name');
            $lines = array_column($group, 'line');

            try {
                if ($name === null) {
                    throw new ShopException('Le nom est obligatoire.');
                }
                $typeName = $this->cell($c, 'type', 'rayon');
                if ($typeName === null) {
                    throw new ShopException('Le type est obligatoire (par exemple Cosmétiques ou Montres).');
                }
                $type = $this->type($typeName, ProductKind::Standard);

                $variants = [];
                $stock = ['ml' => 0, 'sealed' => []];
                $seen = [];
                foreach ($group as $row) {
                    $r = $row['cells'];
                    $label = $this->cell($r, 'option', 'variante', 'taille');
                    if ($label === null) {
                        throw new ShopException("Ligne {$row['line']} : l'option est obligatoire (par exemple 250 ml ou Rose nude).");
                    }
                    if (isset($seen[Str::lower($label)])) {
                        throw new ShopException("Ligne {$row['line']} : l'option « {$label} » est déjà dans ce produit.");
                    }
                    $seen[Str::lower($label)] = true;
                    $price = $this->money($r['prix'] ?? null, 'prix') ?? throw new ShopException("Ligne {$row['line']} : le prix est obligatoire.");
                    $variants[] = [
                        'label' => $label,
                        'ml' => null,
                        'price' => $price,
                        'compare_at_price' => $this->money($r['ancien_prix'] ?? null, 'ancien_prix'),
                        'cost_price' => $this->money($r['achat'] ?? null, 'achat'),
                        'stock_mode' => 'unit',
                        'is_active' => $this->flag($r['actif'] ?? null),
                    ];
                    $stock['sealed'][$label] = $this->quantity($r['stock'] ?? null, 'stock');
                }

                $this->createProduct($report, $lines[0], $type, $name, $c, $variants, $stock, $user, $lines);
            } catch (ShopException $e) {
                $report['errors'][] = ['line' => $lines[0], 'name' => $name, 'message' => $e->getMessage()];
            } catch (QueryException) {
                $report['errors'][] = ['line' => $lines[0], 'name' => $name, 'message' => 'Une valeur est trop longue ou invalide (nom, marque, option…).'];
            }
        }
    }

    // ───────────────────────────── shared ─────────────────────────────

    /**
     * @param  array<string, string>  $c
     * @param  list<array<string, mixed>>  $variants
     * @param  array{ml: int, sealed: array<string, int>}  $stock
     * @param  list<int>|null  $lines
     */
    private function createProduct(array &$report, int $line, ProductType $type, string $name, array $c, array $variants, array $stock, ?User $user, ?array $lines = null): void
    {
        $brandName = $this->cell($c, 'marque', 'brand');
        $brand = $brandName ? $this->brand($brandName) : null;

        $exists = Product::withTrashed()->where('product_type_id', $type->id)->whereRaw('LOWER(name) = ?', [Str::lower($name)])
            ->when($brand, fn ($q) => $q->where('brand_id', $brand->id), fn ($q) => $q->whereNull('brand_id'))->exists();
        if ($exists) {
            $report['skipped'][] = ['line' => $line, 'name' => $name, 'message' => 'Existe déjà : ce produit n\'est pas modifié.'];

            return;
        }

        $family = $this->cell($c, 'famille', 'categorie', 'category');
        $gender = $this->gender($this->cell($c, 'genre', 'gender'));

        $product = $this->products->create([
            'kind' => $type->profile->value,
            'name' => $name,
            'product_type_id' => $type->id,
            'brand_id' => $brand?->id,
            'perfume_type_id' => $family ? $this->family($type, $family)->id : null,
            'gender' => $gender,
            'description' => $this->cell($c, 'description'),
            'inspired_by' => $this->cell($c, 'inspire_de'),
            'notes_top' => $this->cell($c, 'notes_tete'),
            'notes_heart' => $this->cell($c, 'notes_coeur'),
            'notes_base' => $this->cell($c, 'notes_fond'),
            'is_active' => $this->flag($c['actif'] ?? null),
            'variants' => $variants,
        ]);

        if ($stock['ml'] > 0) {
            $this->stock->addEntry($product, null, ml: $stock['ml'], note: 'Import CSV', user: $user);
        }
        foreach ($stock['sealed'] as $label => $qty) {
            if ($qty > 0 && ($variant = $product->variants->firstWhere('label', $label))) {
                $this->stock->addEntry($product, $variant, qty: $qty, note: 'Import CSV', user: $user);
            }
        }

        $report['created'][] = [
            'line' => $line,
            'lines' => $lines ?? [$line],
            'name' => $product->name,
            'brand' => $brand?->name,
            'type' => $type->name,
            'family' => $family,
            'variants' => collect($variants)->map(fn ($v) => ['label' => $v['label'], 'price' => $v['price']])->all(),
            'stock_ml' => $stock['ml'],
            'stock_units' => array_sum($stock['sealed']),
        ];
    }

    private function type(?string $name, ProductKind $profile): ProductType
    {
        $types = ProductType::query()->where('profile', $profile)->where('is_active', true)->orderBy('sort_order')->orderBy('id')->get();

        if ($name === null) {
            return $types->first() ?? throw new ShopException("Aucun type de produit de ce genre n'existe : créez-le d'abord dans « Types de produits ».");
        }

        $slug = Str::slug($name);
        $type = $types->first(fn (ProductType $t) => Str::slug($t->name) === $slug);
        if (! $type) {
            $other = ProductType::query()->where('is_active', true)->get()->first(fn (ProductType $t) => Str::slug($t->name) === $slug);
            throw new ShopException($other
                ? "Le type « {$name} » ne s'importe pas avec ce modèle : utilisez le modèle ".($profile === ProductKind::Perfume ? 'des autres produits.' : 'des parfums.')
                : "Le type « {$name} » n'existe pas. Types disponibles : ".$types->pluck('name')->implode(', ').'.');
        }

        return $type;
    }

    private function brand(string $name): Brand
    {
        $slug = Str::slug($name);
        $brand = Brand::withTrashed()->where('slug', $slug)->first();
        if ($brand?->trashed()) {
            $brand->restore();
        }

        return $brand ?? Brand::create(['name' => $name, 'slug' => $slug]);
    }

    private function family(ProductType $type, string $name): PerfumeType
    {
        $slug = Str::slug($name);

        return PerfumeType::query()->where('product_type_id', $type->id)->where('slug', $slug)->first()
            ?? PerfumeType::create(['product_type_id' => $type->id, 'name' => $name, 'slug' => $slug, 'sort_order' => (int) PerfumeType::query()->where('product_type_id', $type->id)->max('sort_order') + 1]);
    }

    private function gender(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        return match (Str::slug($value)) {
            'homme', 'h', 'man', 'men', 'masculin' => 'homme',
            'femme', 'f', 'woman', 'women', 'feminin' => 'femme',
            'mixte', 'm', 'unisexe', 'unisex' => 'mixte',
            default => throw new ShopException("Genre « {$value} » inconnu : homme, femme ou mixte."),
        };
    }

    /** Yes unless the cell says no (empty = yes). */
    private function flag(?string $value): bool
    {
        return $value === null || trim($value) === '' || ! in_array(Str::slug($value), ['0', 'non', 'n', 'no', 'false', 'faux', 'inactif', 'masque'], true);
    }

    /** First non-empty cell among the names given (aliases of one column). */
    private function cell(array $cells, string ...$names): ?string
    {
        foreach ($names as $n) {
            if (isset($cells[$n]) && trim($cells[$n]) !== '') {
                return trim($cells[$n]);
            }
        }

        return null;
    }

    /** "1500", "1 500", "1500 DA", "1500,00" -> 1500. Anything else is an error. */
    private function money(?string $value, string $column): ?int
    {
        if ($value === null || trim($value) === '') {
            return null;
        }
        $v = preg_replace('/(da|dzd)$/i', '', trim(str_replace(["\u{00A0}", "\u{202F}", ' '], '', $value)));
        if (preg_match('/^\d+$/', $v)) {
            return (int) $v;
        }
        if (preg_match('/^(\d+)[.,]0+$/', $v, $m)) {
            return (int) $m[1];
        }

        throw new ShopException("Montant invalide dans « {$column} » : « {$value} » (un nombre entier de DA).");
    }

    private function quantity(?string $value, string $column): int
    {
        $n = $this->money($value, $column);

        return $n ?? 0;
    }

    // ───────────────────────────── reading the file ─────────────────────────────

    /**
     * @return array{0: list<string>, 1: list<array{line: int, cells: array<string, string>}>}
     */
    private function read(string $path): array
    {
        $text = (string) file_get_contents($path);
        $text = preg_replace('/^\xEF\xBB\xBF/', '', $text);
        if (! mb_check_encoding($text, 'UTF-8')) {
            $text = mb_convert_encoding($text, 'UTF-8', 'Windows-1252');   // an old Excel export
        }
        $text = str_replace(["\r\n", "\r"], "\n", $text);

        $first = strtok($text, "\n") ?: '';
        $delimiter = collect([';', ',', "\t"])->sortByDesc(fn ($d) => substr_count($first, $d))->first();

        $stream = fopen('php://temp', 'r+');
        fwrite($stream, $text);
        rewind($stream);

        $headers = null;
        $rows = [];
        $line = 0;
        while (($cells = fgetcsv($stream, 0, $delimiter, '"', '')) !== false) {
            $line++;
            if ($headers === null) {
                $headers = array_map(fn ($h) => $this->normalize((string) $h), $cells);

                continue;
            }
            if ($cells === [null] || count(array_filter($cells, fn ($v) => trim((string) $v) !== '')) === 0) {
                continue;
            }
            $assoc = [];
            foreach ($headers as $i => $h) {
                if ($h !== '') {
                    $assoc[$h] = trim((string) ($cells[$i] ?? ''));
                }
            }
            $rows[] = ['line' => $line, 'cells' => $assoc];
        }
        fclose($stream);

        if ($headers === null || $rows === []) {
            throw new ShopException('Le fichier est vide : il faut la ligne des titres, puis au moins un produit.');
        }
        if (count($rows) > self::MAX_ROWS) {
            throw new ShopException('Le fichier est trop long : '.self::MAX_ROWS.' lignes au maximum à la fois.');
        }

        return [array_values(array_filter($headers)), $rows];
    }

    /** "Prix 10 ml" -> prix_10_ml -> prix_10ml ; accents and capitals do not matter. */
    private function normalize(string $header): string
    {
        $h = Str::of($header)->ascii()->lower()->replaceMatches('/[^a-z0-9]+/', '_')->trim('_')->toString();

        return (string) preg_replace('/_(\d+)_ml$/', '_$1ml', (string) preg_replace('/_(\d+)_ml_/', '_$1ml_', $h));
    }
}
