<?php

use App\Enums\ProductKind;
use App\Enums\StockMode;
use App\Exceptions\InsufficientStockException;
use App\Exceptions\ShopException;
use App\Models\Brand;
use App\Models\OrderItem;
use App\Models\PerfumeType;
use App\Models\Product;
use App\Services\OrderPlacement;
use App\Services\OrderWorkflow;
use App\Services\StockService;

/** The owner's product types ("rayons"): Parfums, Cosmétiques, Montres, Lunettes... */
function cosmetics() { return productType('Cosmétiques', ProductKind::Standard, false); }
function watches() { return productType('Montres', ProductKind::Standard, true); }
function glasses() { return productType('Lunettes', ProductKind::Standard, true); }

/** A family / category inside a product type. */
function category(string $name, $type): PerfumeType
{
    return PerfumeType::firstOrCreate(['product_type_id' => $type->id, 'slug' => str($name)->slug()], ['name' => $name]);
}

function standardPayload($type, array $overrides = []): array
{
    return array_merge([
        'product_type_id' => $type->id,
        'name' => 'Gel douche coco',
        'short_description' => 'Gel douche parfumé à la noix de coco.',
        'variants' => [
            ['label' => '250 ml', 'price' => 900, 'stock_mode' => 'unit'],
            ['label' => '500 ml', 'ml' => 500, 'price' => 1500, 'stock_mode' => 'unit'],
        ],
    ], $overrides);
}

function plainPerfumePayload(array $overrides = []): array
{
    return array_merge([
        'product_type_id' => productType()->id,
        'name' => 'Oud Royal',
        'variants' => [['label' => '10 ml', 'ml' => 10, 'price' => 900, 'stock_mode' => 'pool']],
    ], $overrides);
}

