<?php

namespace App\Services;

use App\Enums\OrderStatus;
use App\Enums\StockMovementType;
use App\Exceptions\ShopException;
use App\Models\Customer;
use App\Models\LoyaltyReward;
use App\Models\Order;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Deletes an order made by mistake. Only orders that no goods left with: pending, cancelled, returned, or a caisse
 * sale (its stock and bottles are put back). A confirmed, shipped or delivered order must be cancelled first, so
 * the stock is never guessed. The customer's counters and loyalty perfumes are taken back, and a gift that was
 * given with this order becomes available again. The stock and bottle ledgers keep their rows (without the order).
 */
class OrderDeleter
{
    public function __construct(private StockService $stock, private LoyaltyService $loyalty) {}

    public function delete(Order $order, ?User $user = null): void
    {
        DB::transaction(function () use ($order, $user) {
            $order = Order::query()->lockForUpdate()->findOrFail($order->id);

            if (! in_array($order->status, [OrderStatus::EnAttente, OrderStatus::Annulee, OrderStatus::Retournee, OrderStatus::VendueBoutique], true)) {
                throw new ShopException('Une commande confirmée, expédiée ou livrée ne peut pas être supprimée : annulez-la d\'abord.');
            }

            // A caisse sale took its stock the moment it was made: put it back. The others never hold stock any more.
            if ($order->status === OrderStatus::VendueBoutique) {
                $this->stock->restoreForOrder($order, StockMovementType::Annulation, $user);
            }

            if ($order->customer_id && ($customer = Customer::query()->find($order->customer_id))) {
                $columns = ['orders_count', match ($order->status) {
                    OrderStatus::Annulee => 'cancelled_count',
                    OrderStatus::Retournee => 'returned_count',
                    default => null,
                }];
                foreach (array_filter($columns) as $column) {
                    $customer->newQuery()->whereKey($customer->id)->where($column, '>', 0)->decrement($column);
                }
            }

            $this->loyalty->forgetOrder($order);
            LoyaltyReward::query()->where('gift_order_id', $order->id)->update(['given_at' => null, 'gift_variant_id' => null, 'gift_name' => null, 'gift_value' => null, 'gift_order_id' => null, 'given_by' => null]);

            $order->delete();
        });
    }
}
