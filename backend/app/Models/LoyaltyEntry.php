<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** One perfume bought by a customer, counted toward the next gift. */
class LoyaltyEntry extends Model
{
    public const UPDATED_AT = null;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['unit_price' => 'integer'];
    }
}
