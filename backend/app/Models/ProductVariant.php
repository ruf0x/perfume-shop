<?php

namespace App\Models;

use App\Enums\StockMode;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ProductVariant extends Model
{
    protected $guarded = ['id'];

    protected $attributes = [
        'is_active' => true,
        'stock_qty' => 0,
    ];

    protected function casts(): array
    {
        return [
            'ml' => 'integer',
            'price' => 'integer',
            'compare_at_price' => 'integer',
            'cost_price' => 'integer',
            'stock_mode' => StockMode::class,
            'stock_qty' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /**
     * What one unit of this variant costs the shop. A pack costs the sum of its components; null when any cost is unknown.
     */
    public function unitCost(): ?int
    {
        if ($this->stock_mode !== StockMode::Pack) {
            return $this->cost_price;
        }

        $total = 0;
        $items = $this->packItems()->with('component')->get();
        foreach ($items as $item) {
            $cost = $item->component?->cost_price;
            if ($cost === null) {
                return null;
            }
            $total += $cost * $item->quantity;
        }

        return $items->isEmpty() ? null : $total;
    }

    /** Components of this variant when it is a pack. */
    public function packItems(): HasMany
    {
        return $this->hasMany(PackItem::class, 'pack_variant_id');
    }
}
