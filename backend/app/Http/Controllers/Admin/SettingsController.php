<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Wilaya;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SettingsController extends Controller
{
    /** All shop settings (with defaults for the ones never saved). */
    public function show(): JsonResponse
    {
        return response()->json(['data' => settings()->all()]);
    }

    /**
     * Save settings. Send only the keys to change.
     *
     * `show_unavailable`: show out-of-stock items greyed out (true) or hide them (false).
     * `low_stock_threshold_ml`: below this many ml a perfume counts as unavailable (default 10).
     * `low_stock_threshold_qty`: at or below this many units a cosmetic shows as low in stock (default 3).
     */
    public function update(Request $request): JsonResponse
    {
        $v = $request->validate([
            'shop_name' => ['sometimes', 'string', 'max:100'],
            'shop_phone' => ['sometimes', 'nullable', 'string', 'max:30'],
            'shop_address' => ['sometimes', 'nullable', 'string', 'max:255'],
            'socials' => ['sometimes', 'array', 'max:10'],
            'socials.*' => ['nullable', 'string', 'max:255'],
            'show_unavailable' => ['sometimes', 'boolean'],
            'low_stock_threshold_ml' => ['sometimes', 'integer', 'min:0', 'max:10000'],
            'low_stock_threshold_qty' => ['sometimes', 'integer', 'min:0', 'max:10000'],
            'store_pickup_enabled' => ['sometimes', 'boolean'],
            /** Subtotal (DZD) from which delivery is free; `null` disables it. */
            'free_delivery_over' => ['sometimes', 'nullable', 'integer', 'min:0'],
        ]);

        settings()->setMany($v);

        return response()->json(['data' => settings()->all()]);
    }

    /** Every wilaya with its delivery fees, including the ones we do not deliver to. */
    public function wilayas(): JsonResponse
    {
        return response()->json(['data' => Wilaya::query()->orderBy('id')->get(['id', 'code', 'name', 'name_ar', 'home_fee', 'desk_fee', 'is_active'])]);
    }

    /** Edit a wilaya's delivery fees (DZD) or switch delivery to it on/off. */
    public function updateWilaya(Request $request, Wilaya $wilaya): JsonResponse
    {
        $wilaya->update($request->validate([
            'home_fee' => ['sometimes', 'integer', 'min:0', 'max:100000'],
            'desk_fee' => ['sometimes', 'integer', 'min:0', 'max:100000'],
            'is_active' => ['sometimes', 'boolean'],
        ]));

        return response()->json(['data' => $wilaya->fresh()->only(['id', 'code', 'name', 'name_ar', 'home_fee', 'desk_fee', 'is_active'])]);
    }
}
