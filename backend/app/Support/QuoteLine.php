<?php

namespace App\Support;

use App\Models\ProductVariant;

final readonly class QuoteLine
{
    public function __construct(
        public ProductVariant $variant,
        public int $quantity,
        public int $unitPrice,
        public int $lineTotal,
        public int $maxQty,
    ) {}

    public function available(): bool
    {
        return $this->quantity <= $this->maxQty;
    }
}
