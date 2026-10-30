<?php

namespace App\Services;

use App\Enums\ProductKind;
use App\Enums\StockMode;
use App\Exceptions\ShopException;
use App\Models\OrderItem;
use App\Models\PackItem;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\StockMovement;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Creates and updates perfumes and packs together with their variants / contents.
 * Never touches stock: that goes through StockService.
 */
class ProductService
{
    private const FIELDS = [
        'name', 'brand_id', 'perfume_type_id', 'gender', 'inspired_by', 'short_description', 'description',
        'notes_top', 'notes_heart', 'notes_base', 'is_active', 'is_featured', 'sort_order',
    ];

    /** Only perfumes have a gender, an "inspired by" and olfactory notes. */
    private const PERFUME_ONLY = ['gender', 'inspired_by', 'notes_top', 'notes_heart', 'notes_base'];

    /** @param array<string, mixed> $data */
    public function create(array $data): Product
    {
        return DB::transaction(function () use ($data) {
            $data = $this->withoutPerfumeFields($data, ProductKind::from($data['kind']));
            $product = Product::create(Arr::only($data, self::FIELDS) + [
                'kind' => ProductKind::from($data['kind']),
                'slug' => $this->uniqueSlug($data['slug'] ?? $data['name']),
            ]);

            $this->syncContents($product, $data);

            return $this->fresh($product);
        });
    }

    /** @param array<string, mixed> $data */
    public function update(Product $product, array $data): Product
    {
        return DB::transaction(function () use ($product, $data) {
            $data = $this->withoutPerfumeFields($data, $product->kind);
            $product->fill(Arr::only($data, self::FIELDS));
            if (! empty($data['slug']) && $data['slug'] !== $product->slug) {
                $product->slug = $data['slug'];
            }
            $product->save();

            $this->syncContents($product, $data);

            return $this->fresh($product);
        });
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function withoutPerfumeFields(array $data, ProductKind $kind): array
    {
        return $kind === ProductKind::Perfume ? $data : array_merge($data, array_fill_keys(self::PERFUME_ONLY, null));
    }

    /** Soft delete: old orders keep pointing at the product. */
    public function delete(Product $product): void
    {
        // Only packs still on sale block the deletion: a deleted pack no longer uses this perfume.
        $packs = PackItem::query()
            ->whereIn('component_variant_id', $product->variants()->select('id'))
            ->with(['pack.product' => fn ($q) => $q->withTrashed()])->get()
            ->filter(fn (PackItem $item) => $item->pack?->product && $item->pack->product->deleted_at === null)
            ->map(fn (PackItem $item) => $item->pack->product->name)->unique();

        if ($packs->isNotEmpty()) {
            throw new ShopException("Ce produit fait partie du pack : {$packs->implode(', ')}. Retirez-le du pack d'abord.");
        }

        $product->delete();
    }

    /** @param array<string, mixed> $data */
    private function syncContents(Product $product, array $data): void
    {
        if ($product->kind->hasOwnStock() && array_key_exists('variants', $data)) {
            $this->syncVariants($product, $data['variants']);
        }
        if ($product->kind === ProductKind::Pack && isset($data['pack'])) {
            $this->syncPack($product, $data['pack']);
        }
    }

    /** @param list<array<string, mixed>> $rows */
    private function syncVariants(Product $product, array $rows): void
    {
        $existing = $product->variants()->get()->keyBy('id');
        $keep = [];

        foreach ($rows as $i => $row) {
            $attributes = Arr::only($row, ['label', 'ml', 'price', 'compare_at_price', 'sku', 'is_active']) + ['sort_order' => $row['sort_order'] ?? $i];
            $attributes['stock_mode'] = StockMode::from($row['stock_mode']);

            if (! empty($row['id'])) {
                $variant = $existing->get($row['id']) ?? throw new ShopException("La variante {$row['id']} n'appartient pas à ce produit.");

                if ($variant->stock_mode !== $attributes['stock_mode'] && $variant->stock_qty > 0) {
                    throw new ShopException("Videz d'abord le stock en unités de « {$variant->label} » avant de changer son type de stock.");
                }
                $variant->update($attributes);
            } else {
                $variant = $product->variants()->create($attributes);
            }
            $keep[] = $variant->id;
        }

        foreach ($existing->except($keep) as $variant) {
            $this->usedElsewhere($variant) ? $variant->update(['is_active' => false]) : $variant->delete();
        }
    }

    /** @param array{price: int, compare_at_price?: ?int, components: list<array{variant_id: int, quantity: int}>} $pack */
    private function syncPack(Product $product, array $pack): void
    {
        $variant = $product->variants()->first() ?? $product->variants()->make(['label' => 'Pack', 'stock_mode' => StockMode::Pack]);
        $variant->fill(['price' => $pack['price'], 'compare_at_price' => $pack['compare_at_price'] ?? null])->save();

        $variant->packItems()->delete();
        foreach ($pack['components'] as $component) {
            $variant->packItems()->create(['component_variant_id' => $component['variant_id'], 'quantity' => $component['quantity']]);
        }
    }

    /** A variant with history (orders, stock movements, pack membership, bottles) can only be deactivated. */
    private function usedElsewhere(ProductVariant $variant): bool
    {
        return $variant->stock_qty > 0
            || OrderItem::query()->where('variant_id', $variant->id)->exists()
            || StockMovement::query()->where('variant_id', $variant->id)->exists()
            || PackItem::query()->where('component_variant_id', $variant->id)->exists();
    }

    private function uniqueSlug(string $source): string
    {
        $base = Str::slug($source) ?: 'produit';
        $slug = $base;

        for ($i = 2; Product::withTrashed()->where('slug', $slug)->exists(); $i++) {
            $slug = "{$base}-{$i}";
        }

        return $slug;
    }

    private function fresh(Product $product): Product
    {
        return $product->fresh(['brand', 'type', 'images', 'variants.packItems.component.product']);
    }
}
