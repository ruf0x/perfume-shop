<?php

use App\Models\Brand;
use App\Models\PerfumeType;
use App\Models\Product;

it('creates a brand typed on the product, listed under its type', function () {
    $this->actingAs(makeOwner());
    $type = productType();

    $res = $this->postJson('/api/admin/products', perfumePayload(['brand_name' => 'Maison Nouvelle']))->assertCreated();

    $brand = Brand::query()->where('name', 'Maison Nouvelle')->firstOrFail();
    expect($res->json('data.brand.id'))->toBe($brand->id)
        ->and($brand->productTypes()->pluck('product_types.id')->all())->toBe([$type->id]);
});

it('puts the brand in the family of the product too', function () {
    $this->actingAs(makeOwner());
    $family = PerfumeType::firstOrCreate(['slug' => 'designer'], ['name' => 'Designer']);

    $res = $this->postJson('/api/admin/products', perfumePayload(['brand_name' => 'Ferrari', 'perfume_type_id' => $family->id]))->assertCreated();

    $this->getJson('/api/admin/brands?perfume_type_id='.$family->id)->assertOk()
        ->assertJsonPath('data.0.name', 'Ferrari')
        ->assertJsonPath('data.0.families.0', 'Designer');
    expect($res->json('data.brand.id'))->not->toBeNull();
});

it('reuses an existing brand whatever the case of the name', function () {
    $this->actingAs(makeOwner());
    $existing = Brand::create(['name' => 'Dior', 'slug' => 'dior']);

    $this->postJson('/api/admin/products', perfumePayload(['brand_name' => 'DIOR']))->assertCreated()
        ->assertJsonPath('data.brand.id', $existing->id);

    expect(Brand::query()->whereRaw('LOWER(name) = ?', ['dior'])->count())->toBe(1);
});

it('receives the bottles typed with the product: flacons as they are, decant bottles as ml', function () {
    $this->actingAs(makeOwner());

    $res = $this->postJson('/api/admin/products', perfumePayload([
        'variants' => [
            ['label' => '10 ml', 'ml' => 10, 'price' => 900, 'stock_mode' => 'pool', 'initial_qty' => 10],
            ['label' => 'Flacon 100 ml', 'ml' => 100, 'price' => 8000, 'stock_mode' => 'unit', 'initial_qty' => 5],
            ['label' => 'Flacon 150 ml', 'ml' => 150, 'price' => 11000, 'stock_mode' => 'unit', 'initial_qty' => 3],
        ],
    ]))->assertCreated();

    $product = Product::query()->findOrFail($res->json('data.id'));
    expect($product->stock_ml)->toBe(100)
        ->and($product->variants()->where('label', 'Flacon 100 ml')->value('stock_qty'))->toBe(5)
        ->and($product->variants()->where('label', 'Flacon 150 ml')->value('stock_qty'))->toBe(3);
});

it('shows one brand with its types, families and products', function () {
    $this->actingAs(makeOwner());
    $res = $this->postJson('/api/admin/products', perfumePayload(['brand_name' => 'Armaf']))->assertCreated();

    $this->getJson('/api/admin/brands/'.$res->json('data.brand.id'))->assertOk()
        ->assertJsonPath('data.name', 'Armaf')
        ->assertJsonPath('data.products_count', 1)
        ->assertJsonPath('data.products.0.name', 'Oud Royal')
        ->assertJsonPath('data.product_type_ids.0', productType()->id);
});

it('shows what happened to a product stock: received, opened, sold and left', function () {
    $this->actingAs(makeOwner());
    $product = makePerfume('Summary test', poolMl: 0, sealed: 2);
    $flacon = variantOf($product, '100 ml scellé');
    app(\App\Services\StockService::class)->openBottle($flacon, makeOwner());

    $res = $this->getJson("/api/admin/stock/products/{$product->id}/summary")->assertOk()
        ->assertJsonPath('data.pool.received_ml', 0)
        ->assertJsonPath('data.pool.opened_ml', 100)
        ->assertJsonPath('data.pool.remaining_ml', 100);

    $size = collect($res->json('data.sizes'))->firstWhere('label', '100 ml scellé');
    expect($size['received'])->toBe(2)->and($size['opened'])->toBe(1)->and($size['remaining'])->toBe(1);
});

it('follows each opened bottle: decanted from the newest one, what is left in each', function () {
    $this->actingAs(makeOwner());
    $product = makePerfume('Bottles test', poolMl: 0, sealed: 5);
    $stock = app(\App\Services\StockService::class);
    $big = variantOf($product, '100 ml scellé');
    $stock->openBottle($big, makeOwner());
    $stock->adjust($product, null, \App\Enums\StockMovementType::Perte, mlChange: -80, note: 'Décanté');
    $stock->openBottle($big, makeOwner());
    $stock->adjust($product, null, \App\Enums\StockMovementType::Perte, mlChange: -30, note: 'Décanté');

    $res = $this->getJson("/api/admin/stock/products/{$product->id}/summary")->assertOk();
    $bottles = $res->json('data.open_bottles');
    expect($bottles)->toHaveCount(2)
        ->and($bottles[0]['remaining'])->toBe(70)
        ->and($bottles[1]['remaining'])->toBe(20)
        ->and($res->json('data.bulk_ml'))->toBe(0);
});

