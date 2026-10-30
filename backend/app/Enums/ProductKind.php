<?php

namespace App\Enums;

enum ProductKind: string
{
    case Perfume = 'perfume';
    case Cosmetic = 'cosmetic';
    case Pack = 'pack';

    /** Perfumes and cosmetics hold their own stock; a pack is made of other products' stock. */
    public function hasOwnStock(): bool
    {
        return $this !== self::Pack;
    }
}
