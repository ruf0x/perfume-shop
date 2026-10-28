<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Wilaya extends Model
{
    // The id is the official wilaya code.
    public $incrementing = false;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'home_fee' => 'integer',
            'desk_fee' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    public function communes(): HasMany
    {
        return $this->hasMany(Commune::class);
    }
}
