<?php

namespace App\Services;

use App\Enums\StockMode;
use App\Models\OpenBottle;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\StockMovement;

/**
 * Where a product's stock went: what was received, opened, sold, lost or corrected, and what is left, both for the
 * decant pool (ml) and for each size. Read-only: the movements ledger is the only source.
 */
class StockSummary
{
    /** Movements that take stock out to a customer (a cancelled or returned sale puts it back: counted as negative). */
    private const SALES = ['vente_en_ligne', 'vente_caisse', 'annulation', 'retour'];

    /** @return array<string, mixed> */
    public function for(Product $product): array
    {
        // Plain rows: the type is an enum in the model, compared here by its value.
        $moves = StockMovement::query()->where('product_id', $product->id)->orderBy('id')
            ->get(['id', 'type', 'variant_id', 'ml_change', 'qty_change', 'created_at'])
            ->map(fn (StockMovement $m) => [
                'id' => $m->id,
                'type' => $m->type instanceof \BackedEnum ? $m->type->value : (string) $m->type,
                'variant_id' => $m->variant_id,
                'ml_change' => $m->ml_change,
                'qty_change' => $m->qty_change,
                'created_at' => $m->created_at?->toIso8601String(),
            ])
            ->values();

        $sum = fn ($rows, string $col, array $types) => (int) collect($rows)->whereIn('type', $types)->sum($col);

        $pool = $moves->filter(fn (array $m) => $m['variant_id'] === null);
        $pool = [
            'received_ml' => $sum($pool, 'ml_change', ['entree']),
            'opened_ml' => $sum($moves, 'ml_change', ['ouverture_flacon']),
            'sold_ml' => -$sum($moves, 'ml_change', self::SALES),
            'lost_ml' => -$sum($moves, 'ml_change', ['perte']),
            'adjusted_ml' => $sum($moves, 'ml_change', ['ajustement']),
            'remaining_ml' => (int) $product->stock_ml,
        ];

        $sizes = $product->variants()->orderBy('sort_order')->get()
            ->reject(fn (ProductVariant $v) => $v->stock_mode === StockMode::Pack)
            ->map(function (ProductVariant $v) use ($moves, $sum) {
                $own = $moves->filter(fn (array $m) => $m['variant_id'] === $v->id);

                if ($v->stock_mode === StockMode::Unit) {
                    return [
                        'variant_id' => $v->id,
                        'label' => $v->label,
                        'ml' => $v->ml,
                        'mode' => 'unit',
                        'received' => $sum($own, 'qty_change', ['entree']),
                        'opened' => -$sum($own, 'qty_change', ['ouverture_flacon']),
                        'sold' => -$sum($own, 'qty_change', self::SALES),
                        'lost' => -$sum($own, 'qty_change', ['perte']),
                        'adjusted' => $sum($own, 'qty_change', ['ajustement']),
                        'remaining' => (int) $v->stock_qty,
                    ];
                }

                // Decant size: what was poured into it, counted in ml and in bottles of that size.
                $soldMl = -$sum($own, 'ml_change', self::SALES);

                return [
                    'variant_id' => $v->id,
                    'label' => $v->label,
                    'ml' => $v->ml,
                    'mode' => 'pool',
                    'sold_ml' => $soldMl,
                    'sold' => $v->ml ? intdiv($soldMl, (int) $v->ml) : 0,
                ];
            })
            ->values()
            ->all();

        $bottles = OpenBottle::query()->where('product_id', $product->id)->orderByDesc('opened_at')->orderByDesc('id')->get();

        return ['id' => $product->id, 'name' => $product->name, 'pool' => $pool, 'sizes' => $sizes, 'open_bottles' => $bottles->map(fn (OpenBottle $b) => self::bottle($b))->values()->all(), 'bulk_ml' => max(0, (int) $product->stock_ml - (int) $bottles->sum('remaining_ml'))];
    }

    /** @return array<string, mixed> */
    public static function bottle(OpenBottle $b): array
    {
        return [
            'id' => $b->id,
            'label' => $b->label,
            'capacity' => $b->capacity_ml,
            'remaining' => $b->remaining_ml,
            'decanted' => $b->decanted_ml,
            'lost' => $b->lost_ml,
            'adjusted' => $b->adjusted_ml,
            'opened_at' => $b->opened_at?->toIso8601String(),
            'bulk' => false,
        ];
    }
}
