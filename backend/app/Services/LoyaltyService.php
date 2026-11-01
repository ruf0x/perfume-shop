<?php

namespace App\Services;

use App\Enums\ProductKind;
use App\Enums\StockMode;
use App\Exceptions\ShopException;
use App\Models\Customer;
use App\Models\LoyaltyEntry;
use App\Models\LoyaltyReward;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * "Buy N perfumes, the next one is a gift" (N = config('features.loyalty_every'), null = off).
 *
 * Every perfume of a completed order (delivered or sold in the shop), whatever its size, counts for one: the counting
 * follows the customer (their phone number) over any number of orders. Each full batch of N earns a reward whose
 * suggested value is the average price of those N perfumes; the owner then gives a flacon of his choice (it may be
 * worth more than the suggestion). The gift is a zero-price sale in the caisse, so its stock and cost are recorded.
 */
class LoyaltyService
{
    public function every(): ?int
    {
        $n = config('features.loyalty_every');

        return $n ? (int) $n : null;
    }

    public function enabled(): bool
    {
        return $this->every() !== null;
    }

    /** Count the perfumes of a completed order for its customer, and grant the gifts that are now earned. */
    public function record(Order $order): void
    {
        if (! $this->enabled() || ! $order->customer_id || LoyaltyEntry::query()->where('order_id', $order->id)->exists()) {
            return;
        }

        $order->loadMissing('items');
        $perfumeIds = Product::withTrashed()->whereIn('id', $order->items->pluck('product_id')->filter())->where('kind', ProductKind::Perfume)->pluck('id')->all();

        DB::transaction(function () use ($order, $perfumeIds) {
            foreach ($order->items as $item) {
                // A zero-price line is a gift: it never counts.
                if (! in_array($item->product_id, $perfumeIds, true) || $item->unit_price <= 0) {
                    continue;
                }
                for ($i = 0; $i < $item->quantity; $i++) {
                    LoyaltyEntry::create(['customer_id' => $order->customer_id, 'order_id' => $order->id, 'product_name' => $item->product_name, 'unit_price' => $item->unit_price]);
                }
            }
            $this->grant($order->customer_id);
        });
    }

    /**
     * Take an order's perfumes off its customer's count (the order was attached to another customer). A gift that
     * these perfumes had earned and that was not given yet is cancelled and the rest of its batch is counted again;
     * a gift already handed over stays given.
     */
    public function forgetOrder(Order $order): void
    {
        $entries = LoyaltyEntry::query()->where('order_id', $order->id)->get();
        if ($entries->isEmpty()) {
            return;
        }

        DB::transaction(function () use ($order, $entries) {
            $customerId = $entries->first()->customer_id;
            $rewardIds = $entries->pluck('reward_id')->filter()->unique();

            LoyaltyEntry::query()->where('order_id', $order->id)->delete();
            foreach (LoyaltyReward::query()->whereIn('id', $rewardIds)->whereNull('given_at')->get() as $reward) {
                LoyaltyEntry::query()->where('reward_id', $reward->id)->update(['reward_id' => null]);
                $reward->delete();
            }
            $this->grant($customerId);
        });
    }

    /** Turn every full batch of N uncounted perfumes into a reward. */
    private function grant(int $customerId): void
    {
        $n = $this->every();
        Customer::query()->lockForUpdate()->find($customerId);
        $entries = LoyaltyEntry::query()->where('customer_id', $customerId)->whereNull('reward_id')->orderBy('id')->get();

        while ($entries->count() >= $n) {
            $batch = $entries->splice(0, $n);
            $reward = LoyaltyReward::create(['customer_id' => $customerId, 'items_count' => $n, 'average_price' => (int) round($batch->avg('unit_price'))]);
            LoyaltyEntry::query()->whereIn('id', $batch->pluck('id'))->update(['reward_id' => $reward->id]);
        }
    }

