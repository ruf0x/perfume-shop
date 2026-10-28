<?php

use App\Enums\UserRole;
use App\Models\Customer;
use App\Models\Order;
use App\Models\StockMovement;
use App\Models\User;
use App\Models\Wilaya;

beforeEach(function () {
    $this->owner = makeOwner();
    $this->actingAs($this->owner);
    $this->p = makePerfume('Sauvage', poolMl: 300, sealed: 2);
});

function staff(): User
{
    return User::create(['name' => 'Staff', 'username' => 'staff-'.\Illuminate\Support\Str::random(4), 'password' => 'secret-pass', 'role' => UserRole::Staff]);
}

// ───────────────────────────── stock ─────────────────────────────

it('shows the stock per perfume with a status', function () {
    makePerfume('Presque vide', poolMl: 5);
    makePerfume('Épuisé');

    $res = $this->getJson('/api/admin/stock')->assertOk();
    $byName = collect($res->json('data'))->keyBy('name');

    expect($byName['Sauvage']['status'])->toBe('ok')
        ->and($byName['Sauvage']['stock_ml'])->toBe(300)
        ->and($byName['Sauvage']['sealed'][0]['stock_qty'])->toBe(2)
        ->and($byName['Presque vide']['status'])->toBe('low')
        ->and($byName['Épuisé']['status'])->toBe('out')
        ->and($res->json('low_stock_threshold_ml'))->toBe(10);

    expect($this->getJson('/api/admin/stock?status=out')->json('data'))->toHaveCount(1);
    expect($this->getJson('/api/admin/stock?q=sauv')->json('data'))->toHaveCount(1);
});

it('receives stock in millilitres and in sealed bottles', function () {
    $full = variantOf($this->p, '100 ml scellé');

    $this->postJson('/api/admin/stock/entries', ['product_id' => $this->p->id, 'ml' => 200, 'unit_cost' => 5200, 'note' => '2 flacons à décanter'])
        ->assertCreated()->assertJsonPath('data.stock_ml', 500);
    $this->postJson('/api/admin/stock/entries', ['product_id' => $this->p->id, 'variant_id' => $full->id, 'qty' => 3])
        ->assertCreated()->assertJsonPath('data.sealed.0.stock_qty', 5);

    $this->postJson('/api/admin/stock/entries', ['product_id' => $this->p->id])->assertUnprocessable();
    $this->postJson('/api/admin/stock/entries', ['product_id' => $this->p->id, 'ml' => -5])->assertUnprocessable();
    $this->postJson('/api/admin/stock/entries', ['product_id' => 9999, 'ml' => 5])->assertUnprocessable()->assertJsonValidationErrors('product_id');
});

it('records adjustments and losses and never goes below zero', function () {
    $this->postJson('/api/admin/stock/adjustments', ['product_id' => $this->p->id, 'type' => 'perte', 'ml_change' => -20, 'note' => 'Renversé'])
        ->assertCreated()->assertJsonPath('data.stock_ml', 280);
    $this->postJson('/api/admin/stock/adjustments', ['product_id' => $this->p->id, 'type' => 'ajustement', 'ml_change' => 15, 'note' => 'Inventaire'])
        ->assertCreated()->assertJsonPath('data.stock_ml', 295);

    $this->postJson('/api/admin/stock/adjustments', ['product_id' => $this->p->id, 'type' => 'perte', 'ml_change' => -999, 'note' => 'x'])->assertUnprocessable();
    $this->postJson('/api/admin/stock/adjustments', ['product_id' => $this->p->id, 'type' => 'perte', 'ml_change' => -1])->assertUnprocessable()->assertJsonValidationErrors('note');
    expect(pooledMl($this->p))->toBe(295);
});

it('opens a sealed bottle into the pool', function () {
    $full = variantOf($this->p, '100 ml scellé');

    $this->postJson('/api/admin/stock/open-bottle', ['variant_id' => $full->id])
        ->assertOk()->assertJsonPath('data.stock_ml', 400)->assertJsonPath('data.sealed.0.stock_qty', 1);
    $this->postJson('/api/admin/stock/open-bottle', ['variant_id' => variantOf($this->p, '10 ml')->id])->assertUnprocessable();
});

