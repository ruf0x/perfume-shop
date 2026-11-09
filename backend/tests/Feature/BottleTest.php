<?php

use App\Enums\StockMovementType;
use App\Models\BottleSize;
use App\Services\BottleService;
use App\Services\OrderPlacement;
use App\Services\OrderWorkflow;
use App\Services\StockService;

beforeEach(function () {
    $this->owner = makeOwner();
    $this->actingAs($this->owner);
    $this->p = makePerfume('Bottle Test', poolMl: 500, sealed: 2);
    $this->v10 = variantOf($this->p, '10 ml');
    $this->v20 = variantOf($this->p, '20 ml');
});

function sellDecants($test, array $items)
{
    return app(OrderPlacement::class)->placePos(['lines' => lines($items), 'amount_received' => 100000], $test->owner);
}

it('does not limit a size the shop does not count', function () {
    expect(app(StockService::class)->maxQty($this->v10))->toBe(50);   // 500 ml / 10 ml

    sellDecants($this, [[$this->v10, 3]]);

    expect(BottleSize::count())->toBe(0);
});

it('takes one bottle of the right size per decant sold, and records it', function () {
    app(BottleService::class)->addEntry(10, 20, 2000, 'Fournisseur', $this->owner);
    app(BottleService::class)->addEntry(20, 5, 1000, null, $this->owner);

    sellDecants($this, [[$this->v10, 3], [$this->v20, 2]]);

    expect(BottleSize::where('ml', 10)->value('qty'))->toBe(17)->and(BottleSize::where('ml', 20)->value('qty'))->toBe(3);
});

it('never counts a sealed bottle, only decants', function () {
    app(BottleService::class)->addEntry(10, 5, null, null, $this->owner);

    sellDecants($this, [[variantOf($this->p, '100 ml scellé'), 1]]);

    expect(BottleSize::where('ml', 10)->value('qty'))->toBe(5);
});

it('refuses a decant when its bottles run out, and the shop stops listing the size', function () {
    app(BottleService::class)->addEntry(10, 2, null, null, $this->owner);

    expect(app(StockService::class)->maxQty($this->v10))->toBe(2);
    expect(fn () => sellDecants($this, [[$this->v10, 3]]))->toThrow(\App\Exceptions\InsufficientStockException::class);

    sellDecants($this, [[$this->v10, 2]]);

    expect(app(StockService::class)->maxQty($this->v10))->toBe(0)
        ->and(BottleSize::where('ml', 10)->value('qty'))->toBe(0);
    expect($this->getJson("/api/products/{$this->p->slug}")->json('data.variants.0.available'))->toBeFalse();
});

it('gives the bottles back when a confirmed order is cancelled', function () {
    app(BottleService::class)->addEntry(10, 10, null, null, $this->owner);
    $order = placeOnline([[$this->v10, 4]]);

    app(OrderWorkflow::class)->transition($order, 'confirm', $this->owner);
    expect(BottleSize::where('ml', 10)->value('qty'))->toBe(6);

    app(OrderWorkflow::class)->transition($order->fresh(), 'cancel', $this->owner, ['reason' => 'test']);
    expect(BottleSize::where('ml', 10)->value('qty'))->toBe(10);
});

it('shows the owner the bottles left on a pending order, and flags a shortage', function () {
    config(['features.backorder' => true]);   // the customer may order more than the bottles left
    app(BottleService::class)->addEntry(10, 2, null, null, $this->owner);
    $order = placeOnline([[$this->v10, 3]]);

    $check = $this->getJson("/api/admin/orders/{$order->id}")->json('data.stock_check');

    expect($check['possible'])->toBeFalse()
        ->and(collect($check['shortages'])->firstWhere('unit', 'bouteille(s)')['available'])->toBe(2)
        ->and($check['lines'][0]['left'])->toContain('2 bouteille(s) de 10 ml');
});

it('reports the investment: bought, left, spent and the average price of a bottle', function () {
    $bottles = app(BottleService::class);
    $bottles->addEntry(10, 100, 5000, null, $this->owner);     // 50 DA each
    $bottles->addEntry(10, 100, 7000, null, $this->owner);     // 70 DA each
    $bottles->adjust(10, -4, StockMovementType::Perte, 'cassées', $this->owner);

    $res = $this->getJson('/api/admin/bottles')->assertOk();

    expect($res->json('data.0'))->toMatchArray(['ml' => 10, 'qty' => 196, 'bought' => 200, 'invested' => 12000, 'unit_cost' => 60, 'value_left' => 11760])
        ->and($res->json('totals.invested'))->toBe(12000);
});

it('saves entries and corrections through the API, and refuses to go below zero', function () {
    $this->postJson('/api/admin/bottles/entries', ['ml' => 20, 'quantity' => 30, 'total_cost' => 1500])->assertCreated()->assertJsonPath('data.qty', 30);
    $this->postJson('/api/admin/bottles/adjustments', ['ml' => 20, 'quantity' => -5, 'type' => 'perte', 'note' => 'cassées'])->assertOk()->assertJsonPath('data.qty', 25);
    $this->postJson('/api/admin/bottles/adjustments', ['ml' => 20, 'quantity' => -99, 'type' => 'perte', 'note' => 'x'])->assertUnprocessable();
    $this->postJson('/api/admin/bottles/adjustments', ['ml' => 20, 'quantity' => -1, 'type' => 'perte'])->assertUnprocessable();   // a note is required

    $this->getJson('/api/admin/bottles/movements?ml=20')->assertOk()->assertJsonCount(2, 'data');
});
