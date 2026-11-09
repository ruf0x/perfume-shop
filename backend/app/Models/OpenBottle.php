<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A bottle opened for decanting. Written only by StockService (opening, decanting, losses, restores). */
class OpenBottle extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['opened_at' => 'datetime'];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
