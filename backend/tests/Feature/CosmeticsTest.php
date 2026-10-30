<?php

use App\Enums\ProductKind;
use App\Enums\StockMode;
use App\Exceptions\InsufficientStockException;
use App\Exceptions\ShopException;
use App\Models\PerfumeType;
use App\Models\Product;
use App\Services\OrderWorkflow;
use App\Services\StockService;

function cosmeticType(string $name = 'Soin du corps'): PerfumeType
{
    return PerfumeType::firstOrCreate(['slug' => str($name)->slug()], ['name' => $name, 'kind' => 'cosmetic']);
}

function cosmeticPayload(array $overrides = []): array
{
    return array_merge([
        'kind' => 'cosmetic',
        'name' => 'Gel douche coco',
        'perfume_type_id' => cosmeticType()->id,
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
        'kind' => 'perfume',
        'name' => 'Oud Royal',
        'variants' => [['label' => '10 ml', 'ml' => 10, 'price' => 900, 'stock_mode' => 'pool']],
    ], $overrides);
}

describe('admin catalogue', function () {
    beforeEach(function () {
        $this->actingAs(makeOwner());
    });

    it('creates a cosmetic whose options need no millilitres', function () {
        $this->postJson('/api/admin/products', cosmeticPayload([
            'variants' => [
                ['label' => 'Rose nude', 'price' => 1200, 'stock_mode' => 'unit'],
                ['label' => 'Boîte de 24', 'price' => 800, 'stock_mode' => 'unit'],
            ],
        ]))->assertCreated()
            ->assertJsonPath('data.kind', 'cosmetic')
            ->assertJsonPath('data.slug', 'gel-douche-coco')
            ->assertJsonCount(2, 'data.variants')
            ->assertJsonPath('data.variants.0.ml', null)
            ->assertJsonPath('data.type.kind', 'cosmetic');
    });

    it('drops the perfume-only fields of a cosmetic', function () {
        $this->postJson('/api/admin/products', cosmeticPayload(['gender' => 'femme', 'inspired_by' => 'Dior', 'notes_top' => 'Rose']))
            ->assertCreated()
            ->assertJsonPath('data.gender', null)
            ->assertJsonPath('data.inspired_by', null)
            ->assertJsonPath('data.notes_top', null);
    });

    it('still requires millilitres for a perfume, and for a cosmetic poured from an ml stock', function () {
        $this->postJson('/api/admin/products', plainPerfumePayload(['variants' => [['label' => 'Grand', 'price' => 900, 'stock_mode' => 'unit']]]))
            ->assertUnprocessable()->assertJsonValidationErrors('variants.0.ml');

        $this->postJson('/api/admin/products', cosmeticPayload(['variants' => [['label' => 'Huile au ml', 'price' => 30, 'stock_mode' => 'pool']]]))
            ->assertUnprocessable()->assertJsonValidationErrors('variants.0.ml');
    });

    it('keeps perfume families and cosmetic categories apart', function () {
        $family = PerfumeType::firstOrCreate(['slug' => 'arabe'], ['name' => 'Arabe']);

        $this->postJson('/api/admin/products', cosmeticPayload(['perfume_type_id' => $family->id]))
            ->assertUnprocessable()->assertJsonValidationErrors('perfume_type_id');
        $this->postJson('/api/admin/products', plainPerfumePayload(['perfume_type_id' => cosmeticType()->id]))
            ->assertUnprocessable()->assertJsonValidationErrors('perfume_type_id');
    });

    it('lists categories with their kind and filters products by kind', function () {
        makePerfume('Un parfum');
        makeCosmetic('Un gel');
        $this->postJson('/api/admin/types', ['name' => 'Ongles', 'kind' => 'cosmetic'])->assertCreated()->assertJsonPath('data.kind', 'cosmetic');
        $this->postJson('/api/admin/types', ['name' => 'Floral'])->assertCreated()->assertJsonPath('data.kind', 'perfume');

        $this->getJson('/api/admin/products?kind=cosmetic')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'Un gel');
        $this->getJson('/api/admin/products?kind=perfume')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'Un parfum');
        $this->getJson('/api/admin/products')->assertOk()->assertJsonCount(2, 'data');
    });
});