describe('product types', function () {
    beforeEach(function () {
        $this->actingAs(makeOwner());
    });

    it('lets the owner create, rename, hide and reorder product types', function () {
        $id = $this->postJson('/api/admin/product-types', ['name' => 'Bijoux', 'profile' => 'standard'])
            ->assertCreated()
            ->assertJsonPath('data.slug', 'bijoux')
            ->assertJsonPath('data.profile', 'standard')
            ->assertJsonPath('data.uses_gender', false)
            ->json('data.id');

        $this->postJson('/api/admin/product-types', ['name' => 'Bijoux', 'profile' => 'standard'])->assertUnprocessable()->assertJsonValidationErrors('name');
        $this->postJson('/api/admin/product-types', ['name' => 'Autre', 'profile' => 'cosmetic'])->assertUnprocessable()->assertJsonValidationErrors('profile');

        $this->putJson("/api/admin/product-types/{$id}", ['name' => 'Bijoux fantaisie', 'uses_gender' => true, 'is_active' => false])
            ->assertOk()->assertJsonPath('data.name', 'Bijoux fantaisie')->assertJsonPath('data.uses_gender', true)->assertJsonPath('data.is_active', false);

        $this->postJson('/api/admin/product-types', ['name' => 'Parfums des îles', 'profile' => 'perfume'])->assertCreated()->assertJsonPath('data.uses_gender', true);
        $this->getJson('/api/admin/product-types')->assertOk()->assertJsonCount(2, 'data');
    });

    it('deletes an empty type with its categories, but refuses one that still holds products, and changing how it works', function () {
        $empty = productType('Bijoux', ProductKind::Standard, false);
        $ring = category('Bagues', $empty);
        $this->deleteJson("/api/admin/product-types/{$empty->id}")->assertNoContent();
        expect(PerfumeType::query()->whereKey($ring->id)->exists())->toBeFalse();

        $type = productType('Horloges', ProductKind::Standard, true);
        category('Sport', $type);

        makeCosmetic('Une montre', ['Noir' => [5000, 2]], $type);
        $this->deleteJson("/api/admin/product-types/{$type->id}")->assertUnprocessable();
        $this->putJson("/api/admin/product-types/{$type->id}", ['profile' => 'perfume'])->assertUnprocessable();
        $this->putJson("/api/admin/product-types/{$type->id}", ['name' => 'Horloges'])->assertOk();
    });

    it('only lets the owner change product types, but staff can read them', function () {
        auth()->logout();
        $staff = \App\Models\User::create(['name' => 'S', 'username' => 'staff', 'password' => 'secret-pass', 'role' => \App\Enums\UserRole::Staff]);
        $this->actingAs($staff);

        $this->getJson('/api/admin/product-types')->assertOk();
        $this->postJson('/api/admin/product-types', ['name' => 'Bijoux', 'profile' => 'standard'])->assertForbidden();
    });

    it('keeps categories inside their own product type', function () {
        $montres = watches();
        $lunettes = glasses();

        $this->postJson('/api/admin/types', ['name' => 'Accessoires', 'product_type_id' => $montres->id])->assertCreated();
        $this->postJson('/api/admin/types', ['name' => 'Accessoires', 'product_type_id' => $lunettes->id])->assertCreated();   // same name, other type
        $this->postJson('/api/admin/types', ['name' => 'Accessoires', 'product_type_id' => $lunettes->id])->assertUnprocessable();
        $this->postJson('/api/admin/types', ['name' => 'Sans type'])->assertUnprocessable()->assertJsonValidationErrors('product_type_id');

        $this->getJson("/api/admin/types?product_type_id={$montres->id}")->assertOk()->assertJsonCount(1, 'data');
    });

    it('scopes brands to the product types they are sold in', function () {
        $perfumes = productType();
        $montres = watches();

        $id = $this->postJson('/api/admin/brands', ['name' => 'Armani', 'product_type_ids' => [$perfumes->id, $montres->id]])
            ->assertCreated()->assertJsonPath('data.product_type_ids', [$perfumes->id, $montres->id])->json('data.id');
        $this->postJson('/api/admin/brands', ['name' => 'Casio', 'product_type_ids' => [$montres->id]])->assertCreated();

        $names = fn (int $typeId) => collect($this->getJson("/api/admin/brands?product_type_id={$typeId}")->assertOk()->json('data'))->pluck('name')->all();
        expect($names($perfumes->id))->toBe(['Armani'])->and($names($montres->id))->toBe(['Armani', 'Casio']);

        $this->putJson("/api/admin/brands/{$id}", ['product_type_ids' => [$montres->id]])->assertOk();
        expect($names($perfumes->id))->toBe([]);
    });

    it('lists a brand under the product type of the first product that uses it', function () {
        $brand = Brand::create(['name' => 'Ray-Ban', 'slug' => 'ray-ban']);
        $type = glasses();

        $this->postJson('/api/admin/products', standardPayload($type, ['name' => 'Wayfarer', 'brand_id' => $brand->id]))->assertCreated();

        expect($type->brands()->pluck('brands.id')->all())->toBe([$brand->id]);
        $this->getJson("/api/brands?rayon={$type->slug}")->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'Ray-Ban');
        $this->getJson('/api/brands?rayon=parfums')->assertOk()->assertJsonCount(0, 'data');
    });
});

