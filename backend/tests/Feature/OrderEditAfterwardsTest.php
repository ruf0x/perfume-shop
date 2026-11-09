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

// ───────────────────────────── adding a client ─────────────────────────────

it('searches the clients by name or phone, for the staff too', function () {
    caisseSale($this, 1, ['phone' => '0550123456', 'first_name' => 'Amel', 'last_name' => 'Benali']);
    caisseSale($this, 1, ['phone' => '0661000111', 'first_name' => 'Karim', 'last_name' => 'Saidi']);

    expect($this->getJson('/api/admin/customers/search?q=amel')->assertOk()->json('data'))->toHaveCount(1);
    expect($this->getJson('/api/admin/customers/search?q=Amel Ben')->json('data.0.phone'))->not->toBeNull();
    expect($this->getJson('/api/admin/customers/search?q=0661')->json('data.0.first_name'))->toBe('Karim');
    $this->getJson('/api/admin/customers/search?q=a')->assertUnprocessable();

    $staff = \App\Models\User::create(['name' => 'Staff', 'username' => 'staff1', 'password' => 'secret-pass', 'role' => \App\Enums\UserRole::Staff]);
    $this->actingAs($staff)->getJson('/api/admin/customers/search?q=karim')->assertOk()->assertJsonCount(1, 'data');
});

it('needs the first name, last name and phone together to create a client at the caisse', function () {
    $sale = fn (array $client) => $this->postJson('/api/admin/pos/sales', ['lines' => lines([[$this->v10, 1]]), 'payment_method' => 'especes', 'amount_received' => 5000] + $client);

    $sale(['phone' => '0550123456'])->assertUnprocessable()->assertJsonValidationErrors(['first_name', 'last_name']);
    $sale(['first_name' => 'Amel', 'last_name' => 'Benali'])->assertUnprocessable()->assertJsonValidationErrors(['phone']);
    $sale([])->assertCreated();                                                       // no client at all is fine
    $sale(['phone' => '0550123456', 'first_name' => 'Amel', 'last_name' => 'Benali'])->assertCreated();
});

it('places a new client in Oran, Oran unless the sale says otherwise', function () {
    $oran = \App\Models\Wilaya::query()->find(31) ?? makeWilaya(31);
    $commune = \App\Models\Commune::firstOrCreate(['wilaya_id' => 31, 'name' => 'Oran']);
    $other = makeWilaya(16);
    $alger = \App\Models\Commune::firstOrCreate(['wilaya_id' => 16, 'name' => 'Alger Centre']);

    caisseSale($this, 1, ['phone' => '0550123456', 'first_name' => 'Amel', 'last_name' => 'Benali']);
    $amel = Customer::where('first_name', 'Amel')->firstOrFail();
    expect($amel->wilaya_id)->toBe(31)->and($amel->commune_id)->toBe($commune->id);

    caisseSale($this, 1, ['phone' => '0661000111', 'first_name' => 'Karim', 'last_name' => 'Saidi', 'wilaya_id' => 16, 'commune_id' => $alger->id]);
    expect(Customer::where('first_name', 'Karim')->first()->wilaya_id)->toBe(16);

    caisseSale($this, 1, ['phone' => '0661000111', 'first_name' => 'Karim', 'last_name' => 'Saidi']);   // a known client keeps their place
    expect(Customer::where('first_name', 'Karim')->first()->wilaya_id)->toBe(16);

    expect(fn () => caisseSale($this, 1, ['phone' => '0770000222', 'first_name' => 'X', 'last_name' => 'Y', 'wilaya_id' => 31, 'commune_id' => $alger->id]))->toThrow(\App\Exceptions\ShopException::class);
});

it('creates a new client from a finished sale only with a name, and places them in Oran', function () {
    \App\Models\Wilaya::query()->find(31) ?? makeWilaya(31);
    \App\Models\Commune::firstOrCreate(['wilaya_id' => 31, 'name' => 'Oran']);
    $sale = caisseSale($this, 1);

    $this->putJson("/api/admin/orders/{$sale->id}", ['phone' => '0550123456'])->assertUnprocessable();          // no name: not enough to create a client
    $this->putJson("/api/admin/orders/{$sale->id}", ['phone' => '0550123456', 'first_name' => 'Amel', 'last_name' => 'Benali'])->assertOk();

    expect(Customer::firstOrFail()->wilaya_id)->toBe(31);
});

it('tells the shop where a new client is placed by default', function () {
    \App\Models\Wilaya::query()->find(31) ?? makeWilaya(31);
    $commune = \App\Models\Commune::firstOrCreate(['wilaya_id' => 31, 'name' => 'Oran']);

    $this->getJson('/api/settings/public')->assertOk()->assertJsonPath('data.default_location.wilaya_id', 31)->assertJsonPath('data.default_location.commune_id', $commune->id);
});