describe('stock', function () {
    it('counts a cosmetic in units, takes it out on confirm and puts it back on cancel', function () {
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
        $variant = variantOf($gel, '250 ml');
        $variant->update(['stock_qty' => 0]);

        try {
            app(OrderWorkflow::class)->transition($order, 'confirm', makeOwner());
            $this->fail('Expected a stock shortage');
        } catch (InsufficientStockException $e) {
            expect($e->shortages[0]['unit'])->toBe('article(s)');
        }
    });

    it('sells a cosmetic by the millilitre from its own pool', function () {
        $huile = Product::create(['kind' => ProductKind::Cosmetic, 'name' => 'Huile corps', 'slug' => 'huile-corps']);
        $huile->variants()->create(['label' => '30 ml', 'ml' => 30, 'price' => 700, 'stock_mode' => StockMode::Pool]);
        app(StockService::class)->addEntry($huile, ml: 100);

        $order = placeOnline([[variantOf($huile->fresh('variants'), '30 ml'), 2]]);
        app(OrderWorkflow::class)->transition($order, 'confirm', makeOwner());

        expect(pooledMl($huile))->toBe(40);
    });

    it('receives stock on a cosmetic variant, but never opens a "bottle"', function () {
        $gel = makeCosmetic('Gel douche', ['250 ml' => [900, 0]]);
        $variant = variantOf($gel, '250 ml');
        $variant->update(['ml' => 250]);

        $this->actingAs(makeOwner())->postJson('/api/admin/stock/entries', ['product_id' => $gel->id, 'variant_id' => $variant->id, 'qty' => 12])->assertCreated();
        expect($variant->fresh()->stock_qty)->toBe(12);

        expect(fn () => app(StockService::class)->openBottle($variant->fresh()))->toThrow(ShopException::class);
    });

    it('flags a cosmetic as low in stock from the unit threshold', function () {
        $gel = makeCosmetic('Gel douche', ['250 ml' => [900, 2]]);
        $plenty = makeCosmetic('Savon', ['Pain' => [300, 40]]);

        $rows = collect($this->actingAs(makeOwner())->getJson('/api/admin/stock?kind=cosmetic')->assertOk()->json('data'))->keyBy('name');
        expect($rows['Gel douche']['status'])->toBe('low')->and($rows['Savon']['status'])->toBe('ok');

        $this->getJson('/api/admin/dashboard')->assertOk()->assertJsonFragment(['id' => $gel->id, 'units' => 2]);
        $this->getJson('/api/admin/products?low_stock=1')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $gel->id);

        expect($plenty->fresh()->id)->not->toBe($gel->id);
    });
});

describe('packs mixing perfumes and cosmetics', function () {
    it('is limited by its scarcest component and takes every component out of stock', function () {
        $perfume = makePerfume('Sauvage', poolMl: 100);
        $deo = makeCosmetic('Déodorant', ['Stick 50 ml' => [700, 3]]);
        $shampoo = makeCosmetic('Shampoing', ['250 ml' => [1100, 10]]);

        $pack = makePack([
            [variantOf($perfume, '10 ml'), 1],
            [variantOf($deo, 'Stick 50 ml'), 1],
            [variantOf($shampoo, '250 ml'), 2],
        ], price: 3500);

        $stock = app(StockService::class);
        expect($stock->maxQty($pack))->toBe(3);   // the deodorant runs out first

        $order = placeOnline([[$pack, 2]]);
        app(OrderWorkflow::class)->transition($order, 'confirm', makeOwner());

        expect(pooledMl($perfume))->toBe(80)
            ->and(variantOf($deo->fresh('variants'), 'Stick 50 ml')->stock_qty)->toBe(1)
            ->and(variantOf($shampoo->fresh('variants'), '250 ml')->stock_qty)->toBe(6)
            ->and($stock->maxQty($pack->fresh()))->toBe(1);
    });

    it('can be created from the admin with a cosmetic inside', function () {
        $this->actingAs(makeOwner());
        $perfume = makePerfume('Sauvage', poolMl: 100);
        $gel = makeCosmetic('Gel douche', ['250 ml' => [900, 5]]);

        $this->postJson('/api/admin/products', [
            'kind' => 'pack',
            'name' => 'Pack détente',
            'pack' => ['price' => 2500, 'components' => [
                ['variant_id' => variantOf($perfume, '10 ml')->id, 'quantity' => 1],
                ['variant_id' => variantOf($gel, '250 ml')->id, 'quantity' => 1],
            ]],
        ])->assertCreated()->assertJsonPath('data.available', true)->assertJsonCount(2, 'data.variants.0.components');
    });
});

