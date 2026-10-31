<?php

namespace App\Enums;

/**
 * What a product is, for stock and display purposes. Perfume and Standard are the two *profiles* a product
 * type can have; Pack is a bundle of other products.
 */
enum ProductKind: string
{
    case Perfume = 'perfume';
    case Standard = 'standard';
    case Pack = 'pack';

    /** Perfumes and standard products hold their own stock; a pack is made of other products' stock. */
    public function hasOwnStock(): bool
    {
        return $this !== self::Pack;
    }
}
