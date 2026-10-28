<?php

use App\Enums\ProductKind;
use App\Enums\StockMode;
use App\Enums\UserRole;
use App\Models\Order;
use App\Models\PackItem;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\User;
use App\Models\Wilaya;
use App\Services\OrderPlacement;
use App\Services\StockService;
use Illuminate\Support\Str;

/**
 * A perfume with 10/20/30 ml pool variants and a sealed 100 ml bottle variant.
 * Stock goes in through StockService so the ledger and the cache agree.
 */
function makePerfume(string $name = 'Parfum Test', int $poolMl = 0, int $sealed = 0): Product
{
    $product = Product::create([
        'kind' => ProductKind::Perfume,
        'name' => $name,
        'slug' => Str::slug($name).'-'.Str::random(5),
    ]);

    foreach ([10 => 1000, 20 => 1800, 30 => 2500] as $ml => $price) {
        $product->variants()->create(['label' => "{$ml} ml", 'ml' => $ml, 'price' => $price, 'stock_mode' => StockMode::Pool]);
    }
    $full = $product->variants()->create(['label' => '100 ml scellé', 'ml' => 100, 'price' => 9000, 'stock_mode' => StockMode::Unit]);

    if ($poolMl > 0) {
        app(StockService::class)->addEntry($product, ml: $poolMl);
    }
    if ($sealed > 0) {
        app(StockService::class)->addEntry($product, $full, qty: $sealed);
    }

    return $product->fresh('variants');
}

function variantOf(Product $product, string $label): ProductVariant
{
    return $product->variants->firstWhere('label', $label) ?? throw new RuntimeException("No variant {$label}");
}

/** @param list<array{0: ProductVariant, 1: int}> $components */
function makePack(array $components, int $price = 5000): ProductVariant
{
    $pack = Product::create(['kind' => ProductKind::Pack, 'name' => 'Pack Test', 'slug' => 'pack-'.Str::random(6)]);
    $variant = $pack->variants()->create(['label' => 'Pack', 'price' => $price, 'stock_mode' => StockMode::Pack]);

    foreach ($components as [$component, $quantity]) {
        PackItem::create(['pack_variant_id' => $variant->id, 'component_variant_id' => $component->id, 'quantity' => $quantity]);
    }

    return $variant;
}

function makeWilaya(int $id = 16, int $home = 600, int $desk = 400): Wilaya
{
    return Wilaya::query()->find($id) ?? Wilaya::create([
        'id' => $id, 'code' => str_pad((string) $id, 2, '0', STR_PAD_LEFT), 'name' => "Wilaya {$id}",
        'home_fee' => $home, 'desk_fee' => $desk, 'is_active' => true,
    ]);
}

function makeOwner(): User
{
    return User::create(['name' => 'Owner', 'username' => 'owner-'.Str::random(5), 'password' => 'secret-pass', 'role' => UserRole::Owner]);
}

/** @param list<array{0: ProductVariant, 1: int}> $items */
function lines(array $items): array
{
    return array_map(fn (array $i) => ['variant_id' => $i[0]->id, 'quantity' => $i[1]], $items);
}

/** Valid online order payload; override any key. */
function orderData(array $items, array $overrides = []): array
{
    makeWilaya();

    return array_merge([
        'first_name' => 'Amine',
        'last_name' => 'Benali',
        'phone' => '0550123456',
        'wilaya_id' => 16,
        'address' => '12 rue des Fleurs',
        'delivery_mode' => 'domicile',
        'lines' => lines($items),
    ], $overrides);
}

/** @param list<array{0: ProductVariant, 1: int}> $items */
function placeOnline(array $items, array $overrides = []): Order
{
    return app(OrderPlacement::class)->placeOnline(orderData($items, $overrides));
}

function pooledMl(Product $product): int
{
    return (int) $product->fresh()->stock_ml;
}
