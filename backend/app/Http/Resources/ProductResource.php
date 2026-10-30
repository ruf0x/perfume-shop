<?php

namespace App\Http\Resources;

use App\Models\Product;
use App\Services\StockService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Public product page.
 *
 * @mixin Product
 */
class ProductResource extends JsonResource
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
            'type' => $this->type ? ['id' => $this->type->id, 'name' => $this->type->name, 'slug' => $this->type->slug, 'kind' => $this->type->kind] : null,
            'gender' => $this->gender,
            'inspired_by' => $this->inspired_by,
            'short_description' => $this->short_description,
            'description' => $this->description,
            'notes' => [
                'top' => $this->notes_top,
                'heart' => $this->notes_heart,
                'base' => $this->notes_base,
            ],
            'image' => media_url($this->main_image),
            'images' => $this->images->map(fn ($image) => media_url($image->path))->values(),
            'variants' => ProductVariantResource::collection($this->variants),
            // Pack contents: "10 ml de Sauvage x1".
            'contains' => $this->when($this->kind->value === 'pack', fn () => $this->variants->first()?->packItems
                ->map(fn ($item) => [
                    'product' => $item->component->product->name,
                    'label' => $item->component->label,
                    'quantity' => $item->quantity,
                ])->values() ?? []),
            'available' => app(StockService::class)->productAvailable($this->resource),
        ];
    }
}
