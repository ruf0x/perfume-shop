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
            'stock_mode' => StockMode::class,
            'stock_qty' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /** Components of this variant when it is a pack. */
    public function packItems(): HasMany
    {
        return $this->hasMany(PackItem::class, 'pack_variant_id');
    }
}
