<?php

namespace App\Http\Controllers\Admin;

use App\Enums\StockMode;
use Illuminate\Support\Facades\DB;
use App\Enums\StockMovementType;
use App\Http\Controllers\Controller;
use App\Models\OpenBottle;
use App\Models\Product;
use Illuminate\Support\Collection;
use App\Models\ProductVariant;
use App\Models\StockMovement;
use App\Services\StockService;
use App\Services\StockSummary;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class StockController extends Controller
{
    public function __construct(private StockService $stock) {}

    /**
     * Stock per product, in any product type: millilitres in the pool and units (sealed bottles, pieces).
     *
     * `status` is `ok` (sold in the shop), `low` (below the low-stock threshold) or `out`.
     * Filters: `q`, `status`, `product_type_id` (Parfums, Montres...), `type_id` (a family or category), `kind` (`perfume` or `standard`).
     */
    public function index(Request $request): JsonResponse
    {
        $v = $request->validate(['q' => ['nullable', 'string', 'max:100'], 'status' => ['nullable', 'in:ok,low,out'], 'kind' => ['nullable', 'in:perfume,standard'], 'product_type_id' => ['nullable', 'integer'], 'type_id' => ['nullable', 'integer']]);

        $products = Product::query()->stocked()->with('productType:id,name')
            ->withExists(['variants as has_pool' => fn ($q) => $q->where('stock_mode', StockMode::Pool)->where('is_active', true)])
            ->when($v['kind'] ?? null, fn ($q, $kind) => $q->where('kind', $kind))
            ->when($v['product_type_id'] ?? null, fn ($q, $id) => $q->where('product_type_id', $id))
            ->when($v['type_id'] ?? null, fn ($q, $id) => $q->where('perfume_type_id', $id))
            ->with(['brand:id,name', 'variants' => fn ($q) => $q->where('stock_mode', StockMode::Unit)->where('is_active', true)])
            ->when($v['q'] ?? null, fn ($q, $term) => $q->where('name', 'like', "%{$term}%"))
            ->orderBy('name')->get();
        $bottles = OpenBottle::query()->whereIn('product_id', $products->pluck('id'))->where('remaining_ml', '>', 0)
            ->orderByDesc('opened_at')->orderByDesc('id')->get()->groupBy('product_id');
        $rows = $products
            ->map(fn (Product $p) => $this->row($p, $bottles->get($p->id, collect())))
            ->when($v['status'] ?? null, fn ($rows, $status) => $rows->where('status', $status))
            ->values();

        return response()->json(['data' => $rows, 'low_stock_threshold_ml' => settings()->lowStockThresholdMl(), 'low_stock_threshold_qty' => settings()->lowStockThresholdQty()]);
    }

    /** The movement ledger (entries, sales, cancellations, losses...), newest first. */
    /** Where one product's stock went: received, opened, sold, lost, corrected and left (per size). */
    public function summary(Product $product, StockSummary $summary): JsonResponse
    {
        return response()->json(['data' => $summary->for($product)]);
    }

    public function movements(Request $request): JsonResponse
    {
        $v = $request->validate([
            'product_id' => ['nullable', 'integer'],
            'variant_id' => ['nullable', 'integer'],
            'order_id' => ['nullable', 'integer'],
            'type' => ['nullable', Rule::enum(StockMovementType::class)],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:200'],
        ]);

        $page = StockMovement::query()
            ->with(['product:id,name', 'variant:id,label', 'user:id,name', 'order:id,reference'])
            ->when($v['product_id'] ?? null, fn ($q, $id) => $q->where('product_id', $id))
            ->when($v['variant_id'] ?? null, fn ($q, $id) => $q->where('variant_id', $id))
            ->when($v['order_id'] ?? null, fn ($q, $id) => $q->where('order_id', $id))
            ->when($v['type'] ?? null, fn ($q, $type) => $q->where('type', $type))
            ->when($v['from'] ?? null, fn ($q, $d) => $q->where('created_at', '>=', \Illuminate\Support\Carbon::parse($d)->startOfDay()))
            ->when($v['to'] ?? null, fn ($q, $d) => $q->where('created_at', '<=', \Illuminate\Support\Carbon::parse($d)->endOfDay()))
            ->orderByDesc('id')->paginate($v['per_page'] ?? 50)->withQueryString();

        return response()->json([
            'data' => $page->getCollection()->map(fn (StockMovement $m) => [
                'id' => $m->id,
                'type' => $m->type,
                'product' => ['id' => $m->product_id, 'name' => $m->product?->name],
                'variant' => $m->variant ? ['id' => $m->variant->id, 'label' => $m->variant->label] : null,
                'ml_change' => $m->ml_change,
                'qty_change' => $m->qty_change,
                'unit_cost' => $m->unit_cost,
                'order' => $m->order ? ['id' => $m->order->id, 'reference' => $m->order->reference] : null,
                'user' => $m->user?->name,
                'note' => $m->note,
                'created_at' => $m->created_at,
                'cancelled' => $m->cancelled_at !== null,
                'editable' => $m->order_id === null && $m->cancelled_at === null && in_array($m->type, [StockMovementType::Entree, StockMovementType::Perte, StockMovementType::Ajustement], true),
            ])->values(),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'per_page' => $page->perPage(), 'total' => $page->total()],
        ]);
    }

    /**
     * Receive stock. Send `ml` to add to the decant pool (2 bottles of 100 ml = `ml: 200`),
     * and/or `qty` with a `variant_id` of a counted (`unit`) variant: sealed bottles, a watch, a shade...
     */
    public function entry(Request $request): JsonResponse
    {
        $v = $request->validate([
            'product_id' => ['required', 'integer', 'exists:products,id'],
            'variant_id' => ['nullable', 'integer', 'exists:product_variants,id'],
            'ml' => ['nullable', 'integer', 'min:0', 'max:1000000'],
            'qty' => ['nullable', 'integer', 'min:0', 'max:10000'],
            /** Purchase cost (DZD) of this delivery, for margins later. */
            'unit_cost' => ['nullable', 'integer', 'min:0'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $product = Product::findOrFail($v['product_id']);
        $this->stock->addEntry($product, $this->variant($v), (int) ($v['ml'] ?? 0), (int) ($v['qty'] ?? 0), $v['unit_cost'] ?? null, $v['note'] ?? null, $request->user());

        return response()->json(['data' => $this->row($this->reload($product))], 201);
    }

    /**
     * Correct the stock or declare a loss (spill, tester, expired...). Values are signed;
     * the stock can never go below zero.
     */
    public function adjustment(Request $request): JsonResponse
    {
        $v = $request->validate([
            'product_id' => ['required', 'integer', 'exists:products,id'],
            'variant_id' => ['nullable', 'integer', 'exists:product_variants,id'],
            /** A loss taken from one opened bottle (the newest one when left out). */
            'open_bottle_id' => ['nullable', 'integer', 'exists:open_bottles,id'],
            'type' => ['required', 'in:ajustement,perte'],
            'ml_change' => ['nullable', 'integer'],
            'qty_change' => ['nullable', 'integer'],
            'note' => ['required', 'string', 'max:255'],
        ]);

        $product = Product::findOrFail($v['product_id']);
        $this->stock->adjust($product, $this->variant($v), StockMovementType::from($v['type']), (int) ($v['ml_change'] ?? 0), (int) ($v['qty_change'] ?? 0), $v['note'], $request->user(), $v['open_bottle_id'] ?? null);

        return response()->json(['data' => $this->row($this->reload($product))], 201);
    }

    /** Open one sealed bottle: -1 bottle, +its millilitres in the decant pool. */
    public function openBottle(Request $request): JsonResponse
    {
        $v = $request->validate(['variant_id' => ['required', 'integer', 'exists:product_variants,id']]);

        $variant = ProductVariant::findOrFail($v['variant_id']);
        $this->stock->openBottle($variant, $request->user());

        return response()->json(['data' => $this->row($this->reload($variant->product))]);
    }

    private function variant(array $v): ?ProductVariant
    {
        return isset($v['variant_id']) ? ProductVariant::findOrFail($v['variant_id']) : null;
    }

    private function reload(Product $product): Product
    {
        return $product->fresh(['brand:id,name', 'productType:id,name', 'variants' => fn ($q) => $q->where('stock_mode', StockMode::Unit)->where('is_active', true)])
            ->loadExists(['variants as has_pool' => fn ($q) => $q->where('stock_mode', StockMode::Pool)->where('is_active', true)]);
    }

    /** @return array<string, mixed> */
    private function row(Product $p, ?Collection $bottles = null): array
    {
        $bottles ??= OpenBottle::query()->where('product_id', $p->id)->where('remaining_ml', '>', 0)->orderByDesc('opened_at')->orderByDesc('id')->get();
        $sealed = $p->variants->map(fn (ProductVariant $v) => ['variant_id' => $v->id, 'label' => $v->label, 'ml' => $v->ml, 'stock_qty' => $v->stock_qty])->values();

        return [
            'product_id' => $p->id,
            'kind' => $p->kind,
            'product_type' => $p->productType ? ['id' => $p->productType->id, 'name' => $p->productType->name] : null,
            'name' => $p->name,
            'brand' => $p->brand?->name,
            'image' => media_url($p->main_image),
            'is_active' => $p->is_active,
            'stock_ml' => $p->stock_ml,
            /** Whether some option is sold by the millilitre (so the ml stock means something). */
            'has_pool' => (bool) $p->has_pool,
            'sealed' => $sealed,
            'open_bottles' => $bottles->map(fn (OpenBottle $b) => StockSummary::bottle($b))->values(),
            'bulk_ml' => max(0, (int) $p->stock_ml - (int) $bottles->sum('remaining_ml')),
            'status' => $this->stock->stockStatus($p),
        ];
    }

    /**
     * Correct a hand-made movement: it is cancelled (kept, marked) and written again with the new quantity.
     * `quantity` is the amount in its own unit (ml for a pool movement, bottles for a sealed one), always positive.
     */
    public function updateMovement(Request $request, StockMovement $movement): JsonResponse
    {
        $v = $request->validate([
            'quantity' => ['required', 'integer', 'min:1', 'max:100000'],
            'note' => ['required', 'string', 'max:255'],
        ]);
        $user = $request->user();
        $isMl = (int) $movement->ml_change !== 0;
        $sign = match ($movement->type) {
            StockMovementType::Perte => -1,
            StockMovementType::Entree => 1,
            default => (($movement->ml_change ?: $movement->qty_change) < 0 ? -1 : 1),
        };
        $amount = $v['quantity'] * $sign;

        DB::transaction(function () use ($movement, $v, $user, $isMl, $amount) {
            $type = $movement->type;
            $product = Product::findOrFail($movement->product_id);
            $variant = $movement->variant_id ? ProductVariant::find($movement->variant_id) : null;
            $openBottleId = $movement->open_bottle_id;

            $this->stock->cancelMovement($movement, $user);

            if ($type === StockMovementType::Entree) {
                $this->stock->addEntry($product, $variant, ml: $isMl ? $v['quantity'] : 0, qty: $isMl ? 0 : $v['quantity'], note: $v['note'], user: $user);
            } else {
                $this->stock->adjust($product, $variant, $type, mlChange: $isMl ? $amount : 0, qtyChange: $isMl ? 0 : $amount, note: $v['note'], user: $user, openBottleId: $openBottleId);
            }
        });

        return response()->json(['data' => ['id' => $movement->id, 'cancelled' => true]]);
    }

    /** Delete a hand-made movement: it is cancelled and its effect reversed (the row is kept for the history). */
    public function destroyMovement(Request $request, StockMovement $movement): JsonResponse
    {
        $this->stock->cancelMovement($movement, $request->user());

        return response()->json(null, 204);
    }

    /** Remove an opened bottle that was opened by mistake (nothing decanted from it yet). */
    public function discardBottle(Request $request, OpenBottle $bottle): JsonResponse
    {
        $this->stock->discardOpenBottle($bottle, $request->user());

        return response()->json(null, 204);
    }
}
