<?php

namespace App\Models;

use App\Enums\Gender;
use App\Enums\ProductKind;
use App\Enums\StockMode;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Product extends Model
{
    use SoftDeletes;

    protected $guarded = ['id'];

    protected $attributes = [
        'is_active' => true,
        'stock_ml' => 0,
    ];

    protected function casts(): array
    {
        return [
            'kind' => ProductKind::class,
            'gender' => Gender::class,
            'stock_ml' => 'integer',
            'is_active' => 'boolean',
            'is_featured' => 'boolean',
        ];
    }

    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class);
    }

    public function type(): BelongsTo
    {
        return $this->belongsTo(PerfumeType::class, 'perfume_type_id');
    }

    public function images(): HasMany
    {
        return $this->hasMany(ProductImage::class)->orderBy('sort_order');
    }

    public function variants(): HasMany
    {
        return $this->hasMany(ProductVariant::class)->orderBy('sort_order');
    }

    public function stockMovements(): HasMany
    {
        return $this->hasMany(StockMovement::class);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function scopePerfumes(Builder $query): Builder
    {
        return $query->where('kind', ProductKind::Perfume);
    }

    public function scopePacks(Builder $query): Builder
    {
        return $query->where('kind', ProductKind::Pack);
    }

    /**
     * Perfumes with at least $thresholdMl in the pool or one sealed unit in stock.
     * Packs pass through: their availability depends on their components and is
     * resolved by StockService.
     */
    public function scopeAvailable(Builder $query, int $thresholdMl): Builder
    {
        return $query->where(function (Builder $q) use ($thresholdMl) {
            $q->where('kind', ProductKind::Pack)
                ->orWhere('stock_ml', '>=', $thresholdMl)
                ->orWhereHas('variants', fn (Builder $v) => $v
                    ->where('is_active', true)
                    ->where('stock_mode', StockMode::Unit)
                    ->where('stock_qty', '>', 0));
        });
    }
}
