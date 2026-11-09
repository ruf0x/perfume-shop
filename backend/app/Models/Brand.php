<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Brand extends Model
{
    use SoftDeletes;

    protected $guarded = ['id'];

    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }

    /** The families (categories) of the products of this brand: Designer, Niche... */
    public function families(): BelongsToMany
    {
        return $this->belongsToMany(PerfumeType::class, 'brand_perfume_type');
    }

    /** The product types this brand is sold in (Armani: Parfums and Montres). */
    public function productTypes(): BelongsToMany
    {
        return $this->belongsToMany(ProductType::class, 'brand_product_type');
    }
}
