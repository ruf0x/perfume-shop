<?php

use App\Models\Customer;
use App\Models\LoyaltyEntry;
use App\Models\LoyaltyReward;
use App\Services\LoyaltyService;
use App\Services\OrderPlacement;
use App\Services\OrderWorkflow;
use App\Services\StockService;

beforeEach(function () {
    $this->owner = makeOwner();
    $this->actingAs($this->owner);
    $this->p = makePerfume('Loyalty Test', poolMl: 2000, sealed: 10);
    $this->v10 = variantOf($this->p, '10 ml');                 // 1000 DA
    $this->v30 = variantOf($this->p, '30 ml');                 // 2500 DA
    $this->flacon = variantOf($this->p, '100 ml scellé');      // 9000 DA
});

/** A caisse sale for a customer identified by phone. */
function loyaltySale($test, array $items, string $phone = '0550111222')
{
    return app(OrderPlacement::class)->placePos(['lines' => lines($items), 'amount_received' => 1000000, 'phone' => $phone, 'first_name' => 'Karim', 'last_name' => 'Test'], $test->owner);
}

function loyaltyOf(string $phone = '0550111222'): array
{
    return app(LoyaltyService::class)->progress(Customer::query()->where('phone', '+213550111222')->orWhere('phone', $phone)->firstOrFail());
}

it('counts every perfume of a completed sale, whatever its size, and the count follows the customer over several orders', function () {
    loyaltySale($this, [[$this->v10, 2]]);
    loyaltySale($this, [[$this->flacon, 1]]);
    expect(LoyaltyEntry::count())->toBe(3);

    $p = loyaltyOf();
    expect($p['counted'])->toBe(3)->and($p['pending'])->toBe([])->and($p['every'])->toBe(6);
});

it('earns a gift at six perfumes, valued at the average price of those six, and keeps the surplus', function () {
    loyaltySale($this, [[$this->v10, 4]]);                       // 4 x 1000
    loyaltySale($this, [[$this->v30, 2], [$this->v10, 1]]);      // 2 x 2500 + 1 x 1000 => 7 perfumes in total

    $p = loyaltyOf();
    // the first six: 4 x 1000 + 2 x 2500 = 9000 / 6 = 1500
    expect($p['pending'])->toHaveCount(1)->and($p['pending'][0]['average_price'])->toBe(1500)->and($p['counted'])->toBe(1)->and($p['total'])->toBe(7);
});

it('does not count online orders until they are delivered, nor cancelled ones', function () {
    $order = placeOnline([[$this->v10, 6]], ['phone' => '0550111222']);
    expect(LoyaltyEntry::count())->toBe(0);

    $workflow = app(OrderWorkflow::class);
    $workflow->transition($order, 'confirm', $this->owner);
    $workflow->transition($order->fresh(), 'ship', $this->owner, ['delivery_company' => 'Yalidine']);
    $workflow->transition($order->fresh(), 'deliver', $this->owner);

    expect(LoyaltyEntry::count())->toBe(6)->and(LoyaltyReward::count())->toBe(1);
});

it('never counts the products that are not perfumes', function () {
    $gel = makeCosmetic('Gel fidélité', ['250 ml' => [900, 20]]);
    loyaltySale($this, [[variantOf($gel, '250 ml'), 8]]);

    expect(LoyaltyEntry::count())->toBe(0);
});

it('gives the gift as a zero-price sale: stock taken, nothing counted, the reward marked as given', function () {
    loyaltySale($this, [[$this->v10, 6]]);
    $customer = Customer::firstOrFail();
    $before = $this->flacon->fresh()->stock_qty;

    $res = $this->postJson("/api/admin/customers/{$customer->id}/loyalty/redeem", ['variant_id' => $this->flacon->id])->assertOk();

    expect($res->json('data.loyalty.pending'))->toBe([])->and($res->json('data.loyalty.given'))->toBe(1)
        ->and($res->json('data.history.0.gift_value'))->toBe(9000)                 // worth more than the 1000 average: allowed
        ->and($this->flacon->fresh()->stock_qty)->toBe($before - 1)
        ->and(LoyaltyEntry::count())->toBe(6);                                      // the gift did not count as a purchase

    $giftOrder = \App\Models\Order::query()->latest('id')->first();
    expect($giftOrder->total)->toBe(0)->and($giftOrder->items->first()->unit_price)->toBe(0)->and($giftOrder->admin_note)->toContain('Cadeau fidélité');
});

it('refuses a gift when none is earned, or when it is not a sealed perfume flacon', function () {
    loyaltySale($this, [[$this->v10, 2]]);
    $customer = Customer::firstOrFail();

    $this->postJson("/api/admin/customers/{$customer->id}/loyalty/redeem", ['variant_id' => $this->flacon->id])->assertUnprocessable();

    loyaltySale($this, [[$this->v10, 4]]);
    $this->postJson("/api/admin/customers/{$customer->id}/loyalty/redeem", ['variant_id' => $this->v10->id])->assertUnprocessable();   // a decant is not a gift flacon
});

it('shows the progress to the caisse by phone number and to the owner on the order and the client', function () {
    loyaltySale($this, [[$this->v10, 4]]);
    $customer = Customer::firstOrFail();

    $this->getJson('/api/admin/loyalty?phone=0550111222')->assertOk()->assertJsonPath('data.loyalty.counted', 4)->assertJsonPath('data.customer.id', $customer->id);
    $this->getJson('/api/admin/loyalty?phone=0770999888')->assertOk()->assertJsonPath('data.customer', null);

    $this->getJson("/api/admin/customers/{$customer->id}")->assertOk()->assertJsonPath('data.loyalty.counted', 4);

    config(['features.backorder' => true]);
    $pending = placeOnline([[$this->v10, 3]], ['phone' => '0550111222']);
    $this->getJson("/api/admin/orders/{$pending->id}")->assertOk()->assertJsonPath('data.customer.loyalty.counted', 4)->assertJsonPath('data.customer.loyalty.adds', 3);
});

it('does nothing when the programme is off, and can count older orders afterwards', function () {
    config(['features.loyalty_every' => null]);
    loyaltySale($this, [[$this->v10, 6]]);
    expect(LoyaltyEntry::count())->toBe(0)->and(app(LoyaltyService::class)->progress(Customer::firstOrFail()))->toBeNull();

    config(['features.loyalty_every' => 6]);
    $this->artisan('loyalty:backfill')->assertSuccessful();
    expect(LoyaltyEntry::count())->toBe(6)->and(LoyaltyReward::count())->toBe(1);

    $this->artisan('loyalty:backfill')->assertSuccessful();      // safe to run again
    expect(LoyaltyEntry::count())->toBe(6);
});
