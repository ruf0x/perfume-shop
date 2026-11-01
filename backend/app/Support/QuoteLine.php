<?php

namespace App\Support;

use App\Models\ProductVariant;
use App\Services\StockService;

final readonly class QuoteLine
{
    public function __construct(
        public ProductVariant $variant,
        public int $quantity,
        public int $unitPrice,
        public int $lineTotal,
        public int $maxQty,
    ) {}

    /** Whether the stock covers the quantity (the caisse and the owner's confirmation need this). */
    public function available(): bool
    {
        return $this->quantity <= $this->maxQty;
    }

    /** What the online shop tells the customer: with backorder, any quantity of a listed item up to the cap. */
    public function shopMaxQty(): int
    {
        return settings()->backorderEnabled() ? ($this->maxQty >= 1 ? StockService::ORDER_MAX_QTY : 0) : $this->maxQty;
    }

    public function shopAvailable(): bool
    {
        return $this->quantity <= $this->shopMaxQty();
    }
}
