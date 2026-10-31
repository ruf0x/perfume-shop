<?php

use App\Models\Brand;
use App\Models\Commune;
use App\Models\Customer;
use App\Models\Order;
use App\Models\PerfumeType;

function typed(string $name, string $type, int $poolMl = 100, ?string $brand = null): \App\Models\Product
{
    $p = makePerfume($name, poolMl: $poolMl);
    $p->update([
        'perfume_type_id' => PerfumeType::firstOrCreate(['slug' => $type], ['name' => ucfirst($type), 'product_type_id' => productType()->id])->id,
        'brand_id' => $brand ? Brand::firstOrCreate(['slug' => str($brand)->slug()], ['name' => $brand])->id : null,
    ]);

    return $p->fresh('variants');
}

it('lists types, brands, wilayas and communes', function () {
    $rayon = productType();
    PerfumeType::create(['name' => 'Arabe', 'slug' => 'arabe', 'product_type_id' => $rayon->id]);
    PerfumeType::create(['name' => 'Caché', 'slug' => 'cache', 'product_type_id' => $rayon->id, 'is_active' => false]);
    Brand::create(['name' => 'Lattafa', 'slug' => 'lattafa']);
    makeWilaya(16);
    makeWilaya(31)->update(['is_active' => false]);
    $commune = Commune::create(['wilaya_id' => 16, 'name' => 'Bab El Oued']);

    $this->getJson('/api/types')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.slug', 'arabe');
    $this->getJson('/api/brands')->assertOk()->assertJsonPath('data.0.name', 'Lattafa');
    $this->getJson('/api/wilayas')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.home_fee', 600);
    $this->getJson('/api/wilayas/16/communes')->assertOk()->assertJsonPath('data.0.id', $commune->id);
});

it('exposes only whitelisted public settings', function () {
    settings()->set('shop_name', 'Ma Boutique');
    settings()->set('low_stock_threshold_ml', 25);

    $this->getJson('/api/settings/public')->assertOk()
        ->assertJsonPath('data.shop_name', 'Ma Boutique')
        ->assertJsonMissingPath('data.low_stock_threshold_ml');
});

it('hides out-of-stock perfumes by default and shows them flagged when the owner allows it', function () {
    typed('Disponible', 'arabe', 100);
    typed('Presque vide', 'arabe', 8);
    typed('Épuisé', 'arabe', 0);

    $this->getJson('/api/products')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'Disponible');

    settings()->set('show_unavailable', true);
    $res = $this->getJson('/api/products')->assertOk()->assertJsonCount(3, 'data');
    expect(collect($res->json('data'))->pluck('available', 'name')->sortKeys()->all())
        ->toBe(['Disponible' => true, 'Presque vide' => false, 'Épuisé' => false]);
});

it('keeps a perfume visible when only a sealed bottle is left', function () {
    $p = makePerfume('Flacon seul', poolMl: 0, sealed: 1);

    $this->getJson('/api/products')->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'Flacon seul');
});

it('never lists inactive products', function () {
    typed('Caché', 'arabe', 100)->update(['is_active' => false]);

    $this->getJson('/api/products')->assertJsonCount(0, 'data');
    $this->getJson('/api/products/'.\App\Models\Product::first()->slug)->assertNotFound();
});

it('filters the catalogue by type, brand, search, price and kind', function () {
    typed('Sauvage', 'designer', 100, 'Dior');
    typed('Khamrah', 'arabe', 100, 'Lattafa');
    $asad = typed('Asad', 'dupe', 100, 'Lattafa');
    $asad->update(['inspired_by' => 'Dior Sauvage Elixir']);
    makePack([[variantOf(\App\Models\Product::where('name', 'Sauvage')->first()->load('variants'), '10 ml'), 1]]);

    $names = fn (string $qs) => collect($this->getJson("/api/products?{$qs}")->assertOk()->json('data'))->pluck('name')->sort()->values()->all();

    expect($names('type=arabe'))->toBe(['Khamrah'])
        ->and($names('brand=lattafa'))->toBe(['Asad', 'Khamrah'])
        ->and($names('q=sauvage'))->toBe(['Asad', 'Sauvage'])   // matches "inspired by" too
        ->and($names('kind=pack'))->toBe(['Pack Test'])
        ->and($names('min_price=1500'))->toBe(['Asad', 'Khamrah', 'Pack Test', 'Sauvage'])  // 20 ml variant is 1800, the pack costs 5000
        ->and($names('max_price=500'))->toBe([]);
});

it('sorts by price and paginates', function () {
    foreach (['A', 'B', 'C'] as $i => $name) {
        $p = typed($name, 'arabe', 100);
        $p->variants()->where('label', '10 ml')->update(['price' => 1000 + ($i === 1 ? -500 : $i * 100)]);
    }

    $res = $this->getJson('/api/products?sort=price_asc&per_page=2')->assertOk();
    expect(collect($res->json('data'))->pluck('name')->all())->toBe(['B', 'A'])
        ->and($res->json('meta.total'))->toBe(3)
        ->and($res->json('data.0.price_from'))->toBe(500);
});

