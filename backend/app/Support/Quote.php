<?php

namespace App\Support;

/** A server-side price calculation: nothing in it comes from the client except variant ids and quantities. */
final readonly class Quote
{
    /**
     * @param  list<QuoteLine>  $lines
     */
    public function __construct(
        public array $lines,
        public int $subtotal,
        public int $deliveryFee,
        public int $discount,
        public int $total,
    ) {}

    public function allAvailable(): bool
    {
        return collect($this->lines)->every(fn (QuoteLine $line) => $line->available());
    }

    /** The same for the online shop: with backorder, only the cap and the listing matter, never the real stock. */
    public function allShopAvailable(): bool
    {
        return collect($this->lines)->every(fn (QuoteLine $line) => $line->shopAvailable());
    }
}
