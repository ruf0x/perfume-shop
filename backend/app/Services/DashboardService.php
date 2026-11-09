<?php

namespace App\Services;

use App\Enums\OrderChannel;
use App\Enums\OrderStatus;
use App\Enums\StockMode;
use App\Models\Order;
use App\Models\Product;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class DashboardService
{
    /**
     * KPIs for a date range. Revenue counts delivered + sold-in-shop orders, dated by their
     * completion; order counts are dated by creation.
     *
     * @return array<string, mixed>
     */
    public function summary(Carbon $from, Carbon $to): array
    {
        $start = $from->copy()->startOfDay();
        $end = $to->copy()->endOfDay();
        $revenueStatuses = array_map(fn (OrderStatus $s) => $s->value, OrderStatus::revenueStatuses());

        $revenue = fn () => Order::query()->whereIn('status', $revenueStatuses)->whereBetween('completed_at', [$start, $end]);

        $created = Order::query()->whereBetween('created_at', [$start, $end]);
        $online = (clone $created)->where('channel', OrderChannel::Online);
        $onlineCount = (clone $online)->count();
        $cancelled = (clone $online)->where('status', OrderStatus::Annulee)->count();

        return [
            'range' => ['from' => $start->toDateString(), 'to' => $end->toDateString()],
            'orders_count' => (clone $created)->count(),
            'online_orders_count' => $onlineCount,
            'pos_orders_count' => (clone $created)->where('channel', OrderChannel::Pos)->count(),
            'revenue' => (int) $revenue()->sum('total'),
            'revenue_online' => (int) $revenue()->where('channel', OrderChannel::Online)->sum('total'),
            'revenue_pos' => (int) $revenue()->where('channel', OrderChannel::Pos)->sum('total'),
            // Not limited to the range: these are the things waiting for the owner right now.
            'pending_count' => Order::query()->where('status', OrderStatus::EnAttente)->count(),
            'in_delivery_count' => Order::query()->where('status', OrderStatus::EnLivraison)->count(),
            /** Cancelled share of the online orders created in the range, in percent. */
            'cancel_rate' => $onlineCount > 0 ? round($cancelled / $onlineCount * 100, 1) : 0,
            'profit' => $this->profit($start, $end, $revenueStatuses),
            'sales_by_day' => $this->salesByDay($start, $end, $revenueStatuses),
            'top_products' => $this->topProducts($start, $end, $revenueStatuses),
            'low_stock' => $this->lowStock(),
        ];
    }

    /**
     * Profit of the sales in the range: what the items sold for minus what they cost, minus the order discounts
     * (the delivery fee is not income). Only orders whose every item has a known cost are counted, so that a
     * missing purchase price never looks like a free product; `orders_without_cost` says how many were left out.
     *
     * @return array{amount: int, cost: int, revenue: int, percent: ?float, orders_counted: int, orders_without_cost: int}
     */
    private function profit(Carbon $start, Carbon $end, array $statuses): array
    {
        $rows = DB::table('orders')
            ->join('order_items', 'order_items.order_id', '=', 'orders.id')
            ->whereIn('orders.status', $statuses)->whereBetween('orders.completed_at', [$start, $end])
            ->groupBy('orders.id', 'orders.discount')
            ->selectRaw('orders.discount as discount, SUM(order_items.line_total) as items_total, COUNT(*) as items, COUNT(order_items.unit_cost) as costed, SUM(order_items.unit_cost * order_items.quantity) as cost')
            ->get();

        $revenue = $cost = $counted = $missing = 0;
        foreach ($rows as $row) {
            if ((int) $row->costed < (int) $row->items) {
                $missing++;

                continue;
            }
            $counted++;
            $revenue += (int) $row->items_total - (int) $row->discount;
            $cost += (int) $row->cost;
        }

        return [
            'amount' => $revenue - $cost,
            'cost' => $cost,
            'revenue' => $revenue,
            // Profit as a share of the purchase cost (a 20 % gain means selling at cost + 20 %).
            'percent' => $cost > 0 ? round(($revenue - $cost) / $cost * 100, 1) : null,
            'orders_counted' => $counted,
            'orders_without_cost' => $missing,
        ];
    }

    /** @return list<array{date: string, revenue: int, revenue_online: int, revenue_pos: int, orders: int}> */
    private function salesByDay(Carbon $start, Carbon $end, array $statuses): array
    {
        $rows = Order::query()
            ->whereIn('status', $statuses)->whereBetween('completed_at', [$start, $end])
            ->selectRaw(
                'DATE(completed_at) as day, SUM(total) as revenue, COUNT(*) as orders,'
                .' SUM(CASE WHEN channel = ? THEN total ELSE 0 END) as revenue_online,'
                .' SUM(CASE WHEN channel = ? THEN total ELSE 0 END) as revenue_pos',
                [OrderChannel::Online->value, OrderChannel::Pos->value],
            )
            ->groupBy('day')->get()->keyBy('day');

        $series = [];
        for ($day = $start->copy(); $day->lte($end); $day->addDay()) {
            $row = $rows->get($day->toDateString());
            $series[] = [
                'date' => $day->toDateString(),
                'revenue' => (int) ($row->revenue ?? 0),
                'revenue_online' => (int) ($row->revenue_online ?? 0),
                'revenue_pos' => (int) ($row->revenue_pos ?? 0),
                'orders' => (int) ($row->orders ?? 0),
            ];
        }

        return $series;
    }

    /**
     * Every size sold in the range, best sellers first. `profit` is what it earned over its purchase price,
     * null when some of the sold units had no purchase price entered.
     *
     * @return list<array{product: string, variant: string, quantity: int, revenue: int, profit: ?int}>
     */
    private function topProducts(Carbon $start, Carbon $end, array $statuses): array
    {
        return DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->whereIn('orders.status', $statuses)->whereBetween('orders.completed_at', [$start, $end])
            ->groupBy('order_items.product_name', 'order_items.variant_label')
            ->selectRaw('order_items.product_name as product, order_items.variant_label as variant, SUM(order_items.quantity) as quantity, SUM(order_items.line_total) as revenue, COUNT(*) as line_count, COUNT(order_items.unit_cost) as costed, SUM(order_items.unit_cost * order_items.quantity) as cost')
            ->orderByDesc('quantity')->orderByDesc('revenue')->get()
            ->map(fn ($r) => [
                'product' => $r->product,
                'variant' => $r->variant,
                'quantity' => (int) $r->quantity,
                'revenue' => (int) $r->revenue,
                'profit' => (int) $r->costed === (int) $r->line_count ? (int) $r->revenue - (int) $r->cost : null,
            ])
            ->all();
    }

    /** Active perfumes and cosmetics running low. @return list<array{id: int, name: string, stock_ml: int, units: int}> */
    private function lowStock(): array
    {
        return Product::query()->active()
            ->lowStock(settings()->lowStockThresholdMl(), settings()->lowStockThresholdQty())
            ->withSum(['variants as units' => fn ($q) => $q->where('stock_mode', StockMode::Unit)->where('is_active', true)], 'stock_qty')
            ->orderBy('stock_ml')->orderBy('name')->limit(20)->get()
            ->map(fn (Product $p) => ['id' => $p->id, 'name' => $p->name, 'kind' => $p->kind, 'stock_ml' => $p->stock_ml, 'units' => (int) $p->units])
            ->all();
    }
}
