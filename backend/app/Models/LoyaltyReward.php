<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A gift earned by a customer: pending until the owner hands it over (`given_at`). */
class LoyaltyReward extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['items_count' => 'integer', 'average_price' => 'integer', 'gift_value' => 'integer', 'given_at' => 'datetime'];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
