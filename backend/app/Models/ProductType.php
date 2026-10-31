<?php

namespace App\Models;

use App\Enums\ProductKind;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A "rayon" of the shop (Parfums, Cosmétiques, Montres, Lunettes...). Created by the owner.
 * Its `profile` decides how its products behave: `perfume` (decants, notes) or `standard` (counted options).
 */
class ProductType extends Model
{
    use SoftDeletes;

    protected $guarded = ['id'];

    protected $attributes = [
        'profile' => 'standard',
        'uses_gender' => false,
        'is_active' => true,
    ];

    protected function casts(): array
    {
        return [
            'profile' => ProductKind::class,
            'uses_gender' => 'boolean',
            'is_active' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }

    /** The families / categories of this type (Designer, Niche... / Lunettes de soleil...). */
    public function categories(): HasMany
    {
        return $this->hasMany(PerfumeType::class, 'product_type_id');
    }

    public function brands(): BelongsToMany
    {
        return $this->belongsToMany(Brand::class, 'brand_product_type');
    }
}
