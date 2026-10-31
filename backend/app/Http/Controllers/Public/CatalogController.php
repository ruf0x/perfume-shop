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
use App\Models\ProductType;
use App\Services\StockService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class CatalogController extends Controller
{
    public function __construct(private StockService $stock) {}

    /**
     * The shop's product types (Parfums, Cosmétiques, Montres, Lunettes...) with their families / categories.
     * `profile` says how the type works (`perfume` or `standard`); `uses_gender` whether to offer a Homme / Femme filter.
     */
    public function productTypes(): JsonResponse
    {
        $types = ProductType::query()->where('is_active', true)
            ->with(['categories' => fn ($q) => $q->where('is_active', true)->orderBy('sort_order')])
            ->orderBy('sort_order')->orderBy('id')->get();

        return response()->json(['data' => $types->map(fn (ProductType $t) => [
            'id' => $t->id,
            'name' => $t->name,
            'slug' => $t->slug,
            'profile' => $t->profile,
            'uses_gender' => $t->uses_gender,
            'categories' => $t->categories->map(fn (PerfumeType $c) => ['id' => $c->id, 'name' => $c->name, 'slug' => $c->slug])->values(),
        ])->values()]);
    }

    /** Active families and categories of every active type, in display order. */
    public function types(): JsonResponse
    {
        return response()->json(['data' => PerfumeType::query()->where('is_active', true)
            ->whereHas('productType', fn ($q) => $q->where('is_active', true))
            ->orderBy('sort_order')->get(['id', 'name', 'slug', 'product_type_id'])]);
    }

    /** Brands, or only those sold in one product type with `?rayon=montres`. */
    public function brands(Request $request): JsonResponse
    {
        $rayon = $request->query('rayon');

        return response()->json(['data' => Brand::query()
            ->when(is_string($rayon) && $rayon !== '', fn ($q) => $q->whereHas('productTypes', fn ($t) => $t->where('slug', $rayon)))
            ->orderBy('name')->get(['id', 'name', 'slug'])]);
    }

    /**
     * Catalogue listing (products of every type, and packs), paginated.
     * `rayon` limits it to one product type; `kind` to how products work (perfume, standard, pack).
     *
     * When the owner turned "show unavailable" off, out-of-stock items are left out.
     */
    public function index(ProductIndexRequest $request): AnonymousResourceCollection
    {
        $v = $request->validated();

        $query = Product::query()
            ->active()
            ->with(['brand', 'type', 'productType', 'variants' => fn ($q) => $q->where('is_active', true)])
            ->whereIn('id', $this->shownProductIds())
            ->withMin(['variants as min_price' => fn ($q) => $q->where('is_active', true)], 'price');

        if (! settings()->showUnavailable()) {
            $query->available(settings()->lowStockThresholdMl())->whereNotIn('id', $this->unavailablePackIds());
        }

        $query
            ->when($v['kind'] ?? null, fn (Builder $q, string $kinds) => $q->whereIn('kind', explode(',', $kinds)))
            ->when($v['rayon'] ?? null, fn (Builder $q, string $slug) => $q->whereHas('productType', fn ($t) => $t->where('slug', $slug)))
            ->when($v['gender'] ?? null, fn (Builder $q, string $gender) => $q->where('gender', $gender))
            ->when($v['featured'] ?? null, fn (Builder $q) => $q->where('is_featured', true))
            ->when($v['type'] ?? null, fn (Builder $q, string $slug) => $q->whereHas('type', fn ($t) => $t->where('slug', $slug)
                ->when($v['rayon'] ?? null, fn ($x, string $rayon) => $x->whereHas('productType', fn ($p) => $p->where('slug', $rayon)))))
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
            ->with(['brand', 'type', 'productType', 'images', 'variants' => fn ($q) => $q->where('is_active', true)])
            ->whereIn('id', $this->shownProductIds())
            ->where('slug', $slug)
            ->firstOrFail();

        if (! settings()->showUnavailable() && ! $this->stock->productAvailable($product)) {
            abort(404);
        }

        return new ProductResource($product);
    }

    /** Subquery: products whose type is shown (a pack may have no type at all). */
    private function shownProductIds()
    {
        return Product::query()->select('products.id')
            ->where(fn ($q) => $q->whereNull('product_type_id')->orWhereHas('productType', fn ($t) => $t->where('is_active', true)));
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
