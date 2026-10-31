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
     * Products of every type, and packs, including hidden ones and stock quantities.
     *
     * Filters: `q` (name / brand), `kind`, `product_type_id` (Parfums, Montres...), `type_id` (family / category), `active`, `low_stock=1`.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $v = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            /** One or several of `perfume`, `standard`, `pack`, comma-separated (how the product works). */
            'kind' => ['nullable', 'regex:/^(perfume|standard|pack)(,(perfume|standard|pack))*$/'],
            /** One product type (Parfums, Montres...). */
            'product_type_id' => ['nullable', 'integer'],
            'type_id' => ['nullable', 'integer'],
            'active' => ['nullable', 'boolean'],
            'low_stock' => ['nullable', 'boolean'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $products = Product::query()
            ->with(['brand', 'type', 'productType', 'variants.packItems.component.product'])
            ->when($v['q'] ?? null, fn ($q, $term) => $q->where(fn ($w) => $w
                ->where('name', 'like', "%{$term}%")
                ->orWhere('inspired_by', 'like', "%{$term}%")
                ->orWhereHas('brand', fn ($b) => $b->where('name', 'like', "%{$term}%"))))
            ->when($v['kind'] ?? null, fn ($q, $kinds) => $q->whereIn('kind', explode(',', $kinds)))
            ->when($v['product_type_id'] ?? null, fn ($q, $id) => $q->where('product_type_id', $id))
            ->when($v['type_id'] ?? null, fn ($q, $id) => $q->where('perfume_type_id', $id))
            ->when(isset($v['active']), fn ($q) => $q->where('is_active', (bool) $v['active']))
            ->when($v['low_stock'] ?? false, fn ($q) => $q->lowStock(settings()->lowStockThresholdMl(), settings()->lowStockThresholdQty()))
            ->orderBy('sort_order')->orderByDesc('id')
            ->paginate($v['per_page'] ?? 30)->withQueryString();

        return AdminProductResource::collection($products);
    }

    public function show(Product $product): AdminProductResource
    {
        return new AdminProductResource($product->load(['brand', 'type', 'productType', 'images', 'variants.packItems.component.product']));
    }

    /**
     * Create a product (with `product_type_id` and `variants`) or a pack (`"kind": "pack"`, with `pack`).
     *
     * A perfume may have several sizes, each with its own price: e.g. 10 ml, 20 ml (poured from the
     * ml stock) and "Flacon complet 100 ml" (a sealed bottle counted separately). In a `standard` type
     * (cosmetics, watches, glasses...) a product has free-form options ("250 ml", "Rose nude", "Boîtier 42 mm")
     * counted in units, or sold by ml.
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
