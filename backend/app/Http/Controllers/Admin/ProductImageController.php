<?php

namespace App\Http\Controllers\Admin;

use App\Exceptions\ShopException;
use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\ProductImage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Intervention\Image\Drivers\Gd\Driver;
use Intervention\Image\Format;
use Intervention\Image\ImageManager;
use Throwable;

class ProductImageController extends Controller
{
    private const MAX_IMAGES = 10;

    /**
     * Upload a photo (jpg, png or webp, 5 MB max). It is resized to 1200 px and stored as WebP.
     * The first photo becomes the product's main image.
     */
    public function store(Request $request, Product $product): JsonResponse
    {
        $request->validate(
            ['image' => ['required', 'file', 'image', 'max:20480']],
            [
                'image.required' => "Aucune photo reçue. Choisissez une image, puis réessayez.",
                'image.image' => "Ce fichier n'est pas une image (jpg, png, webp ou gif).",
                'image.max' => 'Cette photo dépasse 20 Mo. Réduisez-la puis réessayez.',
            ],
        );

        if ($product->images()->count() >= self::MAX_IMAGES) {
            throw new ShopException('Maximum '.self::MAX_IMAGES.' photos par produit.');
        }

        try {
            $webp = ImageManager::usingDriver(Driver::class)
                ->decodePath($request->file('image')->getRealPath())
                ->scaleDown(1200, 1200)
                ->encodeUsingFormat(Format::WEBP, quality: 82);
        } catch (Throwable $e) {
            report($e);
            throw new ShopException("Impossible de lire cette photo. Essayez de l'enregistrer en jpg ou png, puis réessayez.");
        }

        $path = "products/{$product->id}/".Str::uuid().'.webp';
        Storage::disk('public')->put($path, (string) $webp);

        $image = DB::transaction(function () use ($product, $path) {
            $image = $product->images()->create(['path' => $path, 'sort_order' => (int) $product->images()->max('sort_order') + 1]);
            $product->main_image ?: $product->update(['main_image' => $path]);

            return $image;
        });

        return response()->json(['data' => ['id' => $image->id, 'url' => media_url($path), 'sort_order' => $image->sort_order]], 201);
    }

    /** Set the gallery order; the first id becomes the main image. */
    public function reorder(Request $request, Product $product): Response
    {
        $ids = $request->validate(['ids' => ['required', 'array', 'min:1'], 'ids.*' => ['integer']])['ids'];

        $own = $product->images()->pluck('id')->sort()->values()->all();
        if (collect($ids)->sort()->values()->all() !== $own) {
            throw new ShopException("La liste doit contenir toutes les photos du produit, une seule fois.");
        }

        DB::transaction(function () use ($product, $ids) {
            foreach ($ids as $position => $id) {
                $product->images()->whereKey($id)->update(['sort_order' => $position]);
            }
            $product->update(['main_image' => $product->images()->orderBy('sort_order')->value('path')]);
        });

        return response()->noContent();
    }

    public function destroy(ProductImage $image): Response
    {
        $product = $image->product;

        DB::transaction(function () use ($image, $product) {
            Storage::disk('public')->delete($image->path);
            $image->delete();

            if ($product->main_image === $image->path) {
                $product->update(['main_image' => $product->images()->orderBy('sort_order')->value('path')]);
            }
        });

        return response()->noContent();
    }
}
