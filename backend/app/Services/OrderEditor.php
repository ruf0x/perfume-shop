<?php

namespace App\Services;

use App\Enums\OrderStatus;
use App\Enums\StockMovementType;
use App\Exceptions\ShopException;
use App\Models\Commune;
use App\Models\Order;
use App\Models\ProductVariant;
use App\Models\User;
use App\Support\Phone;
use Illuminate\Support\Facades\DB;

/**
 * Lets the admin correct an order after the phone call (items, quantities, fees, client details).
 * Only for pending / confirmed orders. A confirmed order has its stock put back and taken again
 * in the same transaction, so a shortage rolls the whole edit back.
 */
class OrderEditor
{
    public function __construct(private StockService $stock) {}

    /** @param array<string, mixed> $data */
    public function update(Order $order, array $data, ?User $user = null): Order
    {
        return DB::transaction(function () use ($order, $data, $user) {
            $order = Order::query()->lockForUpdate()->findOrFail($order->id);

            if (! in_array($order->status, [OrderStatus::EnAttente, OrderStatus::Confirmee], true)) {
                throw new ShopException('Cette commande ne peut plus être modifiée.');
            }

            $fields = $this->clientFields($order, $data);

            if (isset($data['lines'])) {
                $this->replaceItems($order, $data['lines'], $user);
            }

            $subtotal = (int) $order->items()->sum('line_total');
            $fee = (int) ($data['delivery_fee'] ?? $order->delivery_fee);
            $discount = (int) ($data['discount'] ?? $order->discount);

            if ($discount > $subtotal) {
                throw new ShopException('La remise dépasse le sous-total.');
            }

            $order->forceFill($fields + [
                'subtotal' => $subtotal,
                'delivery_fee' => $fee,
                'discount' => $discount,
                'total' => $subtotal + $fee - $discount,
            ])->save();

            // Re-take the stock for the new items; throws (and rolls everything back) if short.
            if (isset($data['lines']) && $order->status === OrderStatus::Confirmee) {
                $this->stock->deductForOrder($order, $user);
            }

            $order->history()->create([
                'from_status' => $order->status,
                'to_status' => $order->status,
                'user_id' => $user?->id,
                'note' => 'Commande modifiée',
            ]);

            return $order->refresh();
        });
    }

    /** @param array<string, mixed> $data */
    private function clientFields(Order $order, array $data): array
    {
        $fields = array_intersect_key($data, array_flip([
            'first_name', 'last_name', 'wilaya_id', 'commune_id', 'address', 'delivery_mode', 'admin_note',
        ]));

        foreach (['phone', 'phone2'] as $key) {
            if (array_key_exists($key, $data)) {
                $fields[$key] = filled($data[$key])
                    ? (Phone::normalize($data[$key]) ?? throw new ShopException('Numéro de téléphone invalide.'))
                    : null;
            }
        }
        if (array_key_exists('phone', $fields) && $fields['phone'] === null) {
            throw new ShopException('Le téléphone principal est obligatoire.');
        }

        $wilayaId = $fields['wilaya_id'] ?? $order->wilaya_id;
        $communeId = $fields['commune_id'] ?? $order->commune_id;
        if ($communeId && ! Commune::query()->whereKey($communeId)->where('wilaya_id', $wilayaId)->exists()) {
            throw new ShopException("Cette commune n'appartient pas à la wilaya choisie.");
        }

        return $fields;
    }

    /** @param list<array{variant_id: int, quantity: int}> $lines */
    private function replaceItems(Order $order, array $lines, ?User $user): void
    {
        $previous = $order->items()->get()->keyBy('variant_id');

        // Put the old items' stock back first, while they are still in the order.
        if ($order->stock_deducted) {
            $this->stock->restoreForOrder($order, StockMovementType::Ajustement, $user);
        }

        $quantities = [];
        foreach ($lines as $line) {
            $quantities[$line['variant_id']] = ($quantities[$line['variant_id']] ?? 0) + $line['quantity'];
        }

        $variants = ProductVariant::query()->with(['product' => fn ($q) => $q->withTrashed()])->whereIn('id', array_keys($quantities))->get()->keyBy('id');

        $order->items()->delete();
        foreach ($quantities as $variantId => $quantity) {
            $variant = $variants[$variantId];
            $kept = $previous->get($variantId);

            // Existing lines keep their snapshot; a new line must be something we still sell.
            if (! $kept && (! $variant->is_active || ! $variant->product?->is_active)) {
                throw new ShopException("L'article « {$variant->label} » n'est plus en vente.");
            }

            $unitPrice = $kept?->unit_price ?? $variant->price;
            $order->items()->create([
                'product_id' => $variant->product_id,
                'variant_id' => $variant->id,
                'product_name' => $kept?->product_name ?? $variant->product->name,
                'variant_label' => $kept?->variant_label ?? $variant->label,
                'ml' => $variant->ml,
                'unit_price' => $unitPrice,
                'quantity' => $quantity,
                'line_total' => $unitPrice * $quantity,
            ]);
        }
    }
}
