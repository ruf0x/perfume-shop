<?php

use App\Services\OrderPlacement;

beforeEach(function () {
    $this->owner = makeOwner();
    $this->actingAs($this->owner);
    $this->p = makePerfume('Profit Test', poolMl: 500);
});

function sellAtCaisse($test, array $items, array $extra = [])
{
    return app(OrderPlacement::class)->placePos(['lines' => $items, 'amount_received' => 100000] + $extra, $test->owner);
}

it('saves the purchase price of a variant and shows it to the admin only', function () {
    $v = variantOf($this->p, '10 ml');
    $v->update(['cost_price' => 600]);

    expect($v->fresh()->unitCost())->toBe(600);

    $this->getJson("/api/admin/products/{$this->p->id}")->assertOk()->assertJsonPath('data.variants.0.cost_price', 600);
    $this->flushHeaders();
    $this->app['auth']->forgetGuards();
    $this->getJson("/api/products/{$this->p->slug}")->assertOk()->assertJsonMissingPath('data.variants.0.cost_price');
});

it('freezes the cost on the sold line and computes the profit in DA and in percent of the cost', function () {
    $v10 = variantOf($this->p, '10 ml');
    $v10->update(['cost_price' => 600]);

    sellAtCaisse($this, [['variant_id' => $v10->id, 'quantity' => 2]]);          // sold 2 x 1000, cost 2 x 600
    $v10->update(['cost_price' => 900]);                                           // a later price change must not rewrite it

    $d = $this->getJson('/api/admin/dashboard')->assertOk()->json('data.profit');

    expect($d['revenue'])->toBe(2000)->and($d['cost'])->toBe(1200)->and($d['amount'])->toBe(800)
        ->and($d['percent'])->toBe(66.7)->and($d['orders_without_cost'])->toBe(0);
});

it('uses the negotiated price and takes the order discount off the profit', function () {
    $v10 = variantOf($this->p, '10 ml');
    $v10->update(['cost_price' => 600]);

    sellAtCaisse($this, [['variant_id' => $v10->id, 'quantity' => 1, 'unit_price' => 900]], ['discount' => 100]);

    $d = $this->getJson('/api/admin/dashboard')->json('data.profit');

    expect($d['revenue'])->toBe(800)->and($d['amount'])->toBe(200);
});

it('leaves out the orders with an unknown cost instead of counting them as pure profit', function () {
    $v10 = variantOf($this->p, '10 ml');
    $v20 = variantOf($this->p, '20 ml');
    $v10->update(['cost_price' => 600]);

    sellAtCaisse($this, [['variant_id' => $v10->id, 'quantity' => 1]]);
    sellAtCaisse($this, [['variant_id' => $v20->id, 'quantity' => 1]]);            // no cost entered
    sellAtCaisse($this, [['variant_id' => $v10->id, 'quantity' => 1], ['variant_id' => $v20->id, 'quantity' => 1]]);

    $d = $this->getJson('/api/admin/dashboard')->json('data.profit');

    expect($d['orders_counted'])->toBe(1)->and($d['orders_without_cost'])->toBe(2)->and($d['amount'])->toBe(400);
});

it('costs a pack as the sum of its components, and nothing when one is unknown', function () {
    $v10 = variantOf($this->p, '10 ml');
    $v20 = variantOf($this->p, '20 ml');
    $pack = makePack([[$v10, 2], [$v20, 1]], 3000);

    expect($pack->unitCost())->toBeNull();

    $v10->update(['cost_price' => 600]);
    $v20->update(['cost_price' => 1000]);

    expect($pack->fresh()->unitCost())->toBe(2200);
});
