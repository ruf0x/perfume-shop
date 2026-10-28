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
    /** All perfume types (Designer, Niche, Arabe...), including hidden ones. */
    public function index(): JsonResponse
    {
        return response()->json(['data' => PerfumeType::query()->withCount('products')->orderBy('sort_order')->get()]);
    }

    public function store(Request $request): JsonResponse
    {
        $v = $request->validate([
            'name' => ['required', 'string', 'max:60', Rule::unique('perfume_types', 'name')],
            'sort_order' => ['nullable', 'integer'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $type = PerfumeType::create($v + ['slug' => Str::slug($v['name']), 'sort_order' => $v['sort_order'] ?? (int) PerfumeType::max('sort_order') + 1]);

        return response()->json(['data' => $type], 201);
    }

    public function update(Request $request, PerfumeType $type): JsonResponse
    {
        $v = $request->validate([
            'name' => ['sometimes', 'string', 'max:60', Rule::unique('perfume_types', 'name')->ignore($type)],
            'sort_order' => ['sometimes', 'integer'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $type->update($v + (isset($v['name']) ? ['slug' => Str::slug($v['name'])] : []));

        return response()->json(['data' => $type->fresh()]);
    }

    /** Refused while perfumes use the type: hide it instead (`is_active: false`). */
    public function destroy(PerfumeType $type): Response
    {
        if ($type->products()->exists()) {
            throw new ShopException('Des parfums utilisent ce type. Désactivez-le plutôt que de le supprimer.');
        }

        $type->delete();

        return response()->noContent();
    }
}
