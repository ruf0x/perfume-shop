<?php

namespace App\Services;

use App\Enums\OrderStatus;
use App\Enums\StockMovementType;
use App\Exceptions\InvalidTransitionException;
use App\Exceptions\ShopException;
use App\Models\Customer;
use App\Models\Order;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * The only place that changes an order's status. Implements the state machine of
 * PLAN.md §3.3 and keeps stock, timestamps, history and customer counters in step.
 */
class OrderWorkflow
{
    /** Action name => resulting status. `no_answer` is handled separately (status unchanged). */
    private const TARGETS = [
        'confirm' => OrderStatus::Confirmee,
        'cancel' => OrderStatus::Annulee,
        'ship' => OrderStatus::EnLivraison,
        'deliver' => OrderStatus::Livree,
        'return' => OrderStatus::Retournee,
        'sell_in_store' => OrderStatus::VendueBoutique,
        'reopen' => OrderStatus::EnAttente,
    ];

    public function __construct(private StockService $stock) {}

    /**
     * @param  array{note?: ?string, reason?: ?string, delivery_company?: ?string, tracking_number?: ?string, restock?: bool}  $data
     *
     * @throws InvalidTransitionException
     * @throws \App\Exceptions\InsufficientStockException
     */
    public function transition(Order $order, string $action, ?User $user = null, array $data = []): Order
    {
        return DB::transaction(function () use ($order, $action, $user, $data) {
            // Re-read under lock: two admins clicking at once must not both succeed.
            $order = Order::query()->lockForUpdate()->findOrFail($order->id);
            $from = $order->status;

            if ($action === 'no_answer') {
                return $this->noAnswer($order, $user, $data['note'] ?? null);
            }

            $to = self::TARGETS[$action] ?? throw new ShopException("Action inconnue : {$action}.");
            if (! $from->canTransitionTo($to)) {
                throw new InvalidTransitionException($from, $action);
            }

            $note = $data['note'] ?? null;
            $changes = ['status' => $to];

            switch ($action) {
                case 'confirm':
                    $this->stock->deductForOrder($order, $user);
                    $changes['confirmed_at'] = now();
                    break;

                case 'cancel':
                    // Stock is only restored if it had been taken (i.e. the order was confirmed).
                    $this->stock->restoreForOrder($order, StockMovementType::Annulation, $user);
                    $changes['cancelled_at'] = now();
                    $changes['cancel_reason'] = $data['reason'] ?? null;
                    $note ??= $data['reason'] ?? null;
                    break;

                case 'ship':
                    $changes['shipped_at'] = now();
                    $changes['delivery_company'] = $data['delivery_company'] ?? null;
                    $changes['tracking_number'] = $data['tracking_number'] ?? null;
                    break;

                case 'deliver':
                    $changes['delivered_at'] = now();
                    $changes['completed_at'] = now();
                    break;

                case 'return':
                    $changes['returned_at'] = now();
                    if ($data['restock'] ?? false) {
                        $this->stock->restoreForOrder($order, StockMovementType::Retour, $user);
                        $note ??= 'Remis en stock';
                    } else {
                        // Poured decants usually can't be resold: the sale movements stay as the loss.
                        $note ??= 'Non remis en stock';
                    }
                    break;

                case 'sell_in_store':
                    $changes['completed_at'] = now();
                    break;

                case 'reopen':
                    // Back to pending, as if never confirmed: the stock was already put back when it was
                    // cancelled, and confirming it again takes the stock out again.
                    $changes += ['cancelled_at' => null, 'cancel_reason' => null, 'confirmed_at' => null];
                    $note ??= 'Commande rouverte';
                    if ($order->customer_id) {
                        Customer::query()->whereKey($order->customer_id)->where('cancelled_count', '>', 0)->decrement('cancelled_count');
                    }
                    break;
            }

            $order->forceFill($changes)->save();
            $this->logHistory($order, $from, $to, $user, $note);
            $this->updateCustomerCounters($order, $to);

            if (in_array($action, ['deliver', 'sell_in_store'], true)) {
                app(LoyaltyService::class)->record($order);
            }

            return $order->refresh();
        });
    }

    private function noAnswer(Order $order, ?User $user, ?string $note): Order
    {
        if ($order->status !== OrderStatus::EnAttente) {
            throw new InvalidTransitionException($order->status, 'no_answer');
        }

        $order->increment('call_attempts');
        $this->logHistory($order, $order->status, $order->status, $user, $note ?? "Ne répond pas (tentative {$order->call_attempts})");

        return $order->refresh();
    }

    private function logHistory(Order $order, OrderStatus $from, OrderStatus $to, ?User $user, ?string $note): void
    {
        $order->history()->create([
            'from_status' => $from,
            'to_status' => $to,
            'user_id' => $user?->id,
            'note' => $note,
        ]);
    }

    private function updateCustomerCounters(Order $order, OrderStatus $to): void
    {
        $column = match ($to) {
            OrderStatus::Livree => 'delivered_count',
            OrderStatus::Annulee => 'cancelled_count',
            OrderStatus::Retournee => 'returned_count',
            default => null,
        };

        if ($column && $order->customer_id) {
            Customer::query()->whereKey($order->customer_id)->increment($column);
        }
    }
}