describe('admin products', function () {
    beforeEach(function () {
        $this->actingAs(makeOwner());
    });

    it('creates a product whose options need no millilitres, in a standard type', function () {
        $this->postJson('/api/admin/products', standardPayload(watches(), [
            'name' => 'Casio A168',
            'variants' => [
                ['label' => 'Argent', 'price' => 6500, 'stock_mode' => 'unit'],
                ['label' => 'Doré', 'price' => 7500, 'stock_mode' => 'unit'],
            ],
        ]))->assertCreated()
            ->assertJsonPath('data.kind', 'standard')
            ->assertJsonPath('data.product_type.name', 'Montres')
            ->assertJsonPath('data.product_type.profile', 'standard')
            ->assertJsonCount(2, 'data.variants')
            ->assertJsonPath('data.variants.0.ml', null);
    });

    it('keeps a gender only when the product type uses one', function () {
        $payload = ['gender' => 'femme', 'inspired_by' => 'Dior', 'notes_top' => 'Rose'];

        $this->postJson('/api/admin/products', standardPayload(cosmetics(), $payload))->assertCreated()
            ->assertJsonPath('data.gender', null)->assertJsonPath('data.inspired_by', null)->assertJsonPath('data.notes_top', null);

        $this->postJson('/api/admin/products', standardPayload(watches(), ['name' => 'Montre dame'] + $payload))->assertCreated()
            ->assertJsonPath('data.gender', 'femme')->assertJsonPath('data.inspired_by', null)->assertJsonPath('data.notes_top', null);

        $this->postJson('/api/admin/products', plainPerfumePayload($payload + ['name' => 'Rose']))->assertCreated()
            ->assertJsonPath('data.gender', 'femme')->assertJsonPath('data.notes_top', 'Rose');
    });

    it('still requires millilitres for a perfume, and for any product poured from an ml stock', function () {
        $this->postJson('/api/admin/products', plainPerfumePayload(['variants' => [['label' => 'Grand', 'price' => 900, 'stock_mode' => 'unit']]]))
            ->assertUnprocessable()->assertJsonValidationErrors('variants.0.ml');

        $this->postJson('/api/admin/products', standardPayload(cosmetics(), ['variants' => [['label' => 'Huile au ml', 'price' => 30, 'stock_mode' => 'pool']]]))
            ->assertUnprocessable()->assertJsonValidationErrors('variants.0.ml');
    });

    it('requires a product type, and a category that belongs to it', function () {
        $this->postJson('/api/admin/products', ['name' => 'Orphelin', 'variants' => [['label' => 'x', 'price' => 1, 'stock_mode' => 'unit']]])
            ->assertUnprocessable()->assertJsonValidationErrors('product_type_id');

        $this->postJson('/api/admin/products', standardPayload(watches(), ['perfume_type_id' => category('Soleil', glasses())->id]))
            ->assertUnprocessable()->assertJsonValidationErrors('perfume_type_id');

        $this->postJson('/api/admin/products', standardPayload(glasses(), ['name' => 'Wayfarer', 'perfume_type_id' => category('Soleil', glasses())->id]))
            ->assertCreated()->assertJsonPath('data.type.name', 'Soleil');
    });

    it('only moves a product to a type that works the same way', function () {
        $product = makeCosmetic('Mascara');

        $this->putJson("/api/admin/products/{$product->id}", ['product_type_id' => watches()->id])->assertOk()->assertJsonPath('data.product_type.name', 'Montres');
        $this->putJson("/api/admin/products/{$product->id}", ['product_type_id' => productType()->id])->assertUnprocessable()->assertJsonValidationErrors('product_type_id');
    });

    it('filters the admin product list by product type', function () {
        makePerfume('Un parfum');
        makeCosmetic('Un gel');
        makeCosmetic('Une montre', ['Noir' => [5000, 2]], watches());

        $names = fn (string $query) => collect($this->getJson("/api/admin/products{$query}")->assertOk()->json('data'))->pluck('name')->sort()->values()->all();

        expect($names(''))->toBe(['Un gel', 'Un parfum', 'Une montre'])
            ->and($names('?product_type_id='.watches()->id))->toBe(['Une montre'])
            ->and($names('?kind=standard'))->toBe(['Un gel', 'Une montre'])
            ->and($names('?kind=perfume'))->toBe(['Un parfum']);
    });
});