it('takes a loss from one chosen opened bottle, and refuses more than that bottle holds', function () {
    $owner = makeOwner();
    $this->actingAs($owner);
    $product = makePerfume('Per bottle loss', poolMl: 0, sealed: 2);
    $stock = app(\App\Services\StockService::class);
    $big = variantOf($product, '100 ml scellé');
    $stock->openBottle($big, $owner);
    $stock->openBottle($big, $owner);
    $first = \App\Models\OpenBottle::query()->where('product_id', $product->id)->orderBy('id')->firstOrFail();

    $this->postJson('/api/admin/stock/adjustments', ['product_id' => $product->id, 'type' => 'perte', 'ml_change' => -5, 'note' => 'Renversé', 'open_bottle_id' => $first->id])->assertCreated();
    $this->postJson('/api/admin/stock/adjustments', ['product_id' => $product->id, 'type' => 'perte', 'ml_change' => -500, 'note' => 'Trop', 'open_bottle_id' => $first->id])->assertStatus(422);

    expect($first->fresh()->remaining_ml)->toBe(95)
        ->and($first->fresh()->lost_ml)->toBe(5)
        ->and($product->fresh()->stock_ml)->toBe(195);
});

it('edits and deletes a hand-made entry, keeping the history, and gives a loss back to its bottle', function () {
    $owner = makeOwner();
    $this->actingAs($owner);
    $product = makePerfume('Corrections', poolMl: 0, sealed: 3);
    $stock = app(\App\Services\StockService::class);
    $big = variantOf($product, '100 ml scellé');

    $entry = \App\Models\StockMovement::query()->where('product_id', $product->id)->where('type', 'entree')->firstOrFail();
    $this->putJson("/api/admin/stock/movements/{$entry->id}", ['quantity' => 5, 'note' => 'Erreur de saisie'])->assertOk();
    expect($big->fresh()->stock_qty)->toBe(5)
        ->and($entry->fresh()->cancelled_at)->not->toBeNull();

    $stock->openBottle($big, $owner);
    $stock->adjust($product, null, \App\Enums\StockMovementType::Perte, mlChange: -30, note: 'Renversé', user: $owner);
    $loss = \App\Models\StockMovement::query()->where('product_id', $product->id)->where('type', 'perte')->firstOrFail();
    $bottle = \App\Models\OpenBottle::query()->where('product_id', $product->id)->firstOrFail();
    expect($bottle->fresh()->remaining_ml)->toBe(70);

    $this->deleteJson("/api/admin/stock/movements/{$loss->id}")->assertNoContent();
    expect($bottle->fresh()->remaining_ml)->toBe(100)
        ->and($product->fresh()->stock_ml)->toBe(100);

    // A bottle used cannot be discarded; an untouched one can.
    $this->deleteJson("/api/admin/stock/open-bottles/{$bottle->id}")->assertNoContent();
    expect($big->fresh()->stock_qty)->toBe(5 - 1 + 1)
        ->and($product->fresh()->stock_ml)->toBe(0);
});

it('sells decant from the bottle the cashier named', function () {
    $owner = makeOwner();
    $this->actingAs($owner);
    $product = makePerfume('Named bottle', poolMl: 0, sealed: 2);
    $stock = app(\App\Services\StockService::class);
    $big = variantOf($product, '100 ml scellé');
    $stock->openBottle($big, $owner);
    $stock->openBottle($big, $owner);
    $older = \App\Models\OpenBottle::query()->where('product_id', $product->id)->orderBy('id')->firstOrFail();
    $ten = variantOf($product, '10 ml');

    app(\App\Services\OrderPlacement::class)->placePos([
        'lines' => [['variant_id' => $ten->id, 'quantity' => 2, 'open_bottle_id' => $older->id]],
        'payment_method' => 'especes',
        'amount_received' => 100000,
    ], $owner);

    expect($older->fresh()->remaining_ml)->toBe(80)
        ->and(\App\Models\OpenBottle::query()->where('product_id', $product->id)->orderByDesc('id')->first()->remaining_ml)->toBe(100);
});

it('sells a pack with decants from the bottles named for each component', function () {
    $owner = makeOwner();
    $this->actingAs($owner);
    $product = makePerfume('Pack decant', poolMl: 0, sealed: 2);
    $stock = app(\App\Services\StockService::class);
    $big = variantOf($product, '100 ml scellé');
    $stock->openBottle($big, $owner);
    $stock->openBottle($big, $owner);
    $older = \App\Models\OpenBottle::query()->where('product_id', $product->id)->orderBy('id')->firstOrFail();
    $pack = makePack([[variantOf($product, '10 ml'), 2]], 1500);

    app(\App\Services\OrderPlacement::class)->placePos([
        'lines' => [['variant_id' => $pack->id, 'quantity' => 1, 'component_bottles' => [variantOf($product, '10 ml')->id => $older->id]]],
        'payment_method' => 'especes',
        'amount_received' => 100000,
    ], $owner);

    expect($older->fresh()->remaining_ml)->toBe(80);
});