it('lists the stock movements with filters', function () {
    $order = placeOnline([[variantOf($this->p, '30 ml'), 1]]);
    $this->postJson("/api/admin/orders/{$order->id}/transition", ['action' => 'confirm']);

    $all = $this->getJson('/api/admin/stock/movements')->assertOk();
    expect($all->json('meta.total'))->toBe(3);  // 2 entries + 1 sale

    $sales = $this->getJson('/api/admin/stock/movements?type=vente_en_ligne')->json('data');
    expect($sales)->toHaveCount(1)
        ->and($sales[0]['ml_change'])->toBe(-30)
        ->and($sales[0]['order']['reference'])->toBe($order->reference)
        ->and($sales[0]['user'])->toBe($this->owner->name);

    expect($this->getJson("/api/admin/stock/movements?order_id={$order->id}")->json('meta.total'))->toBe(1);
    expect($this->getJson("/api/admin/stock/movements?product_id={$this->p->id}&from=".now()->addDay()->toDateString())->json('meta.total'))->toBe(0);
});

// ───────────────────────────── caisse ─────────────────────────────

it('records a caisse sale with change due, updating the stock', function () {
    $res = $this->postJson('/api/admin/pos/sales', [
        'lines' => lines([[variantOf($this->p, '30 ml'), 2]]),
        'payment_method' => 'especes',
        'amount_received' => 6000,
        'discount' => 500,
        'first_name' => 'Walid', 'phone' => '0550999888',
    ])->assertCreated();

    expect($res->json('data.reference'))->toBe('POS-000001')
        ->and($res->json('data.total'))->toBe(4500)
        ->and($res->json('data.change_due'))->toBe(1500)
        ->and($res->json('data.status'))->toBe('vendue_boutique')
        ->and($res->json('data.created_by'))->toBe($this->owner->name)
        ->and($res->json('data.items.0.quantity'))->toBe(2)
        ->and(pooledMl($this->p))->toBe(240)
        ->and(Customer::where('phone', '0550999888')->exists())->toBeTrue();
});

it('refuses a caisse sale that is short of stock or cash and records nothing', function () {
    $this->postJson('/api/admin/pos/sales', ['lines' => lines([[variantOf($this->p, '30 ml'), 11]]), 'payment_method' => 'carte'])
        ->assertUnprocessable()->assertJsonStructure(['shortages']);
    $this->postJson('/api/admin/pos/sales', ['lines' => lines([[variantOf($this->p, '30 ml'), 1]]), 'payment_method' => 'especes', 'amount_received' => 100])
        ->assertUnprocessable();
    $this->postJson('/api/admin/pos/sales', ['lines' => lines([[variantOf($this->p, '30 ml'), 1]]), 'payment_method' => 'cod'])
        ->assertUnprocessable()->assertJsonValidationErrors('payment_method');

    expect(Order::count())->toBe(0)->and(pooledMl($this->p))->toBe(300);
});

it('lets staff use the caisse', function () {
    $this->actingAs(staff())->postJson('/api/admin/pos/sales', ['lines' => lines([[variantOf($this->p, '10 ml'), 1]]), 'payment_method' => 'carte'])->assertCreated();
});

// ───────────────────────────── customers ─────────────────────────────

it('lists, searches and blacklists customers', function () {
    placeOnline([[variantOf($this->p, '10 ml'), 1]], ['first_name' => 'Nadia', 'phone' => '0661111111']);
    placeOnline([[variantOf($this->p, '10 ml'), 1]], ['first_name' => 'Omar', 'phone' => '0772222222']);
    $omar = Customer::where('phone', '0772222222')->first();

    expect($this->getJson('/api/admin/customers')->json('meta.total'))->toBe(2);
    expect($this->getJson('/api/admin/customers?q=nad')->json('data'))->toHaveCount(1);

    $this->patchJson("/api/admin/customers/{$omar->id}", ['is_blacklisted' => true, 'note' => 'Faux ordres'])
        ->assertOk()->assertJsonPath('data.is_blacklisted', true);
    expect($this->getJson('/api/admin/customers?blacklisted=1')->json('data'))->toHaveCount(1);

    // and that blocks new online orders from this phone
    $this->postJson('/api/orders', orderData([[variantOf($this->p, '10 ml'), 1]], ['phone' => '0772222222']))->assertUnprocessable();
    // the orders of a customer
    expect($this->getJson("/api/admin/orders?customer_id={$omar->id}")->json('meta.total'))->toBe(1);
});

// ───────────────────────────── settings / wilayas ─────────────────────────────

