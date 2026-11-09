<?php

use App\Enums\OrderStatus;
use App\Services\StockService;

beforeEach(function () {
    config(['features.backorder' => true]);
    $this->p = makePerfume('Backorder Test', poolMl: 100, sealed: 2);   // 100 ml in the pool, 2 sealed bottles
    $this->v10 = variantOf($this->p, '10 ml');
    $this->sealed = variantOf($this->p, '100 ml scellé');
});

it('never tells the shop how much stock there is', function () {
    $res = $this->getJson("/api/products/{$this->p->slug}")->assertOk();

    foreach ($res->json('data.variants') as $variant) {
        expect($variant['max_qty'])->toBeIn([0, StockService::ORDER_MAX_QTY]);
    }
});

it('lets a customer order more than the stock, and the cart says it is fine', function () {
    // only 2 sealed bottles exist, the customer asks for 5
    $cart = $this->postJson('/api/cart/validate', ['lines' => [['variant_id' => $this->sealed->id, 'quantity' => 5]]])->assertOk();
    expect($cart->json('data.all_available'))->toBeTrue()->and($cart->json('data.lines.0.max_qty'))->toBe(StockService::ORDER_MAX_QTY);

    $order = placeOnline([[$this->sealed, 5]]);

    expect($order->status)->toBe(OrderStatus::EnAttente)->and($order->items->first()->quantity)->toBe(5);
});

it('still refuses an item that is no longer sold and a quantity above the cap', function () {
    $this->sealed->update(['stock_qty' => 0]);                     // no sealed bottle left: not listed any more
    expect(fn () => placeOnline([[$this->sealed, 1]]))->toThrow(\App\Exceptions\ShopException::class);

    expect(fn () => placeOnline([[$this->v10, 51]]))->toThrow(\App\Exceptions\ShopException::class);
});

it('shows the owner the stock left per line and whether the order can be confirmed', function () {
    $this->actingAs(makeOwner());
    $order = placeOnline([[$this->sealed, 5], [$this->v10, 1]]);

    $res = $this->getJson("/api/admin/orders/{$order->id}")->assertOk();
    $check = $res->json('data.stock_check');

    expect($check['possible'])->toBeFalse()
        ->and($check['shortages'])->toHaveCount(1)
        ->and(collect($check['lines'])->firstWhere('left', '2 flacon(s)')['ok'])->toBeFalse()
        ->and(collect($check['lines'])->firstWhere('left', '100 ml')['ok'])->toBeTrue();

    // confirming is refused until the stock is there
    $this->postJson("/api/admin/orders/{$order->id}/transition", ['action' => 'confirm'])->assertUnprocessable()->assertJsonStructure(['shortages']);
});

it('says an order is possible when the stock covers it, and counts lines that share the ml pool together', function () {
    $this->actingAs(makeOwner());
    $fits = placeOnline([[$this->v10, 3]]);                        // 30 ml of 100
    expect($this->getJson("/api/admin/orders/{$fits->id}")->json('data.stock_check.possible'))->toBeTrue();

    $v30 = variantOf($this->p, '30 ml');
    $shared = placeOnline([[$this->v10, 5], [$v30, 2]]);           // 50 + 60 = 110 ml of 100: each line alone fits, together not
    $check = $this->getJson("/api/admin/orders/{$shared->id}")->json('data.stock_check');

    expect($check['possible'])->toBeFalse()->and(collect($check['lines'])->every(fn ($l) => $l['ok'] === false))->toBeTrue();
});

it('lets the owner put an order aside until stock arrives, then confirm it once it is there', function () {
    $this->actingAs(makeOwner());
    $order = placeOnline([[$this->sealed, 4]]);

    $this->putJson("/api/admin/orders/{$order->id}", ['awaiting_stock' => true])->assertOk()->assertJsonPath('data.awaiting_stock', true)->assertJsonPath('data.status', 'en_attente');

    app(StockService::class)->addEntry($this->p, $this->sealed, qty: 3);   // the delivery arrives: 5 sealed bottles

    expect($this->getJson("/api/admin/orders/{$order->id}")->json('data.stock_check.possible'))->toBeTrue();
    $this->postJson("/api/admin/orders/{$order->id}/transition", ['action' => 'confirm'])->assertOk()->assertJsonPath('data.status', 'confirmee');
});
