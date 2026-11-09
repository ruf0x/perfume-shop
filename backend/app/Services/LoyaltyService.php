<?php

namespace App\Services;

use App\Enums\ProductKind;
use App\Enums\StockMode;
use App\Exceptions\ShopException;
use App\Models\Customer;
use App\Models\LoyaltyEntry;
use App\Models\LoyaltyReward;
use App\Models\Order;
use App\Models\PackItem;
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
    /** Whether the shop has the programme at all: a code switch, set when the shop is delivered (null = no loyalty). */
    public function available(): bool
    {
        return (bool) config('features.loyalty_every');
    }

    /** Perfumes bought for one gift, or null while the programme is not there or the owner switched it off in the settings. */
    public function every(): ?int
    {
        $n = config('features.loyalty_every');

        return $n && settings()->loyaltyEnabled() ? (int) $n : null;
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

        DB::transaction(function () use ($order) {
            foreach ($this->perfumes($order) as $perfume) {
                LoyaltyEntry::create(['customer_id' => $order->customer_id, 'order_id' => $order->id, 'product_name' => $perfume['name'], 'unit_price' => $perfume['price']]);
            }
            $this->grant($order->customer_id);
        });
    }

    /**
     * Every perfume an order holds, one entry per unit at the price it was sold for. A perfume inside a pack counts
     * too: it takes its share of the pack's price (in proportion to the catalogue prices of what the pack holds).
     * Zero-price lines (gifts) and everything that is not a perfume are left out.
     *
     * @return list<array{name: string, price: int}>
     */
    private function perfumes(Order $order): array
    {
        $order->loadMissing('items');
        $products = Product::withTrashed()->whereIn('id', $order->items->pluck('product_id')->filter())->get()->keyBy('id');
        $out = [];

        foreach ($order->items as $item) {
            if ($item->unit_price <= 0 || ! ($product = $products->get($item->product_id))) {
                continue;
            }

            if ($product->kind === ProductKind::Perfume) {
                for ($i = 0; $i < $item->quantity; $i++) {
                    $out[] = ['name' => $item->product_name, 'price' => $item->unit_price];
                }
            } elseif ($product->kind === ProductKind::Pack && $item->variant_id) {
                $parts = PackItem::query()->where('pack_variant_id', $item->variant_id)->with('component.product')->get();
                $listTotal = (int) $parts->sum(fn (PackItem $p) => $p->component->price * $p->quantity);
                if ($listTotal <= 0) {
                    continue;
                }
                foreach ($parts as $part) {
                    if ($part->component->product?->kind !== ProductKind::Perfume) {
                        continue;
                    }
                    for ($i = 0; $i < $part->quantity * $item->quantity; $i++) {
                        $out[] = ['name' => $part->component->product->name, 'price' => (int) round($part->component->price * $item->unit_price / $listTotal)];
                    }
                }
            }
        }

        return $out;
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

    /**
     * The perfumes of a customer, cut into rounds of N: 0 to 6, 6 to 12, 12 to 18… Each full round earned a gift whose
     * suggested value is that round's average; the last one is the round in progress (no average yet while empty).
     *
     * @return list<array<string, mixed>>
     */
    public function tiers(Customer $customer): array
    {
        $n = $this->every();
        if ($n === null) {
            return [];
        }

        $entries = LoyaltyEntry::query()
            ->leftJoin('orders', 'orders.id', '=', 'loyalty_entries.order_id')
            ->where('loyalty_entries.customer_id', $customer->id)
            ->orderBy('loyalty_entries.id')
            ->get(['loyalty_entries.*', 'orders.reference as order_reference', 'orders.completed_at as order_date'])
            ->groupBy(fn ($e) => $e->reward_id ?? 0);

        $perfumes = fn ($items) => $items->map(fn ($e) => ['name' => $e->product_name, 'price' => (int) $e->unit_price, 'order' => $e->order_reference, 'date' => $e->order_date])->values()->all();

        $tiers = [];
        foreach (LoyaltyReward::query()->where('customer_id', $customer->id)->orderBy('id')->get() as $i => $reward) {
            $tiers[] = [
                'number' => $i + 1,
                'from' => $i * $n,
                'to' => ($i + 1) * $n,
                'complete' => true,
                'average' => $reward->average_price,
                'perfumes' => $perfumes($entries->get($reward->id, collect())),
                'reward' => ['id' => $reward->id, 'status' => $reward->given_at ? 'given' : 'pending', 'gift_name' => $reward->gift_name, 'gift_value' => $reward->gift_value, 'given_at' => $reward->given_at],
            ];
        }

        $current = $entries->get(0, collect());
        $done = count($tiers);
        $tiers[] = [
            'number' => $done + 1,
            'from' => $done * $n,
            'to' => ($done + 1) * $n,
            'complete' => false,
            'average' => $current->isEmpty() ? null : (int) round($current->avg('unit_price')),
            'perfumes' => $perfumes($current),
            'reward' => null,
        ];

        return $tiers;
    }

    /**
     * Gifts worth about what the oldest pending round averaged: perfumes (a sealed flacon or a decant size) in stock whose
     * price is within a quarter of that average, the closest first. The owner may still pick anything else.
     *
     * @return array{average: int, from: int, to: int, items: list<array<string, mixed>>}|null
     */
    public function suggestions(Customer $customer): ?array
    {
        $reward = LoyaltyReward::query()->where('customer_id', $customer->id)->whereNull('given_at')->orderBy('id')->first();
        if (! $reward) {
            return null;
        }

        $avg = $reward->average_price;
        $from = (int) floor($avg * 0.75);
        $to = (int) ceil($avg * 1.25);
        $stock = app(StockService::class);

        $items = ProductVariant::query()->with('product:id,name,kind,is_active')
            ->where('is_active', true)->whereIn('stock_mode', [StockMode::Unit, StockMode::Pool])->whereBetween('price', [$from, $to])
            ->whereHas('product', fn ($q) => $q->where('kind', ProductKind::Perfume)->where('is_active', true))
            ->orderByRaw('ABS(CAST(price AS SIGNED) - ?)', [$avg])->limit(60)->get()
            ->filter(fn (ProductVariant $v) => $stock->maxQty($v) >= 1)
            ->take(12)
            ->map(fn (ProductVariant $v) => [
                'variant_id' => $v->id,
                'product' => $v->product->name,
                'label' => $v->label,
                'price' => $v->price,
                'kind' => $v->stock_mode === StockMode::Unit ? 'flacon' : 'ml',
                'gap' => $v->price - $avg,
            ])->values()->all();

        return ['average' => $avg, 'from' => $from, 'to' => $to, 'items' => $items];
    }

    /** How many perfumes (at a real price, packs included) an order holds: what it would add to the count once completed. */
    public function perfumeUnits(Order $order): int
    {
        return count($this->perfumes($order));
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
        if ($gift->product?->kind !== ProductKind::Perfume || ! in_array($gift->stock_mode, [StockMode::Unit, StockMode::Pool], true)) {
            throw new ShopException('Le cadeau doit être un parfum : un flacon ou une taille à décanter.');
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