it('reads and saves the shop settings, which change what the storefront does', function () {
    $this->getJson('/api/admin/settings')->assertOk()->assertJsonPath('data.low_stock_threshold_ml', 10)->assertJsonPath('data.show_unavailable', false);

    $this->putJson('/api/admin/settings', [
        'shop_name' => 'Parfumerie Elégance',
        'socials' => ['instagram' => 'https://instagram.com/elegance'],
        'show_unavailable' => true,
        'low_stock_threshold_ml' => 50,
        'free_delivery_over' => 8000,
    ])->assertOk()->assertJsonPath('data.shop_name', 'Parfumerie Elégance');

    $this->getJson('/api/settings/public')->assertJsonPath('data.shop_name', 'Parfumerie Elégance')->assertJsonPath('data.free_delivery_over', 8000);
    // 300 ml is above the new 50 ml threshold, 40 ml is below it
    $this->getJson('/api/products')->assertJsonPath('data.0.available', true);

    $this->putJson('/api/admin/settings', ['low_stock_threshold_ml' => -1, 'free_delivery_over' => 'abc'])->assertUnprocessable()
        ->assertJsonValidationErrors(['low_stock_threshold_ml', 'free_delivery_over']);
    // internal counters are not exposed as settings
    expect(array_keys($this->getJson('/api/admin/settings')->json('data')))->not->toContain('counter.online');
});

it('edits delivery fees per wilaya and switches a wilaya off', function () {
    makeWilaya(16);

    $this->putJson('/api/admin/wilayas/16', ['home_fee' => 450, 'desk_fee' => 300])->assertOk()->assertJsonPath('data.home_fee', 450);
    $this->putJson('/api/admin/wilayas/16', ['is_active' => false])->assertOk();
    $this->getJson('/api/admin/wilayas')->assertOk()->assertJsonPath('data.0.is_active', false);
    $this->getJson('/api/wilayas')->assertJsonCount(0, 'data');
    $this->putJson('/api/admin/wilayas/16', ['home_fee' => -5])->assertUnprocessable();
    expect(Wilaya::find(16)->home_fee)->toBe(450);
});

// ───────────────────────────── users ─────────────────────────────

it('manages admin accounts', function () {
    $id = $this->postJson('/api/admin/users', ['name' => 'Karim', 'username' => 'karim', 'password' => 'long-password', 'role' => 'staff'])
        ->assertCreated()->assertJsonPath('data.role', 'staff')->assertJsonMissingPath('data.password')->json('data.id');

    $this->postJson('/api/admin/users', ['name' => 'Dup', 'username' => 'karim', 'password' => 'long-password', 'role' => 'staff'])->assertUnprocessable()->assertJsonValidationErrors('username');
    $this->postJson('/api/admin/users', ['name' => 'Weak', 'username' => 'weak', 'password' => '123', 'role' => 'staff'])->assertUnprocessable()->assertJsonValidationErrors('password');

    $this->putJson("/api/admin/users/{$id}", ['is_active' => false, 'name' => 'Karim B.'])->assertOk()->assertJsonPath('data.is_active', false);
    $this->deleteJson("/api/admin/users/{$id}")->assertNoContent();
    expect(User::find($id))->toBeNull();
});

it('never leaves the shop without an active owner, nor lets you remove yourself', function () {
    $this->deleteJson("/api/admin/users/{$this->owner->id}")->assertUnprocessable();
    $this->putJson("/api/admin/users/{$this->owner->id}", ['role' => 'staff'])->assertUnprocessable();
    $this->putJson("/api/admin/users/{$this->owner->id}", ['is_active' => false])->assertUnprocessable();

    $second = User::create(['name' => 'Second', 'username' => 'second', 'password' => 'secret-pass', 'role' => UserRole::Owner]);
    $this->putJson("/api/admin/users/{$second->id}", ['role' => 'staff'])->assertOk();   // another owner remains (you)
    $this->putJson("/api/admin/users/{$this->owner->id}", ['role' => 'staff'])->assertUnprocessable(); // still can't demote yourself
});

// ───────────────────────────── roles ─────────────────────────────

