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
            'sales_by_day' => $this->salesByDay($start, $end, $revenueStatuses),
            'top_products' => $this->topProducts($start, $end, $revenueStatuses),
            'low_stock' => $this->lowStock(),
        ];
    }

    /** @return list<array{date: string, revenue: int, orders: int}> */
    private function salesByDay(Carbon $start, Carbon $end, array $statuses): array
    {
        $rows = Order::query()
            ->whereIn('status', $statuses)->whereBetween('completed_at', [$start, $end])
            ->selectRaw('DATE(completed_at) as day, SUM(total) as revenue, COUNT(*) as orders')
            ->groupBy('day')->get()->keyBy('day');

        $series = [];
        for ($day = $start->copy(); $day->lte($end); $day->addDay()) {
            $row = $rows->get($day->toDateString());
            $series[] = ['date' => $day->toDateString(), 'revenue' => (int) ($row->revenue ?? 0), 'orders' => (int) ($row->orders ?? 0)];
        }

        return $series;
    }

    /** @return list<array{product: string, variant: string, quantity: int, revenue: int}> */
    private function topProducts(Carbon $start, Carbon $end, array $statuses): array
    {
        return DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->whereIn('orders.status', $statuses)->whereBetween('orders.completed_at', [$start, $end])
            ->groupBy('order_items.product_name', 'order_items.variant_label')
            ->selectRaw('order_items.product_name as product, order_items.variant_label as variant, SUM(order_items.quantity) as quantity, SUM(order_items.line_total) as revenue')
            ->orderByDesc('quantity')->orderByDesc('revenue')->limit(10)->get()
            ->map(fn ($r) => ['product' => $r->product, 'variant' => $r->variant, 'quantity' => (int) $r->quantity, 'revenue' => (int) $r->revenue])
            ->all();
    }

    /** Active perfumes under the threshold with no sealed bottle left. @return list<array{id: int, name: string, stock_ml: int}> */
    private function lowStock(): array
    {
        return Product::query()->perfumes()->active()
            ->where('stock_ml', '<', settings()->lowStockThresholdMl())
            ->whereDoesntHave('variants', fn ($q) => $q->where('stock_mode', StockMode::Unit)->where('is_active', true)->where('stock_qty', '>', 0))
            ->orderBy('stock_ml')->limit(20)->get(['id', 'name', 'stock_ml'])
            ->map(fn (Product $p) => ['id' => $p->id, 'name' => $p->name, 'stock_ml' => $p->stock_ml])
            ->all();
    }
}
