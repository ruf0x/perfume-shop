<?php

use App\Enums\UserRole;
use App\Models\Order;
use App\Models\StockMovement;
use App\Models\User;

beforeEach(function () {
    $this->owner = makeOwner();
    $this->p = makePerfume('Sauvage', poolMl: 300, sealed: 2);
});

function admin(): \Illuminate\Foundation\Testing\TestCase
{
    return test()->actingAs(test()->owner);
}

it('lists orders with per-status counts that ignore the status filter', function () {
    $a = placeOnline([[variantOf($this->p, '10 ml'), 1]]);
    $b = placeOnline([[variantOf($this->p, '10 ml'), 1]]);
    placeOnline([[variantOf($this->p, '10 ml'), 1]]);
    admin()->postJson("/api/admin/orders/{$a->id}/transition", ['action' => 'confirm'])->assertOk();
    admin()->postJson("/api/admin/orders/{$b->id}/transition", ['action' => 'cancel'])->assertOk();

    $res = admin()->getJson('/api/admin/orders?status=en_attente')->assertOk();

    expect($res->json('data'))->toHaveCount(1)
        ->and($res->json('counts'))->toMatchArray(['all' => 3, 'en_attente' => 1, 'confirmee' => 1, 'annulee' => 1, 'livree' => 0]);
});

it('filters by channel, date range, wilaya, total range and search', function () {
    placeOnline([[variantOf($this->p, '10 ml'), 1]], ['first_name' => 'Karim', 'last_name' => 'Zerrouki', 'phone' => '0661000001']);
    placeOnline([[variantOf($this->p, '30 ml'), 2]], ['first_name' => 'Sara', 'phone' => '0771000002']);
    $old = placeOnline([[variantOf($this->p, '20 ml'), 1]], ['first_name' => 'Ancien']);
    $old->forceFill(['created_at' => now()->subDays(10)])->save();
    app(\App\Services\OrderPlacement::class)->placePos(['lines' => lines([[variantOf($this->p, '10 ml'), 1]]), 'amount_received' => 5000], $this->owner);

    $count = fn (string $qs) => admin()->getJson("/api/admin/orders?{$qs}")->assertOk()->json('meta.total');

    expect($count('channel=pos'))->toBe(1)
        ->and($count('channel=online'))->toBe(3)
        ->and($count('from='.now()->subDays(2)->toDateString()))->toBe(3)
        ->and($count('to='.now()->subDays(5)->toDateString()))->toBe(1)
        ->and($count('wilaya_id=16'))->toBe(3)
        ->and($count('wilaya_id=31'))->toBe(0)
        ->and($count('min_total=5000'))->toBe(1)                // 2 x 2500 + 600
        ->and($count('max_total=1700&channel=online'))->toBe(1)
        ->and($count('q=Zerrouki'))->toBe(1)
        ->and($count('q=0771000002'))->toBe(1)
        ->and($count('q=Karim%20Zerrouki'))->toBe(1)
        ->and($count('q=CMD-000002'))->toBe(1);
});

it('sorts by total', function () {
    placeOnline([[variantOf($this->p, '10 ml'), 1]]);
    placeOnline([[variantOf($this->p, '30 ml'), 3]]);

    $totals = fn (string $dir) => collect(admin()->getJson("/api/admin/orders?sort=total&dir={$dir}")->json('data'))->pluck('total')->all();

    expect($totals('desc'))->toBe([8100, 1600])->and($totals('asc'))->toBe([1600, 8100]);
});

it('rejects invalid filters', function () {
    admin()->getJson('/api/admin/orders?status=nope&sort=price&per_page=1000')->assertUnprocessable()
        ->assertJsonValidationErrors(['status', 'sort', 'per_page']);
});

it('shows an order with client, items, history and the actions it allows', function () {
    $order = placeOnline([[variantOf($this->p, '20 ml'), 2]], ['customer_note' => 'Appelez avant 18h']);

    admin()->getJson("/api/admin/orders/{$order->id}")->assertOk()
        ->assertJsonPath('data.customer.first_name', 'Amine')
        ->assertJsonPath('data.customer.phone', '0550123456')
        ->assertJsonPath('data.wilaya.name', 'Wilaya 16')
        ->assertJsonPath('data.items.0.product_name', 'Sauvage')
        ->assertJsonPath('data.items.0.line_total', 3600)
        ->assertJsonPath('data.total', 4200)
        ->assertJsonPath('data.customer_note', 'Appelez avant 18h')
        ->assertJsonPath('data.allowed_actions', ['confirm', 'no_answer', 'cancel'])
        ->assertJsonCount(1, 'data.history');
});

