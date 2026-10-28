<?php

namespace App\Http\Resources;

use App\Models\Product;
use App\Services\StockService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Catalogue card. Expects `brand`, `type` and active `variants` loaded, plus a `min_price` aggregate.
 *
 * @mixin Product
 */
class ProductCardResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'slug' => $this->slug,
            'kind' => $this->kind,
            'name' => $this->name,
            'brand' => $this->brand?->name,
            'type' => $this->type ? ['id' => $this->type->id, 'name' => $this->type->name, 'slug' => $this->type->slug] : null,
            'gender' => $this->gender,
            'inspired_by' => $this->inspired_by,
            'short_description' => $this->short_description,
            'image' => media_url($this->main_image),
            'is_featured' => $this->is_featured,
            'price_from' => $this->min_price,
            'sizes' => $this->variants->map(fn ($v) => ['id' => $v->id, 'label' => $v->label, 'price' => $v->price])->values(),
            'available' => app(StockService::class)->productAvailable($this->resource),
        ];
    }
}
