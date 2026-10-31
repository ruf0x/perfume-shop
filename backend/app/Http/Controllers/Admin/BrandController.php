<?php

namespace App\Http\Controllers\Admin;

use App\Exceptions\ShopException;
use App\Http\Controllers\Controller;
use App\Models\Brand;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class BrandController extends Controller
{
    /** All brands with the product types they are sold in (`product_type_ids`). Filter with `?product_type_id=`. */
    public function index(Request $request): JsonResponse
    {
        $brands = Brand::query()->withCount('products')->with('productTypes:id')
            ->when($request->query('product_type_id'), fn ($q, $id) => $q->whereHas('productTypes', fn ($t) => $t->where('product_types.id', $id)))
            ->orderBy('name')->get();

        return response()->json(['data' => $brands->map(fn (Brand $b) => $this->present($b))->values()]);
    }

    public function store(Request $request): JsonResponse
    {
        $v = $request->validate([
            'name' => ['required', 'string', 'max:100', Rule::unique('brands', 'name')],
            /** The product types this brand is sold in. */
            'product_type_ids' => ['sometimes', 'array'],
            'product_type_ids.*' => ['integer', Rule::exists('product_types', 'id')->whereNull('deleted_at')],
        ]);

        $brand = Brand::create(['name' => $v['name'], 'slug' => Str::slug($v['name'])]);
        $brand->productTypes()->sync($v['product_type_ids'] ?? []);

        return response()->json(['data' => $this->present($brand->load('productTypes:id'))], 201);
    }

    public function update(Request $request, Brand $brand): JsonResponse
    {
        $v = $request->validate([
            'name' => ['sometimes', 'string', 'max:100', Rule::unique('brands', 'name')->ignore($brand)],
            'product_type_ids' => ['sometimes', 'array'],
            'product_type_ids.*' => ['integer', Rule::exists('product_types', 'id')->whereNull('deleted_at')],
        ]);

        if (isset($v['name'])) {
            $brand->update(['name' => $v['name'], 'slug' => Str::slug($v['name'])]);
        }
        if (isset($v['product_type_ids'])) {
            $brand->productTypes()->sync($v['product_type_ids']);
        }

        return response()->json(['data' => $this->present($brand->fresh('productTypes:id'))]);
    }

    /** @return array<string, mixed> */
    private function present(Brand $b): array
    {
        return ['id' => $b->id, 'name' => $b->name, 'slug' => $b->slug, 'products_count' => $b->products_count ?? $b->products()->count(), 'product_type_ids' => $b->productTypes->pluck('id')->values()];
    }

    /** Refused while products use the brand. */
    public function destroy(Brand $brand): Response
    {
        if ($brand->products()->exists()) {
            throw new ShopException('Des produits utilisent cette marque.');
        }

        $brand->delete();

        return response()->noContent();
    }
}
