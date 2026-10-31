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

    /** The family / category (Designer, Maquillage, Lunettes de soleil...). */
    public function type(): BelongsTo
    {
        return $this->belongsTo(PerfumeType::class, 'perfume_type_id');
    }

    /** The product type (rayon): Parfums, Cosmétiques, Montres, Lunettes... */
    public function productType(): BelongsTo
    {
        return $this->belongsTo(ProductType::class)->withTrashed();
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

    public function scopeStandard(Builder $query): Builder
    {
        return $query->where('kind', ProductKind::Standard);
    }

    public function scopeOfType(Builder $query, int $productTypeId): Builder
    {
        return $query->where('product_type_id', $productTypeId);
    }

    /** Products that hold their own stock (perfumes and standard products, not packs). */
    public function scopeStocked(Builder $query): Builder
    {
        return $query->where('kind', '!=', ProductKind::Pack);
    }

    /**
     * Products running low: not enough ml in the pool and (perfumes) no sealed bottle left,
     * or (standard products) no more than $maxUnits units left in total.
     */
    public function scopeLowStock(Builder $query, int $thresholdMl, int $maxUnits): Builder
    {
        $units = "(select coalesce(sum(stock_qty), 0) from product_variants where product_variants.product_id = products.id and stock_mode = 'unit' and is_active = 1)";

        return $query->stocked()->where('stock_ml', '<', $thresholdMl)->where(fn (Builder $q) => $q
            ->where(fn (Builder $p) => $p->where('kind', ProductKind::Perfume)->whereRaw("{$units} = 0"))
            ->orWhere(fn (Builder $c) => $c->where('kind', ProductKind::Standard)->whereRaw("{$units} <= ?", [$maxUnits])));
    }

    public function scopePacks(Builder $query): Builder
    {
        return $query->where('kind', ProductKind::Pack);
    }

    /**
     * Perfumes and standard products with at least $thresholdMl in the pool or one unit in stock.
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
