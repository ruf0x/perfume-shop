<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\SaveProductRequest;
use App\Http\Resources\AdminProductResource;
use App\Models\Product;
use App\Services\ProductService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

class ProductController extends Controller
{
    public function __construct(private ProductService $products) {}

    /**
     * Perfumes and packs, including hidden ones and stock quantities.
     *
     * Filters: `q` (name / brand), `kind`, `type_id`, `active`, `low_stock=1`.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $v = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'kind' => ['nullable', 'in:perfume,pack'],
            'type_id' => ['nullable', 'integer'],
            'active' => ['nullable', 'boolean'],
            'low_stock' => ['nullable', 'boolean'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $products = Product::query()
            ->with(['brand', 'type', 'variants.packItems.component.product'])
            ->when($v['q'] ?? null, fn ($q, $term) => $q->where(fn ($w) => $w
                ->where('name', 'like', "%{$term}%")
                ->orWhere('inspired_by', 'like', "%{$term}%")
                ->orWhereHas('brand', fn ($b) => $b->where('name', 'like', "%{$term}%"))))
            ->when($v['kind'] ?? null, fn ($q, $kind) => $q->where('kind', $kind))
            ->when($v['type_id'] ?? null, fn ($q, $id) => $q->where('perfume_type_id', $id))
            ->when(isset($v['active']), fn ($q) => $q->where('is_active', (bool) $v['active']))
            ->when($v['low_stock'] ?? false, fn ($q) => $q->perfumes()->where('stock_ml', '<', settings()->lowStockThresholdMl()))
            ->orderBy('sort_order')->orderByDesc('id')
            ->paginate($v['per_page'] ?? 30)->withQueryString();

        return AdminProductResource::collection($products);
    }

    public function show(Product $product): AdminProductResource
    {
        return new AdminProductResource($product->load(['brand', 'type', 'images', 'variants.packItems.component.product']));
    }

    /**
     * Create a perfume (with `variants`) or a pack (with `pack`).
     *
     * A perfume may have several sizes, each with its own price: e.g. 10 ml, 20 ml (poured from the
     * ml stock) and "Flacon complet 100 ml" (a sealed bottle counted separately).
     */
    public function store(SaveProductRequest $request): JsonResponse
    {
        return (new AdminProductResource($this->products->create($request->validated())))
            ->response()->setStatusCode(201);
    }

    public function update(SaveProductRequest $request, Product $product): AdminProductResource
    {
        return new AdminProductResource($this->products->update($product, $request->validated()));
    }

    /** Hides the product for good (soft delete). Refused while it belongs to a pack. */
    public function destroy(Product $product): Response
    {
        $this->products->delete($product);

        return response()->noContent();
    }
}
