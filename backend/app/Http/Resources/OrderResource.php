<?php

namespace App\Http\Resources;

use App\Models\Order;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Admin view of an order. `items`, `history`, `wilaya` and `commune` appear when loaded.
 *
 * @mixin Order
 */
class OrderResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference' => $this->reference,
            'channel' => $this->channel,
            'status' => $this->status,
            'status_label' => $this->status->label(),
            /** Workflow actions allowed from the current status. */
            'allowed_actions' => $this->status->actions(),
            'customer' => [
                'id' => $this->customer_id,
                'first_name' => $this->first_name,
                'last_name' => $this->last_name,
                'phone' => $this->phone,
                'phone2' => $this->phone2,
            ],
            'wilaya' => $this->whenLoaded('wilaya', fn () => $this->wilaya ? ['id' => $this->wilaya->id, 'name' => $this->wilaya->name] : null),
            'commune' => $this->whenLoaded('commune', fn () => $this->commune ? ['id' => $this->commune->id, 'name' => $this->commune->name] : null),
            'address' => $this->address,
            'delivery_mode' => $this->delivery_mode,
            'customer_note' => $this->customer_note,
            'admin_note' => $this->admin_note,
            'subtotal' => $this->subtotal,
            'delivery_fee' => $this->delivery_fee,
            'discount' => $this->discount,
            'total' => $this->total,
            'payment_method' => $this->payment_method,
            'amount_received' => $this->amount_received,
            /** Change to give back (caisse, cash only). */
            'change_due' => $this->amount_received !== null ? $this->amount_received - $this->total : null,
            'call_attempts' => $this->call_attempts,
            'delivery_company' => $this->delivery_company,
            'tracking_number' => $this->tracking_number,
            'cancel_reason' => $this->cancel_reason,
            'stock_deducted' => $this->stock_deducted,
            'items_count' => $this->whenCounted('items'),
            'items' => $this->whenLoaded('items', fn () => $this->items->map(fn ($item) => [
                'id' => $item->id,
                'variant_id' => $item->variant_id,
                'product_name' => $item->product_name,
                'variant_label' => $item->variant_label,
                'ml' => $item->ml,
                'unit_price' => $item->unit_price,
                'quantity' => $item->quantity,
                'line_total' => $item->line_total,
            ])->values()),
            'history' => $this->whenLoaded('history', fn () => $this->history->map(fn ($h) => [
                'from' => $h->from_status,
                'to' => $h->to_status,
                'note' => $h->note,
                'user' => $h->user?->name,
                'at' => $h->created_at,
            ])->values()),
            'created_by' => $this->whenLoaded('creator', fn () => $this->creator?->name),
            'confirmed_at' => $this->confirmed_at,
            'shipped_at' => $this->shipped_at,
            'delivered_at' => $this->delivered_at,
            'completed_at' => $this->completed_at,
            'cancelled_at' => $this->cancelled_at,
            'returned_at' => $this->returned_at,
            'created_at' => $this->created_at,
        ];
    }
}
