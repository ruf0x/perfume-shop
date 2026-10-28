<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PackItem extends Model
{
    protected $guarded = ['id'];

    public function pack(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'pack_variant_id');
    }

    public function component(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'component_variant_id');
    }
}
