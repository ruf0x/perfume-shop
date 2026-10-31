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
    /** All families / categories of every product type (Designer, Niche... Maquillage... Lunettes de soleil...), hidden ones included. Filter with `?product_type_id=`. */
    public function index(Request $request): JsonResponse
    {
        $rows = PerfumeType::query()->withCount('products')
            ->when($request->query('product_type_id'), fn ($q, $id) => $q->where('product_type_id', $id))
            ->orderBy('sort_order')->orderBy('id')->get();

        return response()->json(['data' => $rows]);
    }

    public function store(Request $request): JsonResponse
    {
        $v = $request->validate([
            /** The product type this family / category belongs to. */
            'product_type_id' => ['required', 'integer', Rule::exists('product_types', 'id')->whereNull('deleted_at')],
            /** Unique inside its product type. */
            'name' => ['required', 'string', 'max:60', Rule::unique('perfume_types', 'name')->where('product_type_id', $request->input('product_type_id'))],
            'sort_order' => ['nullable', 'integer'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $type = PerfumeType::create(array_filter($v, fn ($x) => $x !== null) + ['slug' => Str::slug($v['name']), 'sort_order' => (int) PerfumeType::max('sort_order') + 1]);

        return response()->json(['data' => $type], 201);
    }

    public function update(Request $request, PerfumeType $type): JsonResponse
    {
        $v = $request->validate([
            'name' => ['sometimes', 'string', 'max:60', Rule::unique('perfume_types', 'name')->where('product_type_id', $request->input('product_type_id', $type->product_type_id))->ignore($type)],
            'product_type_id' => ['sometimes', 'integer', Rule::exists('product_types', 'id')->whereNull('deleted_at')],
            'sort_order' => ['sometimes', 'integer'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        if (isset($v['product_type_id']) && (int) $v['product_type_id'] !== (int) $type->product_type_id && $type->products()->exists()) {
            throw new ShopException('Des produits utilisent déjà ce classement : impossible de le déplacer dans un autre type.');
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