it('keeps every owner-only route closed to staff', function (string $method, string $url) {
    $this->actingAs(staff())->json($method, $url)->assertForbidden();
})->with([
    ['GET', '/api/admin/dashboard'],
    ['GET', '/api/admin/customers'],
    ['PATCH', '/api/admin/customers/1'],
    ['GET', '/api/admin/settings'],
    ['PUT', '/api/admin/settings'],
    ['GET', '/api/admin/wilayas'],
    ['PUT', '/api/admin/wilayas/16'],
    ['GET', '/api/admin/users'],
    ['POST', '/api/admin/users'],
    ['POST', '/api/admin/stock/entries'],
    ['POST', '/api/admin/stock/adjustments'],
    ['POST', '/api/admin/stock/open-bottle'],
    ['POST', '/api/admin/products'],
    ['DELETE', '/api/admin/images/1'],
]);

it('lets staff read the stock', function () {
    $this->actingAs(staff());

    $this->getJson('/api/admin/stock')->assertOk();
    $this->getJson('/api/admin/stock/movements')->assertOk();
});

// ───────────────────────────── dashboard ─────────────────────────────

it('computes the dashboard from completed sales, split by channel', function () {
    $v10 = variantOf($this->p, '10 ml');
    $v30 = variantOf($this->p, '30 ml');

    // online order delivered today: 2 x 30 ml + 600 delivery = 5600
    $delivered = placeOnline([[$v30, 2]]);
    foreach (['confirm', 'ship', 'deliver'] as $action) {
        $this->postJson("/api/admin/orders/{$delivered->id}/transition", ['action' => $action])->assertOk();
    }
    // caisse sale: 1 x 10 ml = 1000
    app(\App\Services\OrderPlacement::class)->placePos(['lines' => lines([[$v10, 1]]), 'amount_received' => 1000], $this->owner);
    // a cancelled online order, a pending one, one in delivery
    $cancelled = placeOnline([[$v10, 1]]);
    $this->postJson("/api/admin/orders/{$cancelled->id}/transition", ['action' => 'cancel']);
    placeOnline([[$v10, 1]]);
    $shipping = placeOnline([[$v10, 1]]);
    foreach (['confirm', 'ship'] as $action) {
        $this->postJson("/api/admin/orders/{$shipping->id}/transition", ['action' => $action]);
    }
    // delivered long ago: outside today's range
    $old = placeOnline([[$v10, 1]]);
    foreach (['confirm', 'ship', 'deliver'] as $action) {
        $this->postJson("/api/admin/orders/{$old->id}/transition", ['action' => $action]);
    }
    $old->forceFill(['completed_at' => now()->subDays(20), 'created_at' => now()->subDays(20)])->save();

    $d = $this->getJson('/api/admin/dashboard')->assertOk()->json('data');

    expect($d['revenue'])->toBe(6600)
        ->and($d['revenue_online'])->toBe(5600)
        ->and($d['revenue_pos'])->toBe(1000)
        ->and($d['orders_count'])->toBe(5)            // delivered, pos, cancelled, pending, shipping
        ->and($d['online_orders_count'])->toBe(4)
        ->and($d['pos_orders_count'])->toBe(1)
        ->and($d['pending_count'])->toBe(1)
        ->and($d['in_delivery_count'])->toBe(1)
        ->and($d['cancel_rate'])->toEqual(25)
        ->and($d['sales_by_day'])->toHaveCount(1)
        ->and($d['sales_by_day'][0])->toMatchArray(['revenue' => 6600, 'revenue_online' => 5600, 'revenue_pos' => 1000, 'orders' => 2])
        ->and($d['top_products'][0])->toMatchArray(['product' => 'Sauvage', 'variant' => '30 ml', 'quantity' => 2]);

    $month = $this->getJson('/api/admin/dashboard?from='.now()->subDays(30)->toDateString().'&to='.now()->toDateString())->json('data');
    // 6600 today + the old order (1000 + 600 delivery)
    expect($month['revenue'])->toBe(8200)->and($month['sales_by_day'])->toHaveCount(31);
});

it('lists the perfumes running out of stock on the dashboard', function () {
    makePerfume('Presque vide', poolMl: 4);
    makePerfume('Scellé seul', poolMl: 0, sealed: 1);   // sealed bottle left => not "low"

    $low = $this->getJson('/api/admin/dashboard')->json('data.low_stock');

    expect(collect($low)->pluck('name')->all())->toBe(['Presque vide']);
});

it('validates the dashboard range', function () {
    $this->getJson('/api/admin/dashboard?from=2026-01-01&to=2025-01-01')->assertUnprocessable();
    $this->getJson('/api/admin/dashboard?from=2020-01-01&to=2026-01-01')->assertUnprocessable()->assertJsonPath('message', 'La période ne peut pas dépasser 366 jours.');
});
