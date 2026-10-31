<?php

namespace App\Http\Controllers\Admin;

use App\Enums\ProductKind;
use App\Exceptions\ShopException;
use App\Http\Controllers\Controller;
use App\Models\ProductType;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * The shop's product types ("rayons"): Parfums, Cosmétiques, Montres, Lunettes...
 * Each has its own families / categories, products, packs and brands.
 */
class ProductTypeController extends Controller
{
    /** All product types, hidden ones included, with how many products and categories each holds. */
    public function index(): JsonResponse
    {
        $types = ProductType::query()->withCount(['products', 'categories'])->orderBy('sort_order')->orderBy('id')->get();

        return response()->json(['data' => $types->map(fn (ProductType $t) => $this->present($t))->values()]);
    }

    public function store(Request $request): JsonResponse
    {
        $v = $request->validate([
            'name' => ['required', 'string', 'max:60', Rule::unique('product_types', 'name')],
            /** `perfume` = decants by the ml, notes, sealed bottles. `standard` = options counted in pieces (watches, glasses, make-up...). */
            'profile' => ['required', Rule::in([ProductKind::Perfume->value, ProductKind::Standard->value])],
            /** Offer a Homme / Femme / Mixte filter and field (watches, glasses, perfumes). */
            'uses_gender' => ['sometimes', 'boolean'],
            'sort_order' => ['nullable', 'integer'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $type = ProductType::create([
            'name' => $v['name'],
            'slug' => $this->uniqueSlug($v['name']),
            'profile' => $v['profile'],
            'uses_gender' => $v['uses_gender'] ?? $v['profile'] === ProductKind::Perfume->value,
            'sort_order' => $v['sort_order'] ?? (int) ProductType::query()->max('sort_order') + 1,
            'is_active' => $v['is_active'] ?? true,
        ]);

        return response()->json(['data' => $this->present($type->loadCount(['products', 'categories']))], 201);
    }

    public function update(Request $request, ProductType $productType): JsonResponse
    {
        $v = $request->validate([
            'name' => ['sometimes', 'string', 'max:60', Rule::unique('product_types', 'name')->ignore($productType)],
            'profile' => ['sometimes', Rule::in([ProductKind::Perfume->value, ProductKind::Standard->value])],
            'uses_gender' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        if (isset($v['profile']) && $v['profile'] !== $productType->profile->value && $productType->products()->withTrashed()->exists()) {
            throw new ShopException('Ce type contient déjà des produits : on ne peut plus changer sa façon de fonctionner.');
        }

        $productType->update($v);

        return response()->json(['data' => $this->present($productType->fresh()->loadCount(['products', 'categories']))]);
    }

    /**
     * Refused while it still holds products: hide it instead (`is_active: false`).
     * An empty type is removed together with its (empty) families / categories.
     */
    public function destroy(ProductType $productType): Response
    {
        if ($productType->products()->exists()) {
            throw new ShopException('Ce type contient encore des produits. Masquez-le plutôt que de le supprimer.');
        }

        $productType->categories()->delete();
        $productType->delete();

        return response()->noContent();
    }

    /** @return array<string, mixed> */
    private function present(ProductType $t): array
    {
        return [
            'id' => $t->id,
            'name' => $t->name,
            'slug' => $t->slug,
            'profile' => $t->profile,
            'uses_gender' => $t->uses_gender,
            'sort_order' => $t->sort_order,
            'is_active' => $t->is_active,
            'products_count' => $t->products_count ?? 0,
            'categories_count' => $t->categories_count ?? 0,
        ];
    }

    private function uniqueSlug(string $name): string
    {
        $base = Str::slug($name) ?: 'type';
        $slug = $base;

        for ($i = 2; ProductType::withTrashed()->where('slug', $slug)->exists(); $i++) {
            $slug = "{$base}-{$i}";
        }

        return $slug;
    }
}
