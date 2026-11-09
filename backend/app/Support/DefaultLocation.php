<?php

namespace App\Support;

use App\Models\Commune;
use App\Models\Wilaya;

/** The wilaya and commune a new client is placed in when nothing else is known (config/shop.php: Oran, Oran). */
final class DefaultLocation
{
    /** The shop's wilaya, or null when it is not in the database (a fresh or test database without wilayas). */
    public static function wilayaId(): ?int
    {
        return Wilaya::query()->whereKey((int) config('shop.default_wilaya_id'))->value('id');
    }

    public static function communeId(): ?int
    {
        $wilayaId = self::wilayaId();

        return $wilayaId ? Commune::query()->where('wilaya_id', $wilayaId)->where('name', config('shop.default_commune'))->value('id') : null;
    }
}