describe('stock', function () {
    it('counts a product in units, takes it out on confirm and puts it back on cancel', function () {
        $gel = makeCosmetic('Gel douche', ['250 ml' => [900, 5]]);
        $variant = variantOf($gel, '250 ml');
        $order = placeOnline([[$variant, 2]]);

        app(OrderWorkflow::class)->transition($order, 'confirm', makeOwner());
        expect($variant->fresh()->stock_qty)->toBe(3);

        app(OrderWorkflow::class)->transition($order->fresh(), 'cancel', makeOwner());
        expect($variant->fresh()->stock_qty)->toBe(5);
    });

    it('refuses to confirm more than the units in stock, in "articles"', function () {
        $gel = makeCosmetic('Gel douche', ['250 ml' => [900, 1]]);
        $order = placeOnline([[variantOf($gel, '250 ml'), 1]]);
        variantOf($gel, '250 ml')->update(['stock_qty' => 0]);

        try {
            app(OrderWorkflow::class)->transition($order, 'confirm', makeOwner());
            $this->fail('Expected a stock shortage');
        } catch (InsufficientStockException $e) {
            expect($e->shortages[0]['unit'])->toBe('article(s)');
        }
    });

    it('sells a product by the millilitre from its own pool', function () {
        $huile = Product::create(['kind' => ProductKind::Standard, 'product_type_id' => cosmetics()->id, 'name' => 'Huile corps', 'slug' => 'huile-corps']);
        $huile->variants()->create(['label' => '30 ml', 'ml' => 30, 'price' => 700, 'stock_mode' => StockMode::Pool]);
        app(StockService::class)->addEntry($huile, ml: 100);

        $order = placeOnline([[variantOf($huile->fresh('variants'), '30 ml'), 2]]);
        app(OrderWorkflow::class)->transition($order, 'confirm', makeOwner());

        expect(pooledMl($huile))->toBe(40);
    });

    it('receives stock on a standard product, but never opens a "bottle"', function () {
        $gel = makeCosmetic('Gel douche', ['250 ml' => [900, 0]]);
        $variant = variantOf($gel, '250 ml');
        $variant->update(['ml' => 250]);

        $this->actingAs(makeOwner())->postJson('/api/admin/stock/entries', ['product_id' => $gel->id, 'variant_id' => $variant->id, 'qty' => 12])->assertCreated();
        expect($variant->fresh()->stock_qty)->toBe(12);

        expect(fn () => app(StockService::class)->openBottle($variant->fresh()))->toThrow(ShopException::class);
    });

    it('flags a standard product as low in stock from the unit threshold', function () {
        $gel = makeCosmetic('Gel douche', ['250 ml' => [900, 2]]);
        makeCosmetic('Savon', ['Pain' => [300, 40]]);

        $rows = collect($this->actingAs(makeOwner())->getJson('/api/admin/stock?kind=standard')->assertOk()->json('data'))->keyBy('name');
        expect($rows['Gel douche']['status'])->toBe('low')->and($rows['Savon']['status'])->toBe('ok');

        $this->getJson('/api/admin/dashboard')->assertOk()->assertJsonFragment(['id' => $gel->id, 'units' => 2]);
        $this->getJson('/api/admin/products?low_stock=1')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $gel->id);
    });

    it('filters the stock list by product type and by category', function () {
        $this->actingAs(makeOwner());
        makePerfume('Sauvage', poolMl: 100);
        $gel = makeCosmetic('Gel douche');
        $gel->update(['perfume_type_id' => category('Douche et bain', cosmetics())->id]);
        $montre = makeCosmetic('Casio', ['Noir' => [6000, 4]], watches());
        $montre->update(['perfume_type_id' => category('Sport', watches())->id]);

        $names = fn (string $query) => collect($this->getJson("/api/admin/stock{$query}")->assertOk()->json('data'))->pluck('name')->sort()->values()->all();

        expect($names(''))->toBe(['Casio', 'Gel douche', 'Sauvage'])
            ->and($names('?product_type_id='.watches()->id))->toBe(['Casio'])
            ->and($names('?product_type_id='.productType()->id))->toBe(['Sauvage'])
            ->and($names('?type_id='.category('Douche et bain', cosmetics())->id))->toBe(['Gel douche'])
            ->and($names('?kind=perfume'))->toBe(['Sauvage']);

        $row = collect($this->getJson('/api/admin/stock?product_type_id='.watches()->id)->json('data'))->first();
        expect($row['product_type']['name'])->toBe('Montres');
    });
});

