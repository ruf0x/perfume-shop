<?php

use App\Models\Customer;
use App\Models\LoyaltyEntry;
use App\Models\LoyaltyReward;
use App\Services\OrderPlacement;
use App\Services\OrderWorkflow;

beforeEach(function () {
    $this->owner = makeOwner();
    $this->actingAs($this->owner);
    $this->p = makePerfume('Edit Test', poolMl: 2000, sealed: 5);
    $this->v10 = variantOf($this->p, '10 ml');
});

/** A caisse sale, optionally for a client. */
function caisseSale($test, int $qty = 1, array $extra = [])
{
    return app(OrderPlacement::class)->placePos(['lines' => lines([[$test->v10, $qty]]), 'amount_received' => 100000] + $extra, $test->owner);
}

it('adds the forgotten client to a completed caisse sale, which creates the customer', function () {
    $sale = caisseSale($this, 2);
    expect($sale->customer_id)->toBeNull();

    $this->putJson("/api/admin/orders/{$sale->id}", ['first_name' => 'Amel', 'last_name' => 'Benali', 'phone' => '0550123456'])
        ->assertOk()->assertJsonPath('data.status', 'vendue_boutique')->assertJsonPath('data.customer.first_name', 'Amel');

    $customer = Customer::firstOrFail();
    expect($sale->fresh()->customer_id)->toBe($customer->id)->and($customer->orders_count)->toBe(1)->and($customer->first_name)->toBe('Amel');
});

it('counts the perfumes of that sale for the new client, so the loyalty gift can be earned afterwards', function () {
    $sale = caisseSale($this, 6);                                       // six perfumes sold without a client
    expect(LoyaltyEntry::count())->toBe(0);

    $this->putJson("/api/admin/orders/{$sale->id}", ['phone' => '0550123456', 'first_name' => 'Amel', 'last_name' => 'Benali'])->assertOk();

    expect(LoyaltyEntry::count())->toBe(6)->and(LoyaltyReward::count())->toBe(1);
});

it('attaches the sale to an existing client by phone instead of duplicating them', function () {
    caisseSale($this, 1, ['phone' => '0550123456', 'first_name' => 'Amel', 'last_name' => 'Benali']);
    $second = caisseSale($this, 1);

    $this->putJson("/api/admin/orders/{$second->id}", ['phone' => '0550123456'])->assertOk();

    expect(Customer::count())->toBe(1)->and(Customer::first()->orders_count)->toBe(2);
});

it('moves an order to the right client when the number was wrong, with its counters and loyalty perfumes', function () {
    $sale = caisseSale($this, 6, ['phone' => '0550111111', 'first_name' => 'Faux', 'last_name' => 'Numero']);
    $wrong = Customer::firstOrFail();
    expect(LoyaltyReward::count())->toBe(1);                            // the wrong client earned a gift

    $this->putJson("/api/admin/orders/{$sale->id}", ['phone' => '0550222222', 'first_name' => 'Vrai', 'last_name' => 'Client'])->assertOk();

    $right = Customer::where('first_name', 'Vrai')->firstOrFail();
    expect($wrong->fresh()->orders_count)->toBe(0)
        ->and($right->orders_count)->toBe(1)
        ->and(LoyaltyEntry::where('customer_id', $wrong->id)->count())->toBe(0)
        ->and(LoyaltyReward::where('customer_id', $wrong->id)->count())->toBe(0)      // the unused gift is cancelled
        ->and(LoyaltyReward::where('customer_id', $right->id)->count())->toBe(1);     // and now belongs to the right client
});

it('changes how a caisse sale was paid, and refuses cash that does not cover the total', function () {
    $sale = caisseSale($this, 1);                                       // paid in cash

    $this->putJson("/api/admin/orders/{$sale->id}", ['payment_method' => 'carte'])->assertOk()->assertJsonPath('data.payment_method', 'carte')->assertJsonPath('data.amount_received', null);
    $this->putJson("/api/admin/orders/{$sale->id}", ['payment_method' => 'especes', 'amount_received' => 10])->assertUnprocessable();
    $this->putJson("/api/admin/orders/{$sale->id}", ['payment_method' => 'especes', 'amount_received' => 2000])->assertOk()->assertJsonPath('data.amount_received', 2000);
});

it('keeps the items, the discount and the delivery locked once an order is completed, and the payment to the caisse', function () {
    $sale = caisseSale($this, 1);

    $this->putJson("/api/admin/orders/{$sale->id}", ['discount' => 100])->assertUnprocessable();
    $this->putJson("/api/admin/orders/{$sale->id}", ['lines' => lines([[$this->v10, 3]])])->assertUnprocessable();

    $online = placeOnline([[$this->v10, 1]]);
    $this->putJson("/api/admin/orders/{$online->id}", ['payment_method' => 'carte'])->assertUnprocessable();
});

it('lets the owner fix the client of a delivered order, and writes it in the history', function () {
    $order = placeOnline([[$this->v10, 2]]);
    $workflow = app(OrderWorkflow::class);
    $workflow->transition($order, 'confirm', $this->owner);
    $workflow->transition($order->fresh(), 'ship', $this->owner, ['delivery_company' => 'Yalidine']);
    $workflow->transition($order->fresh(), 'deliver', $this->owner);

    $this->putJson("/api/admin/orders/{$order->id}", ['address' => 'Nouvelle adresse 5', 'admin_note' => 'adresse corrigée'])->assertOk()->assertJsonPath('data.address', 'Nouvelle adresse 5');

    expect($order->fresh()->history()->where('note', 'Informations modifiées')->exists())->toBeTrue();
});
