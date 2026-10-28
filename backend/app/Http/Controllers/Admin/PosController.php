<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\PosSaleRequest;
use App\Http\Resources\OrderResource;
use App\Services\OrderPlacement;
use Illuminate\Http\JsonResponse;

class PosController extends Controller
{
    /**
     * Record a sale made at the counter (caisse).
     *
     * The sale is completed immediately and the stock is deducted in the same step; if any
     * item is short nothing is recorded. The response has the receipt data, including `change_due`.
     */
    public function store(PosSaleRequest $request, OrderPlacement $placement): JsonResponse
    {
        $order = $placement->placePos($request->validated(), $request->user());

        return (new OrderResource($order->load(['items', 'creator:id,name'])))->response()->setStatusCode(201);
    }
}
