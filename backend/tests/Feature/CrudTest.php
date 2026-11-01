<?php

use App\Enums\StockMovementType;
use App\Models\BottleMovement;
use App\Models\BottleSize;
use App\Models\Customer;
use App\Models\LoyaltyEntry;
use App\Models\LoyaltyReward;
use App\Models\Order;
use App\Services\BottleService;
use App\Services\OrderPlacement;
use App\Services\OrderWorkflow;
use App\Services\StockService;

beforeEach(function () {
    $this->owner = makeOwner();
    $this->actingAs($this->owner);
    $this->p = makePerfume('Crud Test', poolMl: 1000, sealed: 5);
    $this->v10 = variantOf($this->p, '10 ml');
    $this->flacon = variantOf($this->p, '100 ml scellé');
});

function crudSale($test, int $qty = 1, array $extra = [])
{
    return app(OrderPlacement::class)->placePos(['lines' => lines([[$test->v10, $qty]]), 'amount_received' => 1000000] + $extra, $test->owner);
}

// ───────────────────────────── orders ─────────────────────────────

it('deletes a caisse sale made by mistake: stock, bottles, counters and loyalty perfumes go back', function () {
    app(BottleService::class)->addEntry(10, 20, null, null, $this->owner);
    $sale = crudSale($this, 6, ['phone' => '0550123456', 'first_name' => 'Amel', 'last_name' => 'Benali']);
    expect($this->p->fresh()->stock_ml)->toBe(940)->and(BottleSize::first()->qty)->toBe(14)->and(LoyaltyReward::count())->toBe(1);

    $this->deleteJson("/api/admin/orders/{$sale->id}")->assertOk();

    expect(Order::count())->toBe(0)
        ->and($this->p->fresh()->stock_ml)->toBe(1000)
        ->and(BottleSize::first()->qty)->toBe(20)
        ->and(Customer::first()->orders_count)->toBe(0)
        ->and(LoyaltyEntry::count())->toBe(0)->and(LoyaltyReward::count())->toBe(0);
});

it('deletes a pending or cancelled online order, and refuses one that is confirmed, shipped or delivered', function () {
    $pending = placeOnline([[$this->v10, 1]]);
    $this->deleteJson("/api/admin/orders/{$pending->id}")->assertOk();

    $confirmed = placeOnline([[$this->v10, 1]]);
    app(OrderWorkflow::class)->transition($confirmed, 'confirm', $this->owner);
    $this->deleteJson("/api/admin/orders/{$confirmed->id}")->assertUnprocessable();

    app(OrderWorkflow::class)->transition($confirmed->fresh(), 'cancel', $this->owner, ['reason' => 'x']);
    $this->deleteJson("/api/admin/orders/{$confirmed->id}")->assertOk();
    expect($this->p->fresh()->stock_ml)->toBe(1000);                            // the cancellation had already put it back
});

it('makes a gift available again when the order that gave it is deleted', function () {
    crudSale($this, 6, ['phone' => '0550123456', 'first_name' => 'Amel', 'last_name' => 'Benali']);
    $customer = Customer::firstOrFail();
    $this->postJson("/api/admin/customers/{$customer->id}/loyalty/redeem", ['variant_id' => $this->flacon->id])->assertOk();
    $giftOrder = Order::latest('id')->first();
    expect(LoyaltyReward::first()->given_at)->not->toBeNull();

    $this->deleteJson("/api/admin/orders/{$giftOrder->id}")->assertOk();

    expect(LoyaltyReward::first()->given_at)->toBeNull()->and($this->flacon->fresh()->stock_qty)->toBe(5);
});

it('lets only the owner delete an order', function () {
    $sale = crudSale($this);
    $staff = \App\Models\User::create(['name' => 'Staff', 'username' => 'staff2', 'password' => 'secret-pass', 'role' => \App\Enums\UserRole::Staff]);

    $this->actingAs($staff)->deleteJson("/api/admin/orders/{$sale->id}")->assertForbidden();
});

// ───────────────────────────── clients ─────────────────────────────

