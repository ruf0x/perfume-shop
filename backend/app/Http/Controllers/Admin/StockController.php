<?php

namespace App\Http\Controllers\Admin;

use App\Enums\StockMode;
use App\Enums\StockMovementType;
use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\StockMovement;
use App\Services\StockService;
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

        $rows = Product::query()->stocked()->with('productType:id,name')
            ->withExists(['variants as has_pool' => fn ($q) => $q->where('stock_mode', StockMode::Pool)->where('is_active', true)])
            ->when($v['kind'] ?? null, fn ($q, $kind) => $q->where('kind', $kind))
            ->when($v['product_type_id'] ?? null, fn ($q, $id) => $q->where('product_type_id', $id))
            ->when($v['type_id'] ?? null, fn ($q, $id) => $q->where('perfume_type_id', $id))
            ->with(['brand:id,name', 'variants' => fn ($q) => $q->where('stock_mode', StockMode::Unit)->where('is_active', true)])
            ->when($v['q'] ?? null, fn ($q, $term) => $q->where('name', 'like', "%{$term}%"))
            ->orderBy('name')->get()
            ->map(fn (Product $p) => $this->row($p))
            ->when($v['status'] ?? null, fn ($rows, $status) => $rows->where('status', $status))
            ->values();

        return response()->json(['data' => $rows, 'low_stock_threshold_ml' => settings()->lowStockThresholdMl(), 'low_stock_threshold_qty' => settings()->lowStockThresholdQty()]);
    }

    /** The movement ledger (entries, sales, cancellations, losses...), newest first. */
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
            'type' => ['required', 'in:ajustement,perte'],
            'ml_change' => ['nullable', 'integer'],
            'qty_change' => ['nullable', 'integer'],
            'note' => ['required', 'string', 'max:255'],
        ]);

        $product = Product::findOrFail($v['product_id']);
        $this->stock->adjust($product, $this->variant($v), StockMovementType::from($v['type']), (int) ($v['ml_change'] ?? 0), (int) ($v['qty_change'] ?? 0), $v['note'], $request->user());

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
    private function row(Product $p): array
    {
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
            'status' => $this->stock->stockStatus($p),
        ];
    }
}
