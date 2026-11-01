<?php

namespace App\Models;

use App\Enums\StockMovementType;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BottleMovement extends Model
{
    public const UPDATED_AT = null;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['type' => StockMovementType::class, 'qty_change' => 'integer', 'total_cost' => 'integer'];
    }

    public function size(): BelongsTo
    {
        return $this->belongsTo(BottleSize::class, 'bottle_size_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
