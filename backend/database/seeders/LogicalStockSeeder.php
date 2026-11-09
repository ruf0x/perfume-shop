<?php

namespace Database\Seeders;

use App\Enums\ProductKind;
use App\Enums\StockMode;
use App\Enums\UserRole;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\User;
use App\Services\OrderPlacement;
use App\Services\StockService;
use Illuminate\Database\Seeder;

/**
 * Local demo only: stock that looks like a real decant shop. Every perfume has sealed flacons of 50, 100 and 150 ml
 * (a few of each), and the first perfumes have bottles opened and decanted through real sales, so the stock page
 * shows bottles in use. Run after `migrate:fresh --seed`: `php artisan db:seed --class=LogicalStockSeeder`.
 */
class LogicalStockSeeder extends Seeder
{
    /** Decant sales per opened bottle: [perfume index, opened ml, decanted ml, 10 ml bottles per sale]. */
    private const DECANTS = [
        [0, 100, 80],
        [0, 50, 30],
        [1, 100, 40],
        [2, 150, 60],
    ];

    public function run(): void
    {
        $owner = User::query()->where('role', UserRole::Owner)->firstOrFail();
        $stock = app(StockService::class);
        $placement = app(OrderPlacement::class);

        $perfumes = Product::query()->where('kind', ProductKind::Perfume)->with('variants')->orderBy('id')->get()->values();

        foreach ($perfumes as $i => $product) {
            $base = (int) ($product->variants->firstWhere('ml', 100)?->price ?? 8000);

            foreach ([[50, 0.55, 2 + $i % 2], [100, 1.0, 3 + $i % 3], [150, 1.4, 1 + $i % 2]] as [$ml, $factor, $count]) {
                $price = (int) (round($base * $factor / 50) * 50);
                $variant = $product->variants->firstWhere('ml', $ml) ?? $product->variants()->create([
                    'label' => "Flacon {$ml} ml",
                    'ml' => $ml,
                    'price' => $price,
                    'cost_price' => (int) round($price / 1.2),
                    'stock_mode' => StockMode::Unit,
                    'sort_order' => 10 + $ml,
                ]);
                $stock->addEntry($product, $variant, qty: $count, note: 'Réception (démo)', user: $owner);
            }
        }

        foreach (self::DECANTS as [$index, $opened, $decanted]) {
            // Reloaded: the sizes created above are not in the collection loaded at the start.
            $product = isset($perfumes[$index]) ? $perfumes[$index]->fresh('variants') : null;
            $bottle = $product?->variants->firstWhere('ml', $opened);
            if (! $product || ! $bottle) {
                continue;
            }

            $stock->openBottle($bottle, $owner);
            $sizeVariant = $product->variants->firstWhere('ml', 10) ?? $product->variants->firstWhere('stock_mode', StockMode::Pool);
            $sales = intdiv($decanted, (int) $sizeVariant->ml);

            $placement->placePos([
                'lines' => [['variant_id' => $sizeVariant->id, 'quantity' => $sales]],
                'payment_method' => 'especes',
                'amount_received' => 10000000,
            ], $owner);
        }
    }
}