it('edits a client completely: name, phone, wilaya, commune, address; refuses a number that is taken', function () {
    crudSale($this, 1, ['phone' => '0550123456', 'first_name' => 'Amel', 'last_name' => 'Benali']);
    crudSale($this, 1, ['phone' => '0661000111', 'first_name' => 'Karim', 'last_name' => 'Saidi']);
    $amel = Customer::where('first_name', 'Amel')->firstOrFail();
    $oldPhone = $amel->phone;
    makeWilaya(16);
    $alger = \App\Models\Commune::firstOrCreate(['wilaya_id' => 16, 'name' => 'Alger Centre']);

    $this->patchJson("/api/admin/customers/{$amel->id}", ['first_name' => 'Amal', 'phone' => '0770999888', 'wilaya_id' => 16, 'commune_id' => $alger->id, 'address' => '12 rue X'])
        ->assertOk()->assertJsonPath('data.first_name', 'Amal')->assertJsonPath('data.address', '12 rue X');
    expect($amel->fresh()->phone)->not->toBe($oldPhone);

    $this->patchJson("/api/admin/customers/{$amel->id}", ['phone' => '0661000111'])->assertUnprocessable();
    $this->patchJson("/api/admin/customers/{$amel->id}", ['wilaya_id' => 16, 'commune_id' => 999999])->assertUnprocessable();
});

it('deletes a client: their orders stay, without a client; their loyalty goes with them', function () {
    $sale = crudSale($this, 6, ['phone' => '0550123456', 'first_name' => 'Amel', 'last_name' => 'Benali']);
    $customer = Customer::firstOrFail();

    $this->deleteJson("/api/admin/customers/{$customer->id}")->assertOk();

    expect(Customer::count())->toBe(0)->and($sale->fresh()->customer_id)->toBeNull()->and($sale->fresh()->first_name)->toBe('Amel')
        ->and(LoyaltyEntry::count())->toBe(0)->and(LoyaltyReward::count())->toBe(0);
});

// ───────────────────────────── bottles ─────────────────────────────

it('renames a bottle size and refuses one that already exists', function () {
    $bottles = app(BottleService::class);
    $size = $bottles->addEntry(100, 10, null, null, $this->owner);          // typed 100 instead of 10
    $bottles->addEntry(20, 5, null, null, $this->owner);

    $this->putJson("/api/admin/bottles/{$size->id}", ['ml' => 10])->assertOk()->assertJsonPath('data.ml', 10);
    $this->putJson("/api/admin/bottles/{$size->id}", ['ml' => 20])->assertUnprocessable();
});

it('corrects an entry of bottles: the count follows, and never goes below zero', function () {
    app(BottleService::class)->addEntry(10, 100, 5000, null, $this->owner);
    $entry = BottleMovement::firstOrFail();

    $this->putJson("/api/admin/bottles/movements/{$entry->id}", ['quantity' => 120, 'total_cost' => 6000, 'note' => 'recompté'])->assertOk()->assertJsonPath('data.qty', 120);
    expect($entry->fresh()->total_cost)->toBe(6000);

    crudSale($this, 100);                                                    // 100 bottles used
    $this->putJson("/api/admin/bottles/movements/{$entry->id}", ['quantity' => 50])->assertUnprocessable();
    $this->deleteJson("/api/admin/bottles/movements/{$entry->id}")->assertUnprocessable();                 // they were used already
});

it('deletes an entry or a loss by hand, but not the movements made by sales', function () {
    $bottles = app(BottleService::class);
    $bottles->addEntry(10, 50, null, null, $this->owner);
    $bottles->adjust(10, -5, StockMovementType::Perte, 'cassées', $this->owner);
    crudSale($this, 2);

    $loss = BottleMovement::where('type', 'perte')->firstOrFail();
    $sale = BottleMovement::where('type', 'vente_caisse')->firstOrFail();

    $this->deleteJson("/api/admin/bottles/movements/{$loss->id}")->assertOk();
    expect(BottleSize::first()->qty)->toBe(48);                              // 50 - 2 sold, the loss undone
    $this->deleteJson("/api/admin/bottles/movements/{$sale->id}")->assertUnprocessable();
    $this->putJson("/api/admin/bottles/movements/{$sale->id}", ['quantity' => 1])->assertUnprocessable();
});

it('stops tracking a size: decants of that size are no longer limited', function () {
    $size = app(BottleService::class)->addEntry(10, 1, null, null, $this->owner);
    expect(app(StockService::class)->maxQty($this->v10))->toBe(1);

    $this->deleteJson("/api/admin/bottles/{$size->id}")->assertOk();

    expect(BottleSize::count())->toBe(0)->and(app(StockService::class)->maxQty($this->v10))->toBe(100);
});
