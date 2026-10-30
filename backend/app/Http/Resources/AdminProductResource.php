<?php

namespace App\Http\Resources;

use App\Models\Product;
use App\Services\StockService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Admin view of a product: includes stock quantities and inactive variants.
 *
 * @mixin Product
 */
class AdminProductResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'kind' => $this->kind,
            'name' => $this->name,
            'slug' => $this->slug,
            'brand' => $this->whenLoaded('brand', fn () => $this->brand ? ['id' => $this->brand->id, 'name' => $this->brand->name] : null),
            'type' => $this->whenLoaded('type', fn () => $this->type ? ['id' => $this->type->id, 'name' => $this->type->name, 'slug' => $this->type->slug, 'kind' => $this->type->kind] : null),
            'gender' => $this->gender,
            'inspired_by' => $this->inspired_by,
            'short_description' => $this->short_description,
            'description' => $this->description,
            'notes_top' => $this->notes_top,
            'notes_heart' => $this->notes_heart,
            'notes_base' => $this->notes_base,
            'image' => media_url($this->main_image),
            'images' => $this->whenLoaded('images', fn () => $this->images->map(fn ($i) => [
                'id' => $i->id, 'url' => media_url($i->path), 'sort_order' => $i->sort_order,
            ])->values()),
            /** Millilitres in the decant pool (perfumes, and cosmetics sold by volume). */
            'stock_ml' => $this->stock_ml,
            'is_active' => $this->is_active,
            'is_featured' => $this->is_featured,
            'sort_order' => $this->sort_order,
            'available' => app(StockService::class)->productAvailable($this->resource),
            'variants' => $this->whenLoaded('variants', fn () => $this->variants->map(fn ($v) => [
                'id' => $v->id,
                'label' => $v->label,
                'ml' => $v->ml,
                'price' => $v->price,
                'compare_at_price' => $v->compare_at_price,
                'stock_mode' => $v->stock_mode,
                /** Units in stock (`unit` variants only): sealed bottles, nail kits, shades... */
                'stock_qty' => $v->stock_qty,
                'sku' => $v->sku,
                'is_active' => $v->is_active,
                'sort_order' => $v->sort_order,
                'components' => $v->relationLoaded('packItems') && $v->stock_mode->value === 'pack'
                    ? $v->packItems->map(fn ($item) => [
                        'variant_id' => $item->component_variant_id,
                        'product' => $item->component->product->name,
                        'label' => $item->component->label,
                        'quantity' => $item->quantity,
                    ])->values()
                    : null,
            ])->values()),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
