<?php

namespace App\Exceptions;

class InsufficientStockException extends ShopException
{
    /**
     * @param  list<array{name: string, unit: string, requested: int, available: int}>  $shortages
     */
    public function __construct(public readonly array $shortages)
    {
        $details = collect($shortages)
            ->map(fn (array $s) => "{$s['name']} (demandé {$s['requested']} {$s['unit']}, disponible {$s['available']} {$s['unit']})")
            ->implode(', ');

        parent::__construct("Stock insuffisant pour : {$details}");
    }
}