it('runs the whole lifecycle through the API and moves stock', function () {
    $order = placeOnline([[variantOf($this->p, '30 ml'), 2]]);
    $url = "/api/admin/orders/{$order->id}/transition";

    admin()->postJson($url, ['action' => 'no_answer'])->assertOk()->assertJsonPath('data.call_attempts', 1);
    admin()->postJson($url, ['action' => 'confirm'])->assertOk()->assertJsonPath('data.status', 'confirmee');
    expect(pooledMl($this->p))->toBe(240);

    admin()->postJson($url, ['action' => 'ship', 'delivery_company' => 'Yalidine', 'tracking_number' => 'YAL-1'])
        ->assertOk()->assertJsonPath('data.status', 'en_livraison')->assertJsonPath('data.allowed_actions', ['deliver', 'return']);
    admin()->postJson($url, ['action' => 'deliver'])->assertOk()->assertJsonPath('data.status', 'livree')
        ->assertJsonPath('data.allowed_actions', [])->assertJsonCount(5, 'data.history'); // created, no answer, confirmed, shipped, delivered
});

it('answers 422 with a French message for invalid transitions and short stock', function () {
    $order = placeOnline([[variantOf($this->p, '30 ml'), 1]]);

    admin()->postJson("/api/admin/orders/{$order->id}/transition", ['action' => 'deliver'])
        ->assertUnprocessable()->assertJsonPath('message', 'Action « deliver » impossible pour une commande « En attente ».');
    admin()->postJson("/api/admin/orders/{$order->id}/transition", ['action' => 'explode'])
        ->assertUnprocessable()->assertJsonValidationErrors('action');

    $this->p->update(['stock_ml' => 5]);
    admin()->postJson("/api/admin/orders/{$order->id}/transition", ['action' => 'confirm'])
        ->assertUnprocessable()->assertJsonPath('shortages.0.available', 5);
    expect($order->fresh()->status->value)->toBe('en_attente');
});

it('lets the admin reopen a cancelled order through the API', function () {
    $order = placeOnline([[variantOf($this->p, '10 ml'), 1]]);
    $url = "/api/admin/orders/{$order->id}/transition";
    admin()->postJson($url, ['action' => 'cancel', 'reason' => 'Test'])->assertOk()->assertJsonPath('data.allowed_actions', ['reopen']);

    admin()->postJson($url, ['action' => 'reopen'])->assertOk()
        ->assertJsonPath('data.status', 'en_attente')
        ->assertJsonPath('data.cancel_reason', null)
        ->assertJsonPath('data.allowed_actions', ['confirm', 'no_answer', 'cancel']);

    admin()->postJson($url, ['action' => 'reopen'])->assertUnprocessable();   // pending orders cannot be "reopened"
});

it('lets staff confirm orders', function () {
    $staff = User::create(['name' => 'S', 'username' => 'staff', 'password' => 'secret-pass', 'role' => UserRole::Staff]);
    $order = placeOnline([[variantOf($this->p, '10 ml'), 1]]);

    $this->actingAs($staff)->postJson("/api/admin/orders/{$order->id}/transition", ['action' => 'confirm'])->assertOk();
});

it('edits a pending order: items, fee, discount, client details', function () {
    $v10 = variantOf($this->p, '10 ml');
    $v20 = variantOf($this->p, '20 ml');
    $order = placeOnline([[$v10, 1]]);
    $v10->update(['price' => 9999]); // price changed since the order: existing lines keep their snapshot

    admin()->putJson("/api/admin/orders/{$order->id}", [
        'lines' => [['variant_id' => $v10->id, 'quantity' => 3], ['variant_id' => $v20->id, 'quantity' => 1]],
        'delivery_fee' => 400,
        'discount' => 200,
        'first_name' => 'Yacine',
        'phone' => '+213661234567',
        'admin_note' => 'Client a changé d\'avis',
    ])->assertOk()
        ->assertJsonPath('data.subtotal', 3 * 1000 + 1800)
        ->assertJsonPath('data.total', 4800 + 400 - 200)
        ->assertJsonPath('data.customer.first_name', 'Yacine')
        ->assertJsonPath('data.customer.phone', '0661234567')
        ->assertJsonCount(2, 'data.items');

    expect($order->fresh()->stock_deducted)->toBeFalse()->and(pooledMl($this->p))->toBe(300);
});

