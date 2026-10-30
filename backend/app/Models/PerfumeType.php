<?php

namespace App\Models;

use App\Enums\ProductKind;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class PerfumeType extends Model
{
    use SoftDeletes;

    protected $guarded = ['id'];

    protected $attributes = [
        'kind' => 'perfume',
        'is_active' => true,
    ];

    protected function casts(): array
    {
        return ['is_active' => 'boolean', 'kind' => ProductKind::class];
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }
}
