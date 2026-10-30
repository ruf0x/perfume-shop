<?php

namespace App\Http\Controllers\Admin;

use App\Exceptions\ShopException;
use App\Http\Controllers\Controller;
use App\Models\PerfumeType;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class TypeController extends Controller
{
    /** All perfume families (Designer, Niche...) and cosmetic categories (Maquillage, Ongles...), including hidden ones. `kind` tells them apart. */
    public function index(): JsonResponse
    {
        return response()->json(['data' => PerfumeType::query()->withCount('products')->orderBy('sort_order')->get()]);
    }

    public function store(Request $request): JsonResponse
    {
        $v = $request->validate([
            'name' => ['required', 'string', 'max:60', Rule::unique('perfume_types', 'name')],
            /** `perfume` (a famille) or `cosmetic` (a category). Defaults to `perfume`. */
            'kind' => ['nullable', 'in:perfume,cosmetic'],
            'sort_order' => ['nullable', 'integer'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $type = PerfumeType::create(array_filter($v, fn ($x) => $x !== null) + ['kind' => 'perfume', 'slug' => Str::slug($v['name']), 'sort_order' => (int) PerfumeType::max('sort_order') + 1]);

        return response()->json(['data' => $type], 201);
    }

    public function update(Request $request, PerfumeType $type): JsonResponse
    {
        $v = $request->validate([
            'name' => ['sometimes', 'string', 'max:60', Rule::unique('perfume_types', 'name')->ignore($type)],
            'kind' => ['sometimes', 'in:perfume,cosmetic'],
            'sort_order' => ['sometimes', 'integer'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        if (isset($v['kind']) && $v['kind'] !== $type->kind->value && $type->products()->exists()) {
            throw new ShopException('Des produits utilisent déjà ce classement : impossible de le faire passer de parfums à cosmétiques.');
        }

        $type->update($v + (isset($v['name']) ? ['slug' => Str::slug($v['name'])] : []));

        return response()->json(['data' => $type->fresh()]);
    }

    /** Refused while perfumes use the type: hide it instead (`is_active: false`). */
    public function destroy(PerfumeType $type): Response
    {
        if ($type->products()->exists()) {
            throw new ShopException('Des produits utilisent ce classement. Désactivez-le plutôt que de le supprimer.');
        }

        $type->delete();

        return response()->noContent();
    }
}
