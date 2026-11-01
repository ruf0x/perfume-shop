<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\ProductVariant;
use App\Services\LoyaltyService;
use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LoyaltyController extends Controller
{
    /**
     * Where the customer with this phone number stands (for the caisse). `customer` is null when the number is new.
     */
    public function lookup(Request $request, LoyaltyService $loyalty): JsonResponse
    {
        $v = $request->validate(['phone' => ['required', 'string', 'max:20']]);
        $phone = Phone::normalize($v['phone']);
        $customer = $phone ? Customer::query()->where('phone', $phone)->first() : null;

        return response()->json(['data' => [
            'customer' => $customer ? ['id' => $customer->id, 'first_name' => $customer->first_name, 'last_name' => $customer->last_name] : null,
            'loyalty' => $customer ? $loyalty->progress($customer) : null,
        ]]);
    }

    /** A customer's count, pending gifts and the gifts already given. */
    public function show(Customer $customer, LoyaltyService $loyalty): JsonResponse
    {
        return response()->json(['data' => ['loyalty' => $loyalty->progress($customer), 'history' => $loyalty->history($customer)]]);
    }

    /** Give the oldest pending gift: a sealed flacon (any price: the average of the perfumes bought is only a guide). */
    public function redeem(Request $request, Customer $customer, LoyaltyService $loyalty): JsonResponse
    {
        $v = $request->validate(['variant_id' => ['required', 'integer', 'exists:product_variants,id']]);
        $loyalty->redeem($customer, ProductVariant::query()->findOrFail($v['variant_id']), $request->user());

        return response()->json(['data' => ['loyalty' => $loyalty->progress($customer), 'history' => $loyalty->history($customer)]]);
    }
}
