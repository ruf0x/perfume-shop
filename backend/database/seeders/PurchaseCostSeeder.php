<?php

namespace Database\Seeders;

use App\Enums\StockMode;
use App\Models\OrderItem;
use App\Models\ProductVariant;
use Illuminate\Database\Seeder;

/**
 * Demo purchase prices, so that the profit figures have something to show.
 *
 * Every demo size gets the cost that gives a default gain on its price: 20 % for designer perfumes, 30 % for
 * niche, 15 % for the other perfume families (arabic, dupe, home creations) and 20 % for everything else
 * (cosmetics, watches, glasses...). Cost = price / (1 + gain). Packs are not touched: they cost the sum of their
 * components. Past demo sales without a cost get today's. Safe to run again: it rewrites the demo costs. Never part of a real shop's setup.
 */
class PurchaseCostSeeder extends Seeder
{
    /** Gain on the purchase price, in percent, by category slug. */
    public const GAINS = ['designer' => 20, 'niche' => 30, 'arabe' => 15, 'dupe' => 15, 'creation-maison' => 15];

    public const DEFAULT_GAIN = 20;

    public function run(): void
    {
        ProductVariant::query()->with('product.type')
            ->where('stock_mode', '!=', StockMode::Pack)
            ->get()
            ->each(function (ProductVariant $variant) {
                $gain = self::GAINS[$variant->product?->type?->slug] ?? self::DEFAULT_GAIN;
                $variant->update(['cost_price' => (int) round($variant->price / (1 + $gain / 100))]);
            });

        // The demo sales made before the costs existed take today's cost, so the dashboard has profit to show.
        OrderItem::query()->whereNull('unit_cost')->whereNotNull('variant_id')->get()->each(function (OrderItem $item) {
            $cost = ProductVariant::query()->find($item->variant_id)?->unitCost();
            if ($cost !== null) {
                $item->update(['unit_cost' => $cost]);
            }
        });
    }
}
