<?php

namespace App\Http\Requests\Admin;

use App\Enums\StockMode;
use App\Models\PerfumeType;
use App\Models\Product;
use App\Models\ProductType;
use App\Models\ProductVariant;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Create / update a product (in one of the owner's product types) or a pack.
 * Stock is NOT editable here (see the stock endpoints).
 */
class SaveProductRequest extends FormRequest
{
    private function product(): ?Product
    {
        $route = $this->route('product');

        return $route instanceof Product ? $route : null;
    }

    /** The product type being used: the one in the request, else the product's own. */
    private function productType(): ?ProductType
    {
        $id = $this->input('product_type_id') ?? $this->product()?->product_type_id;

        return $id ? ProductType::query()->find($id) : null;
    }

    /**
     * `perfume` or `standard` (the profile of the product's type), or `pack`. Fixed once the product exists.
     * Creating a pack is `"kind": "pack"`; anything else is created from its `product_type_id`.
     */
    public function kind(): string
    {
        if ($product = $this->product()) {
            return $product->kind->value;
        }

        return $this->input('kind') === 'pack' ? 'pack' : ($this->productType()?->profile->value ?? 'standard');
    }

    /** @return array<string, mixed> */
    public function validated($key = null, $default = null)
    {
        $data = parent::validated($key, $default);

        return ($key === null && $this->product() === null) ? ['kind' => $this->kind()] + $data : $data;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $creating = $this->product() === null;
        $sometimes = $creating ? ['required'] : ['sometimes'];
        $isPack = $this->kind() === 'pack';
        $typeExists = Rule::exists('product_types', 'id')->whereNull('deleted_at');

        return [
            /** Only `pack` is ever sent: everything else is created from its `product_type_id`. */
            'kind' => $creating ? ['nullable', 'in:pack'] : ['prohibited'],
            /** The product type (Parfums, Montres...). Required, except for a pack where it only says where the pack is shown. */
            'product_type_id' => $creating
                ? [Rule::requiredIf(! $isPack), 'nullable', 'integer', $typeExists]
                : ['sometimes', $isPack ? 'nullable' : 'required', 'integer', $typeExists],
            'name' => [...$sometimes, 'string', 'max:150'],
            /** Auto-generated from the name when omitted. */
            'slug' => ['nullable', 'string', 'max:170', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/', Rule::unique('products', 'slug')->ignore($this->product())],
            'brand_id' => ['nullable', 'integer', 'exists:brands,id', Rule::prohibitedIf($isPack)],
            /** A brand typed by name: found (any case) or created, and listed under the product's type. Wins over brand_id. */
            'brand_name' => ['nullable', 'string', 'max:100', Rule::prohibitedIf($isPack)],
            /** The family / category inside the product type (Designer, Lunettes de soleil...). */
            'perfume_type_id' => ['nullable', 'integer', 'exists:perfume_types,id', Rule::prohibitedIf($isPack)],
            /** Only kept when the product type uses a gender. */
            'gender' => ['nullable', 'in:homme,femme,mixte'],
            /** Perfumes only. For dupes: "Inspiré de Sauvage – Dior". */
            'inspired_by' => ['nullable', 'string', 'max:150'],
            'short_description' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:5000'],
            'notes_top' => ['nullable', 'string', 'max:255'],
            'notes_heart' => ['nullable', 'string', 'max:255'],
            'notes_base' => ['nullable', 'string', 'max:255'],
            'is_active' => ['sometimes', 'boolean'],
            'is_featured' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer'],

            /** Products: sizes / options and prices. Send the full list; variants left out are removed (or deactivated if already used). */
            'variants' => [Rule::requiredIf($creating && ! $isPack), 'array', 'min:1', 'max:20', Rule::prohibitedIf($isPack)],
            'variants.*.id' => ['nullable', 'integer'],
            'variants.*.label' => ['required', 'string', 'max:60'],
            /** Millilitres: consumed per unit for `pool` variants, bottle size for `unit` variants. Optional for products sold by the piece. */
            'variants.*.ml' => ['nullable', 'integer', 'min:1', 'max:10000'],
            'variants.*.price' => ['required', 'integer', 'min:0'],
            'variants.*.compare_at_price' => ['nullable', 'integer', 'min:0'],
            'variants.*.cost_price' => ['nullable', 'integer', 'min:0'],
            /** `pool` = poured from the product's ml stock, `unit` = an item counted on its own (sealed bottle, watch, shade...). */
            'variants.*.stock_mode' => ['required', Rule::in([StockMode::Pool->value, StockMode::Unit->value])],
            'variants.*.sku' => ['nullable', 'string', 'max:50'],
            'variants.*.is_active' => ['sometimes', 'boolean'],
            'variants.*.sort_order' => ['sometimes', 'integer'],
            /** Creating only: bottles received with the product (unit = sealed flacons; pool = bottles of `ml` each, turned into ml). */
            'variants.*.initial_qty' => ['nullable', 'integer', 'min:0', 'max:100000'],

            /** Packs: price and contents. The contents can come from any product type. */
            'pack' => [Rule::requiredIf($creating && $isPack), 'array', Rule::prohibitedIf(! $isPack)],
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
                // Perfumes always have a volume; any other product only needs one when it is poured from an ml stock.
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

            $type = $this->productType();

            // A product keeps its way of working: it can only move to a product type with the same profile.
            if ($this->product() && $this->has('product_type_id') && $this->kind() !== 'pack' && $type && $type->profile->value !== $this->kind()) {
                $validator->errors()->add('product_type_id', 'Ce produit ne peut passer que dans un type qui fonctionne de la même façon (parfums ou produits à la pièce).');
            }

            // The family / category must belong to the product's type.
            $categoryId = $this->input('perfume_type_id');
            if ($categoryId && $type) {
                $categoryTypeId = PerfumeType::query()->whereKey($categoryId)->value('product_type_id');
                if ($categoryTypeId !== null && (int) $categoryTypeId !== $type->id) {
                    $validator->errors()->add('perfume_type_id', "Choisissez une famille ou une catégorie de « {$type->name} ».");
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
