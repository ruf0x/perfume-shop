<?php

namespace App\Http\Controllers\Public;

use App\Enums\ProductKind;
use App\Http\Controllers\Controller;
use App\Http\Requests\ProductIndexRequest;
use App\Http\Resources\ProductCardResource;
use App\Http\Resources\ProductResource;
use App\Models\Brand;
use App\Models\PerfumeType;
use App\Models\Product;
use App\Services\StockService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class CatalogController extends Controller
{
    public function __construct(private StockService $stock) {}

    /** Active perfume types, in display order. */
    public function types(): JsonResponse
    {
        return response()->json(['data' => PerfumeType::query()->where('is_active', true)->orderBy('sort_order')->get(['id', 'name', 'slug'])]);
    }

    public function brands(): JsonResponse
    {
        return response()->json(['data' => Brand::query()->orderBy('name')->get(['id', 'name', 'slug'])]);
    }

    /**
     * Catalogue listing (perfumes and packs), paginated.
     *
     * When the owner turned "show unavailable" off, out-of-stock items are left out.
     */
    public function index(ProductIndexRequest $request): AnonymousResourceCollection
    {
        $v = $request->validated();

        $query = Product::query()
            ->active()
            ->with(['brand', 'type', 'variants' => fn ($q) => $q->where('is_active', true)])
            ->withMin(['variants as min_price' => fn ($q) => $q->where('is_active', true)], 'price');

        if (! settings()->showUnavailable()) {
            $query->available(settings()->lowStockThresholdMl())->whereNotIn('id', $this->unavailablePackIds());
        }

        $query
            ->when($v['kind'] ?? null, fn (Builder $q, string $kind) => $q->where('kind', $kind))
            ->when($v['gender'] ?? null, fn (Builder $q, string $gender) => $q->where('gender', $gender))
            ->when($v['featured'] ?? null, fn (Builder $q) => $q->where('is_featured', true))
            ->when($v['type'] ?? null, fn (Builder $q, string $slug) => $q->whereHas('type', fn ($t) => $t->where('slug', $slug)))
            ->when($v['brand'] ?? null, fn (Builder $q, string $slug) => $q->whereHas('brand', fn ($b) => $b->where('slug', $slug)))
            ->when($v['q'] ?? null, fn (Builder $q, string $term) => $q->where(fn ($w) => $w
                ->where('name', 'like', "%{$term}%")
                ->orWhere('inspired_by', 'like', "%{$term}%")
                ->orWhereHas('brand', fn ($b) => $b->where('name', 'like', "%{$term}%"))))
            ->when($v['min_price'] ?? null, fn (Builder $q, int $min) => $q->whereHas('variants', fn ($x) => $x->where('is_active', true)->where('price', '>=', $min)))
            ->when($v['max_price'] ?? null, fn (Builder $q, int $max) => $q->whereHas('variants', fn ($x) => $x->where('is_active', true)->where('price', '<=', $max)));

        match ($v['sort'] ?? 'newest') {
            'price_asc' => $query->orderBy('min_price')->orderByDesc('id'),
            'price_desc' => $query->orderByDesc('min_price')->orderByDesc('id'),
            'name' => $query->orderBy('name'),
            default => $query->orderByDesc('is_featured')->orderBy('sort_order')->orderByDesc('id'),
        };

        return ProductCardResource::collection($query->paginate($v['per_page'] ?? 12)->withQueryString());
    }

    /** Product page with variants, each with its own availability. */
    public function show(string $slug): ProductResource
    {
        $product = Product::query()->active()
            ->with(['brand', 'type', 'images', 'variants' => fn ($q) => $q->where('is_active', true)])
            ->where('slug', $slug)
            ->firstOrFail();

        if (! settings()->showUnavailable() && ! $this->stock->productAvailable($product)) {
            abort(404);
        }

        return new ProductResource($product);
    }

    /** @return list<int> */
    private function unavailablePackIds(): array
    {
        return Product::query()->packs()->active()->with('variants')->get()
            ->reject(fn (Product $pack) => $this->stock->productAvailable($pack))
            ->pluck('id')
            ->all();
    }
}
