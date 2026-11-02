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

it('refuses a gift when none is earned, or when it is not a perfume', function () {
    loyaltySale($this, [[$this->v10, 2]]);
    $customer = Customer::firstOrFail();

    $this->postJson("/api/admin/customers/{$customer->id}/loyalty/redeem", ['variant_id' => $this->flacon->id])->assertUnprocessable();

    loyaltySale($this, [[$this->v10, 4]]);
    $gel = makeCosmetic('Gel cadeau', ['250 ml' => [900, 5]]);
    $this->postJson("/api/admin/customers/{$customer->id}/loyalty/redeem", ['variant_id' => variantOf($gel, '250 ml')->id])->assertUnprocessable();   // a cosmetic is not a perfume gift
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

it('starts a new count after each gift: 6 earns one, the gift does not count, 3 + 3 more earn the next', function () {
    loyaltySale($this, [[$this->v10, 6]]);                                             // first gift earned
    $customer = Customer::firstOrFail();
    $this->postJson("/api/admin/customers/{$customer->id}/loyalty/redeem", ['variant_id' => $this->flacon->id])->assertOk();

    loyaltySale($this, [[$this->v30, 3]]);                                             // a month later: 3 more
    $p = app(LoyaltyService::class)->progress($customer);
    expect($p['counted'])->toBe(3)->and($p['total'])->toBe(9)->and($p['pending'])->toBe([])->and($p['given'])->toBe(1);

    loyaltySale($this, [[$this->v10, 3]]);                                             // 12 perfumes bought in all
    $p = app(LoyaltyService::class)->progress($customer);
    expect($p['counted'])->toBe(0)->and($p['total'])->toBe(12)->and($p['pending'])->toHaveCount(1)->and($p['given'])->toBe(1)
        ->and($p['pending'][0]['average_price'])->toBe(1750);                          // (3 x 2500 + 3 x 1000) / 6: only the 6 new perfumes

    $this->postJson("/api/admin/customers/{$customer->id}/loyalty/redeem", ['variant_id' => $this->flacon->id])->assertOk();
    expect(app(LoyaltyService::class)->progress($customer)['given'])->toBe(2)->and(LoyaltyEntry::count())->toBe(12);
});

it('counts the perfumes inside a pack, each at its share of the pack price, and ignores the other items', function () {
    $watch = makeCosmetic('Montre test', ['Noir' => [7000, 5]]);
    $pack = makePack([[$this->v10, 2], [variantOf($watch, 'Noir'), 1]], 6000);        // 2 x 1000 (perfume) + 7000 (watch) = 9000 list, sold 6000

    loyaltySale($this, [[$pack, 1]]);

    $entries = LoyaltyEntry::orderBy('id')->get();
    expect($entries)->toHaveCount(2)
        ->and($entries->pluck('unit_price')->all())->toBe([667, 667])                  // 1000 x 6000 / 9000
        ->and(loyaltyOf()['counted'])->toBe(2);
});

// ───────────────────────────── rounds of six, and gifts around the average ─────────────────────────────

it('cuts the perfumes into rounds of six, each with its perfumes, its average and its gift', function () {
    loyaltySale($this, [[$this->v10, 6]]);                                             // round 1: 6 x 1000
    $customer = Customer::firstOrFail();
    $this->postJson("/api/admin/customers/{$customer->id}/loyalty/redeem", ['variant_id' => $this->flacon->id])->assertOk();
    loyaltySale($this, [[$this->v30, 6]]);                                             // round 2: 6 x 2500
    loyaltySale($this, [[$this->v10, 2]]);                                             // round 3 in progress: 2 perfumes

    $tiers = $this->getJson("/api/admin/customers/{$customer->id}/loyalty")->assertOk()->json('data.tiers');

    expect($tiers)->toHaveCount(3)
        ->and($tiers[0])->toMatchArray(['number' => 1, 'from' => 0, 'to' => 6, 'complete' => true, 'average' => 1000])
        ->and($tiers[0]['reward']['status'])->toBe('given')->and($tiers[0]['reward']['gift_name'])->toContain('Loyalty Test')
        ->and($tiers[0]['perfumes'])->toHaveCount(6)->and($tiers[0]['perfumes'][0]['order'])->toStartWith('POS-')
        ->and($tiers[1])->toMatchArray(['number' => 2, 'from' => 6, 'to' => 12, 'complete' => true, 'average' => 2500])
        ->and($tiers[1]['reward']['status'])->toBe('pending')
        ->and($tiers[2])->toMatchArray(['number' => 3, 'from' => 12, 'to' => 18, 'complete' => false, 'average' => 1000, 'reward' => null])
        ->and($tiers[2]['perfumes'])->toHaveCount(2);
});

it('lets the gift be a decant size as well as a flacon', function () {
    loyaltySale($this, [[$this->v10, 6]]);
    $customer = Customer::firstOrFail();
    $mlBefore = $this->p->fresh()->stock_ml;

    $this->postJson("/api/admin/customers/{$customer->id}/loyalty/redeem", ['variant_id' => $this->v30->id])->assertOk();

    expect($this->p->fresh()->stock_ml)->toBe($mlBefore - 30)
        ->and(LoyaltyReward::first()->gift_name)->toBe('Loyalty Test (30 ml)')
        ->and(LoyaltyEntry::count())->toBe(6);                                          // a gift never counts
});

it('suggests the perfumes in stock worth about the average, closest first', function () {
    loyaltySale($this, [[$this->v10, 6]]);                                             // average 1000: from 750 to 1250
    $customer = Customer::firstOrFail();
    $other = makePerfume('Autre parfum', poolMl: 500, sealed: 2);                      // also has a 10 ml at 1000
    $dear = makePerfume('Parfum cher', poolMl: 500);
    $dear->variants()->where('label', '10 ml')->update(['price' => 1240]);             // inside the range
    $cheap = makePerfume('Parfum moins cher', poolMl: 500);
    $cheap->variants()->where('label', '10 ml')->update(['price' => 800]);             // below the average: must not overflow the unsigned price
    $far = makePerfume('Parfum trop cher', poolMl: 500);
    $far->variants()->where('label', '10 ml')->update(['price' => 1300]);              // outside it
    $empty = makePerfume('Parfum vide', poolMl: 0);                                    // no stock: not offered

    $res = $this->getJson("/api/admin/customers/{$customer->id}/loyalty/suggestions")->assertOk();
    $names = collect($res->json('data.items'))->map(fn ($i) => $i['product'].' '.$i['label']);

    expect($res->json('data.average'))->toBe(1000)->and($res->json('data.from'))->toBe(750)->and($res->json('data.to'))->toBe(1250)
        ->and($names)->toContain('Autre parfum 10 ml')->toContain('Parfum cher 10 ml')->toContain('Parfum moins cher 10 ml')
        ->and($names)->not->toContain('Parfum trop cher 10 ml')->not->toContain('Parfum vide 10 ml')
        ->and($res->json('data.items.0.gap'))->toBe(0)->and($res->json('data.items.0.kind'))->toBe('ml');

    $other->variants()->count();
});

it('has no suggestions when no gift is waiting', function () {
    loyaltySale($this, [[$this->v10, 2]]);

    $this->getJson('/api/admin/customers/'.Customer::firstOrFail()->id.'/loyalty/suggestions')->assertOk()->assertJsonPath('data', null);
});
