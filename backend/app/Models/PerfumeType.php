<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A family or category inside one product type: Designer, Niche (Parfums), Maquillage (Cosmétiques),
 * Lunettes de soleil (Lunettes)... The table keeps its historical name.
 */
class PerfumeType extends Model
{
    use SoftDeletes;

    protected $guarded = ['id'];

    protected $attributes = [
        'is_active' => true,
    ];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    public function productType(): BelongsTo
    {
        return $this->belongsTo(ProductType::class)->withTrashed();
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }
}
