<?php

namespace App\Services;

use App\Enums\OrderStatus;
use App\Enums\StockMovementType;
use App\Exceptions\ShopException;
use App\Enums\OrderChannel;
use App\Enums\PaymentMethod;
use App\Models\Commune;
use App\Models\Customer;
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

            $editable = in_array($order->status, [OrderStatus::EnAttente, OrderStatus::Confirmee], true);
            if (! $editable && array_intersect(['lines', 'delivery_fee', 'discount', 'delivery_mode'], array_keys($data)) !== []) {
                throw new ShopException('Les articles, la remise et la livraison ne se modifient plus une fois la commande expédiée, vendue ou annulée. Le client, le paiement et les notes restent modifiables.');
            }

            $fields = $this->clientFields($order, $data) + $this->paymentFields($order, $data);

            if (! $editable) {
                // Only the details that never touch stock or money: the client, the notes, how it was paid.
                $order->forceFill($fields)->save();
                $this->syncCustomer($order);
                $order->history()->create(['from_status' => $order->status, 'to_status' => $order->status, 'user_id' => $user?->id, 'note' => 'Informations modifiées']);

                return $order->refresh();
            }

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
            $this->syncCustomer($order);

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

    /**
     * How a caisse sale was paid (a forgotten card payment, say). Cash needs the amount received.
     *
     * @param  array<string, mixed>  $data
     */
    private function paymentFields(Order $order, array $data): array
    {
        if (! array_key_exists('payment_method', $data)) {
            return [];
        }
        if ($order->channel !== OrderChannel::Pos) {
            throw new ShopException('Le mode de paiement ne se change que sur une vente en caisse.');
        }

        $method = PaymentMethod::from($data['payment_method']);
        if ($method === PaymentMethod::Especes) {
            $received = (int) ($data['amount_received'] ?? $order->amount_received ?? 0);
            if ($received < $order->total) {
                throw new ShopException('Le montant reçu est inférieur au total.');
            }

            return ['payment_method' => $method, 'amount_received' => $received];
        }

        return ['payment_method' => $method, 'amount_received' => null];
    }

    /**
     * Keep the customer record in step with the order's phone: a sale made without a client gets one when the
     * number is added later, and an order moved to another number moves its counters and loyalty perfumes with it.
     */
    private function syncCustomer(Order $order): void
    {
        if (! $order->phone) {
            return;
        }

        $current = $order->customer_id ? Customer::query()->find($order->customer_id) : null;
        $names = array_filter(['first_name' => $order->first_name, 'last_name' => $order->last_name], fn ($v) => filled($v));

        if ($current && $current->phone === $order->phone) {
            $current->fill($names)->save();

            return;
        }

        $target = Customer::query()->firstOrNew(['phone' => $order->phone]);
        $target->fill($names + ['first_name' => $target->first_name ?? 'Client', 'last_name' => $target->last_name ?? 'Boutique'])->save();

        $loyalty = app(LoyaltyService::class);
        if ($current) {
            $this->counters($current, $order, -1);
            $loyalty->forgetOrder($order);
        }
        $this->counters($target, $order, 1);
        $order->forceFill(['customer_id' => $target->id])->save();

        if (in_array($order->status, OrderStatus::revenueStatuses(), true)) {
            $loyalty->record($order->refresh());
        }
    }

    private function counters(Customer $customer, Order $order, int $sign): void
    {
        $columns = ['orders_count'];
        $status = match ($order->status) {
            OrderStatus::Livree => 'delivered_count',
            OrderStatus::Annulee => 'cancelled_count',
            OrderStatus::Retournee => 'returned_count',
            default => null,
        };
        $status && $columns[] = $status;

        foreach ($columns as $column) {
            $sign > 0 ? $customer->increment($column) : $customer->newQuery()->whereKey($customer->id)->where($column, '>', 0)->decrement($column);
        }
    }

    /** @param array<string, mixed> $data */
    private function clientFields(Order $order, array $data): array
    {
        $fields = array_intersect_key($data, array_flip([
            'first_name', 'last_name', 'wilaya_id', 'commune_id', 'address', 'delivery_mode', 'admin_note', 'awaiting_stock',
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
                // An existing line keeps the cost it was sold with; a new line takes today's.
                'unit_cost' => $kept ? $kept->unit_cost : $variant->unitCost(),
                'quantity' => $quantity,
                'line_total' => $unitPrice * $quantity,
            ]);
        }
    }
}
