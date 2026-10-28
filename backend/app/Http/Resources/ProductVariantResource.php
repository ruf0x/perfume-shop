<?php

namespace App\Http\Resources;

use App\Models\ProductVariant;
use App\Services\StockService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Public view of a variant: price and availability only. Stock quantities are never exposed.
 *
 * @mixin ProductVariant
 */
class ProductVariantResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $maxQty = app(StockService::class)->maxQty($this->resource);

        return [
            'id' => $this->id,
            'label' => $this->label,
            'ml' => $this->ml,
            'price' => $this->price,
            'compare_at_price' => $this->compare_at_price,
            'available' => $maxQty >= 1,
            'max_qty' => $maxQty,
        ];
    }
}
