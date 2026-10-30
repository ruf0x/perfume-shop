<?php

namespace App\Http\Requests\Admin;

use App\Enums\StockMode;
use App\Models\PerfumeType;
use App\Models\Product;
use App\Models\ProductVariant;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Create / update a perfume, a cosmetic or a pack. Stock is NOT editable here (see the stock endpoints).
 */
class SaveProductRequest extends FormRequest
{
    private function product(): ?Product
    {
        $route = $this->route('product');

        return $route instanceof Product ? $route : null;
    }

    /** `perfume`, `cosmetic` or `pack`; fixed once the product exists. */
    public function kind(): string
    {
        return $this->product()?->kind->value ?? (string) $this->input('kind');
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $creating = $this->product() === null;
        $sometimes = $creating ? ['required'] : ['sometimes'];

        return [
            'kind' => $creating ? ['required', 'in:perfume,cosmetic,pack'] : ['prohibited'],
            'name' => [...$sometimes, 'string', 'max:150'],
            /** Auto-generated from the name when omitted. */
            'slug' => ['nullable', 'string', 'max:170', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/', Rule::unique('products', 'slug')->ignore($this->product())],
            'brand_id' => ['nullable', 'integer', 'exists:brands,id'],
            'perfume_type_id' => ['nullable', 'integer', 'exists:perfume_types,id'],
            'gender' => ['nullable', 'in:homme,femme,mixte'],
            /** For dupes: "Inspiré de Sauvage – Dior". */
            'inspired_by' => ['nullable', 'string', 'max:150'],
            'short_description' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:5000'],
            'notes_top' => ['nullable', 'string', 'max:255'],
            'notes_heart' => ['nullable', 'string', 'max:255'],
            'notes_base' => ['nullable', 'string', 'max:255'],
            'is_active' => ['sometimes', 'boolean'],
            'is_featured' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer'],

            /** Perfumes and cosmetics: sizes / options and prices. Send the full list; variants left out are removed (or deactivated if already used). */
            'variants' => [Rule::requiredIf($creating && $this->kind() !== 'pack'), 'array', 'min:1', 'max:20', Rule::prohibitedIf($this->kind() === 'pack')],
            'variants.*.id' => ['nullable', 'integer'],
            'variants.*.label' => ['required', 'string', 'max:60'],
            /** Millilitres: consumed per unit for `pool` variants, bottle size for `unit` variants. Optional for cosmetics sold by the piece. */
            'variants.*.ml' => ['nullable', 'integer', 'min:1', 'max:10000'],
            'variants.*.price' => ['required', 'integer', 'min:0'],
            'variants.*.compare_at_price' => ['nullable', 'integer', 'min:0'],
            /** `pool` = poured from the product's ml stock, `unit` = an item counted on its own (sealed bottle, nail kit, shade...). */
            'variants.*.stock_mode' => ['required', Rule::in([StockMode::Pool->value, StockMode::Unit->value])],
            'variants.*.sku' => ['nullable', 'string', 'max:50'],
            'variants.*.is_active' => ['sometimes', 'boolean'],
            'variants.*.sort_order' => ['sometimes', 'integer'],

            /** Packs: price and contents. */
            'pack' => [Rule::requiredIf($creating && $this->kind() === 'pack'), 'array', Rule::prohibitedIf($this->kind() !== 'pack')],
            'pack.price' => ['required_with:pack', 'integer', 'min:0'],
            'pack.compare_at_price' => ['nullable', 'integer', 'min:0'],
            'pack.components' => ['required_with:pack', 'array', 'min:1', 'max:20'],
            'pack.components.*.variant_id' => ['required', 'integer', 'exists:product_variants,id'],
            'pack.components.*.quantity' => ['required', 'integer', 'min:1', 'max:50'],
        ];
    }

    /** @return array<int, callable> */
    public function after(): array
    {
        return [function (Validator $validator) {
            foreach ($this->input('variants', []) as $i => $row) {
                // Perfumes always have a volume; a cosmetic only needs one when it is poured from an ml stock.
                $needsMl = $this->kind() === 'perfume' || ($row['stock_mode'] ?? null) === StockMode::Pool->value;
                if ($needsMl && empty($row['ml'])) {
                    $validator->errors()->add("variants.{$i}.ml", 'La contenance (ml) est obligatoire.');
                }
                if (! empty($row['sku'])) {
                    $taken = ProductVariant::query()->where('sku', $row['sku'])
                        ->when($row['id'] ?? null, fn ($q, $id) => $q->whereKeyNot($id))->exists();
                    if ($taken) {
                        $validator->errors()->add("variants.{$i}.sku", 'Ce SKU est déjà utilisé.');
                    }
                }
            }

            // A perfume belongs to a perfume family, a cosmetic to a cosmetic category.
            $typeId = $this->input('perfume_type_id');
            if ($typeId && in_array($this->kind(), ['perfume', 'cosmetic'], true)) {
                $typeKind = PerfumeType::query()->whereKey($typeId)->first()?->kind->value;
                if ($typeKind !== null && $typeKind !== $this->kind()) {
                    $validator->errors()->add('perfume_type_id', $this->kind() === 'perfume' ? 'Choisissez une famille de parfums.' : 'Choisissez une catégorie de cosmétiques.');
                }
            }

            $componentIds = collect($this->input('pack.components', []))->pluck('variant_id')->filter();
            if ($componentIds->isNotEmpty()) {
                $invalid = ProductVariant::query()->whereIn('id', $componentIds)->where('stock_mode', StockMode::Pack)->exists();
                if ($invalid) {
                    $validator->errors()->add('pack.components', 'Un pack ne peut pas contenir un autre pack.');
                }
            }
        }];
    }
}