it('re-takes the stock when a confirmed order is edited, and cancelling afterwards restores the right amount', function () {
    $v30 = variantOf($this->p, '30 ml');
    $order = placeOnline([[$v30, 1]]);
    admin()->postJson("/api/admin/orders/{$order->id}/transition", ['action' => 'confirm']);
    expect(pooledMl($this->p))->toBe(270);

    admin()->putJson("/api/admin/orders/{$order->id}", ['lines' => [['variant_id' => $v30->id, 'quantity' => 3]]])->assertOk();
    expect(pooledMl($this->p))->toBe(210)->and($order->fresh()->stock_deducted)->toBeTrue();

    admin()->postJson("/api/admin/orders/{$order->id}/transition", ['action' => 'cancel'])->assertOk();
    expect(pooledMl($this->p))->toBe(300)  // not 330: only the net of all movements is reversed
        ->and((int) StockMovement::where('order_id', $order->id)->sum('ml_change'))->toBe(0);
});

it('rolls the whole edit back when the new quantities exceed the stock', function () {
    $v30 = variantOf($this->p, '30 ml');
    $order = placeOnline([[$v30, 1]]);
    admin()->postJson("/api/admin/orders/{$order->id}/transition", ['action' => 'confirm']);

    admin()->putJson("/api/admin/orders/{$order->id}", ['lines' => [['variant_id' => $v30->id, 'quantity' => 11]], 'discount' => 100])
        ->assertUnprocessable()->assertJsonStructure(['shortages']);

    $order->refresh();
    expect($order->items)->toHaveCount(1)
        ->and($order->items->first()->quantity)->toBe(1)
        ->and($order->discount)->toBe(0)
        ->and($order->stock_deducted)->toBeTrue()
        ->and(pooledMl($this->p))->toBe(270);
});

it('refuses to edit finished orders and bad discounts or communes', function () {
    $order = placeOnline([[variantOf($this->p, '10 ml'), 1]]);

    admin()->putJson("/api/admin/orders/{$order->id}", ['discount' => 999999])->assertUnprocessable()->assertJsonPath('message', 'La remise dépasse le sous-total.');
    admin()->putJson("/api/admin/orders/{$order->id}", ['phone' => '123'])->assertUnprocessable();

    admin()->postJson("/api/admin/orders/{$order->id}/transition", ['action' => 'cancel'])->assertOk();
    admin()->putJson("/api/admin/orders/{$order->id}", ['admin_note' => 'x'])->assertUnprocessable()->assertJsonPath('message', 'Cette commande ne peut plus être modifiée.');
});

it('exports the filtered orders as a CSV that opens in Excel', function () {
    placeOnline([[variantOf($this->p, '10 ml'), 2]], ['first_name' => 'Sélim']);
    $cancelled = placeOnline([[variantOf($this->p, '10 ml'), 1]]);
    admin()->postJson("/api/admin/orders/{$cancelled->id}/transition", ['action' => 'cancel']);

    $res = admin()->get('/api/admin/orders/export?status=en_attente')->assertOk();
    $csv = $res->streamedContent();

    expect($csv)->toStartWith("\xEF\xBB\xBF")
        ->and($csv)->toContain('CMD-000001')->toContain('Sélim Benali')->toContain('Sauvage 10 ml x2')->toContain('Référence')
        ->and($csv)->not->toContain('CMD-000002')
        ->and($res->headers->get('content-type'))->toContain('text/csv');
});

it('keeps the pos orders out of the delivery workflow', function () {
    $pos = app(\App\Services\OrderPlacement::class)->placePos(['lines' => lines([[variantOf($this->p, '10 ml'), 1]]), 'amount_received' => 1000], $this->owner);

    admin()->postJson("/api/admin/orders/{$pos->id}/transition", ['action' => 'cancel'])->assertUnprocessable();
    admin()->getJson("/api/admin/orders/{$pos->id}")->assertJsonPath('data.allowed_actions', [])->assertJsonPath('data.change_due', 0);
    expect(Order::count())->toBe(1);
});