it('does not expose stock quantities publicly', function () {
    typed('Secret', 'arabe', 100);

    $json = $this->getJson('/api/products')->getContent().$this->getJson('/api/products/'.\App\Models\Product::first()->slug)->getContent();

    expect($json)->not->toContain('stock_ml')->not->toContain('stock_qty')->not->toContain('unit_cost');
});

it('shows a product with per-variant availability', function () {
    $p = typed('Détail', 'arabe', 25, 'Lattafa');
    $p->update(['notes_top' => 'Safran']);

    $res = $this->getJson("/api/products/{$p->slug}")->assertOk()
        ->assertJsonPath('data.brand', 'Lattafa')
        ->assertJsonPath('data.notes.top', 'Safran');

    $byLabel = collect($res->json('data.variants'))->keyBy('label');
    expect($byLabel['10 ml']['available'])->toBeTrue()
        ->and($byLabel['20 ml']['max_qty'])->toBe(1)
        ->and($byLabel['30 ml']['available'])->toBeFalse()
        ->and($byLabel['100 ml scellé']['available'])->toBeFalse();
});

it('shows what a pack contains', function () {
    $a = typed('Composant', 'arabe', 100);
    $pack = makePack([[variantOf($a, '10 ml'), 2]]);

    $this->getJson('/api/products/'.$pack->product->slug)->assertOk()
        ->assertJsonPath('data.contains.0.product', 'Composant')
        ->assertJsonPath('data.contains.0.quantity', 2)
        ->assertJsonPath('data.available', true);
});

it('re-prices the cart on the server and reports removed and unavailable lines', function () {
    makeWilaya(16);
    $p = typed('Panier', 'arabe', 30);
    $ten = variantOf($p, '10 ml');

    $res = $this->postJson('/api/cart/validate', [
        'lines' => [
            ['variant_id' => $ten->id, 'quantity' => 2, 'price' => 1],
            ['variant_id' => variantOf($p, '30 ml')->id, 'quantity' => 2],
            ['variant_id' => 999999, 'quantity' => 1],
        ],
    ])->assertOk();

    expect($res->json('data.removed'))->toBe([999999])
        ->and($res->json('data.subtotal'))->toBe(2 * 1000 + 2 * 2500)
        ->and($res->json('data.delivery_fee'))->toBeNull()
        ->and($res->json('data.all_available'))->toBeFalse()
        ->and(collect($res->json('data.lines'))->pluck('available', 'label')->all())->toBe(['10 ml' => true, '30 ml' => false]);

    $withFee = $this->postJson('/api/cart/validate', [
        'lines' => [['variant_id' => $ten->id, 'quantity' => 1]],
        'wilaya_id' => 16,
        'delivery_mode' => 'domicile',
    ])->assertOk();
    expect($withFee->json('data.delivery_fee'))->toBe(600)->and($withFee->json('data.total'))->toBe(1600);
});

it('places an order and returns the reference', function () {
    $p = typed('Commande', 'arabe', 100);

    $res = $this->postJson('/api/orders', orderData([[variantOf($p, '20 ml'), 2]]))->assertCreated();

    expect($res->json('data.reference'))->toBe('CMD-000001')
        ->and($res->json('data.total'))->toBe(3600 + 600)
        ->and(Order::first()->ip_address)->not->toBeNull();
});

it('rejects the honeypot, bad phones and incomplete orders', function () {
    $p = typed('Commande', 'arabe', 100);
    $data = orderData([[variantOf($p, '20 ml'), 1]]);

    $this->postJson('/api/orders', $data + ['website' => 'http://spam.example'])->assertUnprocessable()->assertJsonValidationErrors('website');
    $this->postJson('/api/orders', array_merge($data, ['phone' => '123']))->assertUnprocessable()->assertJsonPath('message', 'Numéro de téléphone invalide.');
    $this->postJson('/api/orders', ['lines' => []])->assertUnprocessable()->assertJsonValidationErrors(['first_name', 'phone', 'delivery_mode', 'lines']);
    expect(Order::count())->toBe(0);
});

it('returns the shortages when the shop cannot supply an order', function () {
    $p = typed('Rare', 'arabe', 15);

    $this->postJson('/api/orders', orderData([[variantOf($p, '20 ml'), 1]]))
        ->assertUnprocessable()
        ->assertJsonStructure(['message', 'shortages' => [['name', 'unit', 'requested', 'available']]]);
});

it('refuses blacklisted customers with a 422', function () {
    $p = typed('Commande', 'arabe', 100);
    Customer::create(['phone' => '0550123456', 'first_name' => 'X', 'last_name' => 'Y', 'is_blacklisted' => true]);

    $this->postJson('/api/orders', orderData([[variantOf($p, '10 ml'), 1]]))->assertUnprocessable();
});

it('throttles checkout to 5 orders per minute per IP', function () {
    $p = typed('Commande', 'arabe', 500);
    $data = orderData([[variantOf($p, '10 ml'), 1]]);

    foreach (range(1, 5) as $i) {
        $this->postJson('/api/orders', $data)->assertCreated();
    }
    $this->postJson('/api/orders', $data)->assertStatus(429);
});
