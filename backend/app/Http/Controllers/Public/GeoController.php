<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\Wilaya;
use Illuminate\Http\JsonResponse;

class GeoController extends Controller
{
    /** Wilayas we deliver to, with delivery fees. */
    public function wilayas(): JsonResponse
    {
        return response()->json(['data' => Wilaya::query()->where('is_active', true)->orderBy('id')
            ->get(['id', 'code', 'name', 'name_ar', 'home_fee', 'desk_fee'])]);
    }

    /** Communes (baladiyas) of a wilaya. */
    public function communes(Wilaya $wilaya): JsonResponse
    {
        return response()->json(['data' => $wilaya->communes()->orderBy('name')->get(['id', 'name', 'name_ar'])]);
    }
}