describe('shop', function () {
    it('lists perfumes and cosmetics together, and can filter them', function () {
        makePerfume('Parfum A', poolMl: 100);
        makeCosmetic('Gel B');

        $this->getJson('/api/products?kind=perfume,cosmetic')->assertOk()->assertJsonCount(2, 'data');
        $this->getJson('/api/products?kind=cosmetic')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.kind', 'cosmetic');
        $this->getJson('/api/products?kind=perfume')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/products?kind=toy')->assertUnprocessable();
    });

    it('filters by cosmetic category and exposes the category kind', function () {
        $gel = makeCosmetic('Gel B');
        $gel->update(['perfume_type_id' => cosmeticType('Douche et bain')->id]);
        makeCosmetic('Savon C');

        $this->getJson('/api/products?type=douche-et-bain')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.type.kind', 'cosmetic');
        $this->getJson('/api/types')->assertOk()->assertJsonFragment(['slug' => 'douche-et-bain', 'kind' => 'cosmetic']);
    });

    it('shows a cosmetic page with per-option availability and no stock numbers', function () {
        $gel = makeCosmetic('Gel B', ['250 ml' => [900, 4], 'Maxi' => [2000, 0]]);

        $this->getJson("/api/products/{$gel->slug}")->assertOk()
            ->assertJsonPath('data.kind', 'cosmetic')
            ->assertJsonPath('data.available', true)
            ->assertJsonPath('data.variants.0.max_qty', 4)
            ->assertJsonPath('data.variants.1.available', false)
            ->assertJsonMissingPath('data.variants.0.stock_qty');
    });

    it('hides a cosmetic that is out of stock when unavailable items are hidden', function () {
        makeCosmetic('Épuisé', ['Seul' => [500, 0]]);
        makeCosmetic('En stock', ['Seul' => [500, 3]]);

        $this->getJson('/api/products?kind=cosmetic')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'En stock');
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

        $order = app(\App\Services\OrderPlacement::class)->placeOnline(orderData([[$variant, 1]]) + ['lines' => [['variant_id' => $variant->id, 'quantity' => 1, 'unit_price' => 1]]]);
        expect($order->items->first()->unit_price)->toBe(1000);

        $this->postJson('/api/orders', orderData([[$variant, 1]]) + ['lines' => [['variant_id' => $variant->id, 'quantity' => 1, 'unit_price' => 1]]])
            ->assertCreated();
        expect(\App\Models\OrderItem::query()->latest('id')->first()->unit_price)->toBe(1000);
    });

    it('rejects a negative price', function () {
        $this->actingAs(makeOwner());
        $variant = variantOf(makeCosmetic('Mascara', ['Noir' => [1000, 5]]), 'Noir');

        $this->postJson('/api/admin/pos/sales', ['lines' => [['variant_id' => $variant->id, 'quantity' => 1, 'unit_price' => -5]], 'payment_method' => 'carte'])
            ->assertUnprocessable();
    });
});

describe('stock filters', function () {
    it('filters the stock list by kind and by category', function () {
        $this->actingAs(makeOwner());
        makePerfume('Sauvage', poolMl: 100);
        $gel = makeCosmetic('Gel douche');
        $gel->update(['perfume_type_id' => cosmeticType('Douche et bain')->id]);
        makeCosmetic('Mascara', ['Noir' => [1000, 5]])->update(['perfume_type_id' => cosmeticType('Maquillage')->id]);

        $names = fn (string $query) => collect($this->getJson("/api/admin/stock{$query}")->assertOk()->json('data'))->pluck('name')->sort()->values()->all();

        expect($names(''))->toBe(['Gel douche', 'Mascara', 'Sauvage'])
            ->and($names('?kind=perfume'))->toBe(['Sauvage'])
            ->and($names('?kind=cosmetic'))->toBe(['Gel douche', 'Mascara'])
            ->and($names('?type_id='.cosmeticType('Maquillage')->id))->toBe(['Mascara']);
    });
});