describe('packs across product types', function () {
    it('is limited by its scarcest component and takes every component out of stock', function () {
        $perfume = makePerfume('Sauvage', poolMl: 100);
        $deo = makeCosmetic('Déodorant', ['Stick 50 ml' => [700, 3]]);
        $montre = makeCosmetic('Casio', ['Noir' => [6500, 10]], watches());

        $pack = makePack([
            [variantOf($perfume, '10 ml'), 1],
            [variantOf($deo, 'Stick 50 ml'), 1],
            [variantOf($montre, 'Noir'), 2],
        ], price: 15000);

        $stock = app(StockService::class);
        expect($stock->maxQty($pack))->toBe(3);   // the deodorant runs out first

        $order = placeOnline([[$pack, 2]]);
        app(OrderWorkflow::class)->transition($order, 'confirm', makeOwner());

        expect(pooledMl($perfume))->toBe(80)
            ->and(variantOf($deo->fresh('variants'), 'Stick 50 ml')->stock_qty)->toBe(1)
            ->and(variantOf($montre->fresh('variants'), 'Noir')->stock_qty)->toBe(6)
            ->and($stock->maxQty($pack->fresh()))->toBe(1);
    });

    it('can be created from the admin with products of several types, and placed in a type', function () {
        $this->actingAs(makeOwner());
        $perfume = makePerfume('Sauvage', poolMl: 100);
        $montre = makeCosmetic('Casio', ['Noir' => [6500, 5]], watches());

        $this->postJson('/api/admin/products', [
            'kind' => 'pack',
            'product_type_id' => watches()->id,
            'name' => 'Pack cadeau homme',
            'pack' => ['price' => 8000, 'components' => [
                ['variant_id' => variantOf($perfume, '10 ml')->id, 'quantity' => 1],
                ['variant_id' => variantOf($montre, 'Noir')->id, 'quantity' => 1],
            ]],
        ])->assertCreated()
            ->assertJsonPath('data.kind', 'pack')
            ->assertJsonPath('data.product_type.name', 'Montres')
            ->assertJsonPath('data.available', true)
            ->assertJsonCount(2, 'data.variants.0.components');

        // A pack needs no type at all.
        $this->postJson('/api/admin/products', ['kind' => 'pack', 'name' => 'Sans type', 'pack' => ['price' => 100, 'components' => [['variant_id' => variantOf($perfume, '10 ml')->id, 'quantity' => 1]]]])
            ->assertCreated()->assertJsonPath('data.product_type', null);
    });
});

describe('shop', function () {
    it('lists the product types with their categories, hidden ones left out', function () {
        category('Sport', watches());
        category('Caché', watches())->update(['is_active' => false]);
        glasses()->update(['is_active' => false]);

        $res = $this->getJson('/api/product-types')->assertOk();
        $montres = collect($res->json('data'))->firstWhere('slug', 'montres');

        expect(collect($res->json('data'))->pluck('slug')->all())->toBe(['montres'])
            ->and($montres['profile'])->toBe('standard')->and($montres['uses_gender'])->toBeTrue()
            ->and(collect($montres['categories'])->pluck('name')->all())->toBe(['Sport']);
    });

    it('filters the catalogue by product type, and by category inside it', function () {
        makePerfume('Parfum A', poolMl: 100);
        $gel = makeCosmetic('Gel B');
        $montre = makeCosmetic('Casio', ['Noir' => [6000, 4]], watches());
        $montre->update(['perfume_type_id' => category('Sport', watches())->id]);
        $gel->update(['perfume_type_id' => category('Sport', cosmetics())->id]);   // same category name, other type

        $names = fn (string $query) => collect($this->getJson("/api/products{$query}")->assertOk()->json('data'))->pluck('name')->sort()->values()->all();

        expect($names(''))->toBe(['Casio', 'Gel B', 'Parfum A'])
            ->and($names('?rayon=montres'))->toBe(['Casio'])
            ->and($names('?rayon=cosmetiques'))->toBe(['Gel B'])
            ->and($names('?rayon=montres&type=sport'))->toBe(['Casio'])
            ->and($names('?type=sport'))->toBe(['Casio', 'Gel B'])
            ->and($names('?kind=perfume,standard'))->toBe(['Casio', 'Gel B', 'Parfum A'])
            ->and($names('?kind=perfume'))->toBe(['Parfum A']);
        $this->getJson('/api/products?kind=toy')->assertUnprocessable();
    });

    it('shows a product page with its type, per-option availability and no stock numbers', function () {
        $montre = makeCosmetic('Casio', ['Argent' => [6500, 4], 'Doré' => [7500, 0]], watches());

        $this->getJson("/api/products/{$montre->slug}")->assertOk()
            ->assertJsonPath('data.kind', 'standard')
            ->assertJsonPath('data.product_type.slug', 'montres')
            ->assertJsonPath('data.product_type.uses_gender', true)
            ->assertJsonPath('data.variants.0.max_qty', 4)
            ->assertJsonPath('data.variants.1.available', false)
            ->assertJsonMissingPath('data.variants.0.stock_qty');
    });

    it('hides the products of a hidden product type', function () {
        makeCosmetic('Casio', ['Noir' => [6000, 4]], watches());
        makeCosmetic('Gel B');
        watches()->update(['is_active' => false]);

        $this->getJson('/api/products')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'Gel B');
        $this->getJson('/api/products/'.Product::where('name', 'Casio')->value('slug'))->assertNotFound();
    });

    it('hides a product that is out of stock when unavailable items are hidden', function () {
        makeCosmetic('Épuisé', ['Seul' => [500, 0]]);
        makeCosmetic('En stock', ['Seul' => [500, 3]]);

        $this->getJson('/api/products?kind=standard')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'En stock');
    });
});

