<?php

namespace App\Http\Controllers\Public;

use App\Enums\DeliveryMode;
use App\Exceptions\ShopException;
use App\Http\Controllers\Controller;
use App\Http\Requests\CartRequest;
use App\Http\Requests\StoreOrderRequest;
use App\Models\ProductVariant;
use App\Services\OrderPlacement;
use App\Services\Pricing;
use App\Support\QuoteLine;
use Illuminate\Http\JsonResponse;

class ShopController extends Controller
{
    /** Shop info the storefront needs (name, phone, socials, pickup, free-delivery threshold). */
    public function settings(): JsonResponse
    {
        $s = settings()->all();

        return response()->json(['data' => [
            'shop_name' => $s['shop_name'],
            'shop_phone' => $s['shop_phone'],
            'shop_address' => $s['shop_address'],
            'socials' => $s['socials'],
            'store_pickup_enabled' => $s['store_pickup_enabled'],
            'free_delivery_over' => $s['free_delivery_over'],
            'show_unavailable' => $s['show_unavailable'],
            /** When false the website's /admin page only says to use the desktop app. */
            'web_admin_enabled' => $s['web_admin_enabled'],
        ]]);
    }

    /**
     * Re-price a cart from the database.
     *
     * Returns each line's current price and availability, the lines that no longer exist,
     * and — once `wilaya_id` and `delivery_mode` are given — the delivery fee and total.
     * Never trust prices stored in the browser: call this before checkout.
     */
    public function validateCart(CartRequest $request, Pricing $pricing): JsonResponse
    {
        $v = $request->validated();

        $existing = ProductVariant::query()->whereIn('id', collect($v['lines'])->pluck('variant_id'))->pluck('id')->all();
        $removed = array_values(array_diff(collect($v['lines'])->pluck('variant_id')->all(), $existing));
        $lines = array_values(array_filter($v['lines'], fn (array $line) => in_array($line['variant_id'], $existing, true)));

        if ($lines === []) {
            return response()->json(['data' => ['lines' => [], 'removed' => $removed, 'subtotal' => 0, 'delivery_fee' => null, 'total' => 0, 'all_available' => false]]);
        }

        $withDelivery = ! empty($v['delivery_mode']) && (! empty($v['wilaya_id']) || $v['delivery_mode'] === DeliveryMode::Boutique->value);
        $quote = $pricing->quote($lines, $v['wilaya_id'] ?? null, $withDelivery ? DeliveryMode::from($v['delivery_mode']) : null);

        return response()->json(['data' => [
            'lines' => collect($quote->lines)->map(fn (QuoteLine $line) => [
                'variant_id' => $line->variant->id,
                'product' => $line->variant->product->name,
                'label' => $line->variant->label,
                'image' => media_url($line->variant->product->main_image),
                'quantity' => $line->quantity,
                'unit_price' => $line->unitPrice,
                'line_total' => $line->lineTotal,
                'available' => $line->available(),
                'max_qty' => $line->maxQty,
            ])->values(),
            'removed' => $removed,
            'subtotal' => $quote->subtotal,
            'delivery_fee' => $withDelivery ? $quote->deliveryFee : null,
            'total' => $quote->total,
            'all_available' => $quote->allAvailable(),
        ]]);
    }

    /**
     * Place an order (no account needed, cash on delivery).
     *
     * Throttled to 5 per minute per IP. Stock is not reserved: the owner confirms by phone.
     */
    public function placeOrder(StoreOrderRequest $request, OrderPlacement $placement): JsonResponse
    {
        $order = $placement->placeOnline($request->safe()->except('website'), $request->ip());

        return response()->json(['data' => [
            'reference' => $order->reference,
            'total' => $order->total,
            'delivery_fee' => $order->delivery_fee,
        ]], 201);
    }
}
