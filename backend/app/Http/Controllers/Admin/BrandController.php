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
    public function index(): JsonResponse
    {
        return response()->json(['data' => Brand::query()->withCount('products')->orderBy('name')->get()]);
    }

    public function store(Request $request): JsonResponse
    {
        $v = $request->validate(['name' => ['required', 'string', 'max:100', Rule::unique('brands', 'name')]]);

        return response()->json(['data' => Brand::create($v + ['slug' => Str::slug($v['name'])])], 201);
    }

    public function update(Request $request, Brand $brand): JsonResponse
    {
        $v = $request->validate(['name' => ['required', 'string', 'max:100', Rule::unique('brands', 'name')->ignore($brand)]]);

        $brand->update($v + ['slug' => Str::slug($v['name'])]);

        return response()->json(['data' => $brand->fresh()]);
    }

    /** Refused while perfumes use the brand. */
    public function destroy(Brand $brand): Response
    {
        if ($brand->products()->exists()) {
            throw new ShopException('Des parfums utilisent cette marque.');
        }

        $brand->delete();

        return response()->noContent();
    }
}
