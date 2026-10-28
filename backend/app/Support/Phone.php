<?php

namespace App\Support;

class Phone
{
    /** Algerian mobile numbers: 05/06/07 followed by 8 digits. */
    public const PATTERN = '/^0[5-7][0-9]{8}$/';

    /** Normalise "+213 550 12 34 56" / "00213550123456" / "0550 12 34 56" to "0550123456"; null if not a valid mobile. */
    public static function normalize(?string $phone): ?string
    {
        if ($phone === null) {
            return null;
        }

        $digits = preg_replace('/[^\d+]/', '', $phone);
        $digits = preg_replace('/^(\+213|00213)/', '0', $digits);

        return preg_match(self::PATTERN, $digits) ? $digits : null;
    }
}