describe('caisse', function () {
    it('sells a line at a negotiated price and keeps the catalogue price', function () {
        $this->actingAs(makeOwner());
        $gel = makeCosmetic('Fond de teint', ['Beige' => [1900, 5]]);
        $variant = variantOf($gel, 'Beige');

        $res = $this->postJson('/api/admin/pos/sales', [
            'lines' => [['variant_id' => $variant->id, 'quantity' => 2, 'unit_price' => 1700]],
            'payment_method' => 'especes',
            'amount_received' => 3400,
        ])->assertCreated()
            ->assertJsonPath('data.subtotal', 3400)
            ->assertJsonPath('data.total', 3400)
            ->assertJsonPath('data.items.0.unit_price', 1700)
            ->assertJsonPath('data.items.0.list_price', 1900)
            ->assertJsonPath('data.items.0.line_total', 3400);

        expect($res->json('data.change_due'))->toBe(0)
            ->and($variant->fresh()->stock_qty)->toBe(3)
            ->and($variant->fresh()->price)->toBe(1900);   // the catalogue price is untouched
    });

    it('lets the cashier still apply a discount on top of a negotiated price', function () {
        $this->actingAs(makeOwner());
        $variant = variantOf(makeCosmetic('Mascara', ['Noir' => [1000, 5]]), 'Noir');

        $this->postJson('/api/admin/pos/sales', [
            'lines' => [['variant_id' => $variant->id, 'quantity' => 1, 'unit_price' => 900]],
            'discount' => 100,
            'payment_method' => 'carte',
        ])->assertCreated()->assertJsonPath('data.total', 800);
    });

    it('uses the catalogue price when no price is given, and never lets an online client set one', function () {
        $this->actingAs(makeOwner());
        $variant = variantOf(makeCosmetic('Mascara', ['Noir' => [1000, 5]]), 'Noir');

        $this->postJson('/api/admin/pos/sales', ['lines' => lines([[$variant, 1]]), 'payment_method' => 'carte'])
            ->assertCreated()->assertJsonPath('data.items.0.unit_price', 1000);

        $order = app(OrderPlacement::class)->placeOnline(orderData([[$variant, 1]]) + ['lines' => [['variant_id' => $variant->id, 'quantity' => 1, 'unit_price' => 1]]]);
        expect($order->items->first()->unit_price)->toBe(1000);

        $this->postJson('/api/orders', orderData([[$variant, 1]]) + ['lines' => [['variant_id' => $variant->id, 'quantity' => 1, 'unit_price' => 1]]])->assertCreated();
        expect(OrderItem::query()->latest('id')->first()->unit_price)->toBe(1000);
    });

    it('rejects a negative price', function () {
        $this->actingAs(makeOwner());
        $variant = variantOf(makeCosmetic('Mascara', ['Noir' => [1000, 5]]), 'Noir');

        $this->postJson('/api/admin/pos/sales', ['lines' => [['variant_id' => $variant->id, 'quantity' => 1, 'unit_price' => -5]], 'payment_method' => 'carte'])
            ->assertUnprocessable();
    });
});

describe('starting types', function () {
    it('creates the four starting types and their categories, and can be limited to the ones a shop sells', function () {
        config(['shop.types' => ['parfums', 'cosmetiques']]);
        (new \Database\Seeders\ProductTypeSeeder)->run();

        expect(\App\Models\ProductType::query()->orderBy('sort_order')->pluck('slug')->all())->toBe(['parfums', 'cosmetiques']);

        config(['shop.types' => []]);
        (new \Database\Seeders\ProductTypeSeeder)->run();
        (new \Database\Seeders\ProductTypeSeeder)->run();   // twice: nothing is duplicated

        expect(\App\Models\ProductType::query()->count())->toBe(4)
            ->and(\App\Models\ProductType::query()->where('slug', 'montres')->first()->categories()->count())->toBe(4)
            ->and(\App\Models\ProductType::query()->where('slug', 'parfums')->first()->profile)->toBe(ProductKind::Perfume);
    });
});