    /**
     * Where a customer stands. `counted` = perfumes toward the next gift (0 to N-1), `pending` = gifts earned and not
     * given yet (oldest first), `given` = gifts handed over, `total` = perfumes bought since the start.
     *
     * @return array{every: int, counted: int, total: int, pending: list<array<string, mixed>>, given: int}|null
     */
    public function progress(Customer $customer): ?array
    {
        if (! $this->enabled()) {
            return null;
        }

        $rewards = LoyaltyReward::query()->where('customer_id', $customer->id)->orderBy('id')->get();

        return [
            'every' => $this->every(),
            'counted' => LoyaltyEntry::query()->where('customer_id', $customer->id)->whereNull('reward_id')->count(),
            'total' => LoyaltyEntry::query()->where('customer_id', $customer->id)->count(),
            'pending' => $rewards->whereNull('given_at')->map(fn (LoyaltyReward $r) => ['id' => $r->id, 'average_price' => $r->average_price, 'earned_at' => $r->created_at])->values()->all(),
            'given' => $rewards->whereNotNull('given_at')->count(),
        ];
    }

    /** The gifts already handed over, newest first. */
    public function history(Customer $customer): array
    {
        return LoyaltyReward::query()->where('customer_id', $customer->id)->whereNotNull('given_at')->orderByDesc('given_at')->get()
            ->map(fn (LoyaltyReward $r) => ['id' => $r->id, 'average_price' => $r->average_price, 'gift_name' => $r->gift_name, 'gift_value' => $r->gift_value, 'given_at' => $r->given_at])->all();
    }

    /** How many perfumes (at a real price) an order holds: what it would add to the count once completed. */
    public function perfumeUnits(Order $order): int
    {
        $order->loadMissing('items');
        $ids = Product::withTrashed()->whereIn('id', $order->items->pluck('product_id')->filter())->where('kind', ProductKind::Perfume)->pluck('id')->all();

        return (int) $order->items->filter(fn ($i) => in_array($i->product_id, $ids, true) && $i->unit_price > 0)->sum('quantity');
    }

    /**
     * Hand over the oldest pending gift: a sealed flacon of the owner's choice, sold at 0 DA in the caisse
     * (stock is taken, its cost is recorded). The reward is marked as given.
     */
    public function redeem(Customer $customer, ProductVariant $gift, ?User $user): LoyaltyReward
    {
        if (! $this->enabled()) {
            throw new ShopException("Le programme de fidélité n'est pas activé.");
        }
        $gift->loadMissing('product');
        if ($gift->product?->kind !== ProductKind::Perfume || $gift->stock_mode !== StockMode::Unit) {
            throw new ShopException('Le cadeau doit être un flacon de parfum.');
        }

        return DB::transaction(function () use ($customer, $gift, $user) {
            $reward = LoyaltyReward::query()->where('customer_id', $customer->id)->whereNull('given_at')->orderBy('id')->lockForUpdate()->first()
                ?? throw new ShopException("Ce client n'a pas de cadeau disponible.");

            $order = app(OrderPlacement::class)->placePos([
                'lines' => [['variant_id' => $gift->id, 'quantity' => 1, 'unit_price' => 0]],
                'payment_method' => 'especes',
                'amount_received' => 0,
                'phone' => $customer->phone,
                'first_name' => $customer->first_name,
                'last_name' => $customer->last_name,
            ], $user ?? throw new ShopException('Utilisateur requis.'));

            $order->update(['admin_note' => "Cadeau fidélité ({$reward->items_count} parfums achetés, valeur conseillée {$reward->average_price} DA)"]);
            $reward->update([
                'given_at' => now(),
                'gift_variant_id' => $gift->id,
                'gift_name' => "{$gift->product->name} ({$gift->label})",
                'gift_value' => $gift->price,
                'gift_order_id' => $order->id,
                'given_by' => $user->id,
            ]);

            return $reward->refresh();
        });
    }
}
