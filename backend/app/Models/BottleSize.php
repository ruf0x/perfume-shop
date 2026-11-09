<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** The empty decant bottles of one size (e.g. 20 ml) and how many are left. */
class BottleSize extends Model
{
    protected $guarded = ['id'];

    protected $attributes = ['qty' => 0];

    protected function casts(): array
    {
        return ['ml' => 'integer', 'qty' => 'integer'];
    }

    public function movements(): HasMany
    {
        return $this->hasMany(BottleMovement::class);
    }
}
