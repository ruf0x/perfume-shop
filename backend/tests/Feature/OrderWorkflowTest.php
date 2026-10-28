<?php

use App\Enums\OrderStatus;
use App\Exceptions\InsufficientStockException;
use App\Exceptions\InvalidTransitionException;
use App\Models\Customer;
use App\Models\StockMovement;
use App\Services\OrderWorkflow;

beforeEach(fn () => $this->flow = app(OrderWorkflow::class));

it('deducts pool stock when an order is confirmed', function () {
    $p = makePerfume(poolMl: 100);
    $order = placeOnline([[variantOf($p, '20 ml'), 2]]);

    $order = $this->flow->transition($order, 'confirm', makeOwner());

    expect($order->status)->toBe(OrderStatus::Confirmee)
        ->and($order->stock_deducted)->toBeTrue()
        ->and($order->confirmed_at)->not->toBeNull()
        ->and(pooledMl($p))->toBe(60);

    $movement = StockMovement::where('order_id', $order->id)->sole();
    expect($movement->type->value)->toBe('vente_en_ligne')->and($movement->ml_change)->toBe(-40);
});

it('deducts sealed bottles from the unit stock, not the pool', function () {
    $p = makePerfume(poolMl: 50, sealed: 3);
    $full = variantOf($p, '100 ml scellé');

    $this->flow->transition(placeOnline([[$full, 2]]), 'confirm');

    expect($full->fresh()->stock_qty)->toBe(1)->and(pooledMl($p))->toBe(50);
});

it('deducts every component of a pack', function () {
    $a = makePerfume('A', poolMl: 100);
    $b = makePerfume('B', poolMl: 100, sealed: 2);
    $pack = makePack([[variantOf($a, '10 ml'), 2], [variantOf($b, '100 ml scellé'), 1], [variantOf($b, '30 ml'), 1]]);

    $this->flow->transition(placeOnline([[$pack, 2]]), 'confirm');

    expect(pooledMl($a))->toBe(60)                                // 2 packs x 2 x 10 ml
        ->and(pooledMl($b))->toBe(40)                              // 2 packs x 30 ml
        ->and(variantOf($b, '100 ml scellé')->fresh()->stock_qty)->toBe(0);
});

it('refuses to confirm when stock ran out and leaves the order untouched', function () {
    $p = makePerfume(poolMl: 100);
    $first = placeOnline([[variantOf($p, '30 ml'), 2]]);   // 60 ml
    $second = placeOnline([[variantOf($p, '30 ml'), 2]]);  // 60 ml: only 40 left once the first is confirmed

    $this->flow->transition($first, 'confirm');
    $movementsBefore = StockMovement::count();

    expect(fn () => $this->flow->transition($second, 'confirm'))->toThrow(InsufficientStockException::class);

    $second->refresh();
    expect($second->status)->toBe(OrderStatus::EnAttente)
        ->and($second->stock_deducted)->toBeFalse()
        ->and($second->confirmed_at)->toBeNull()
        ->and($second->history)->toHaveCount(1)
        ->and(pooledMl($p))->toBe(40)
        ->and(StockMovement::count())->toBe($movementsBefore);
});

it('writes nothing at all when only one item of the order is short', function () {
    $a = makePerfume('A', poolMl: 100);
    $b = makePerfume('B', poolMl: 100);
    $order = placeOnline([[variantOf($a, '10 ml'), 1], [variantOf($b, '30 ml'), 1]]);
    $b->update(['stock_ml' => 5]); // stock vanished (e.g. a loss) after the order was placed

    expect(fn () => $this->flow->transition($order, 'confirm'))->toThrow(InsufficientStockException::class);

    expect(pooledMl($a))->toBe(100)
        ->and(StockMovement::where('order_id', $order->id)->count())->toBe(0)
        ->and($order->fresh()->stock_deducted)->toBeFalse();
});

it('still confirms an order after its perfume was hidden from the shop', function () {
    $p = makePerfume(poolMl: 100);
    $order = placeOnline([[variantOf($p, '10 ml'), 1]]);
    $p->update(['is_active' => false]);

    $this->flow->transition($order, 'confirm');

    expect(pooledMl($p))->toBe(90);
});

it('restores stock when a confirmed order is cancelled', function () {
    $p = makePerfume(poolMl: 100, sealed: 2);
    $full = variantOf($p, '100 ml scellé');
    $order = placeOnline([[variantOf($p, '30 ml'), 1], [$full, 1]]);
    $this->flow->transition($order, 'confirm');

    $order = $this->flow->transition($order, 'cancel', makeOwner(), ['reason' => 'Client injoignable']);

    expect($order->status)->toBe(OrderStatus::Annulee)
        ->and($order->stock_deducted)->toBeFalse()
        ->and($order->cancel_reason)->toBe('Client injoignable')
        ->and(pooledMl($p))->toBe(100)
        ->and($full->fresh()->stock_qty)->toBe(2)
        ->and((int) StockMovement::where('order_id', $order->id)->sum('ml_change'))->toBe(0)
        ->and((int) StockMovement::where('order_id', $order->id)->sum('qty_change'))->toBe(0)
        ->and(Customer::first()->cancelled_count)->toBe(1);
});

it('does not touch stock when a pending order is cancelled', function () {
    $p = makePerfume(poolMl: 100);
    $order = placeOnline([[variantOf($p, '30 ml'), 1]]);

    $order = $this->flow->transition($order, 'cancel');

    expect($order->status)->toBe(OrderStatus::Annulee)
        ->and(pooledMl($p))->toBe(100)
        ->and(StockMovement::where('order_id', $order->id)->count())->toBe(0);
});

it('moves through shipping to delivered and records timestamps and counters', function () {
    $p = makePerfume(poolMl: 100);
    $order = placeOnline([[variantOf($p, '10 ml'), 1]]);

    $this->flow->transition($order, 'confirm');
    $order = $this->flow->transition($order, 'ship', null, ['delivery_company' => 'Yalidine', 'tracking_number' => 'YAL-123']);
    expect($order->status)->toBe(OrderStatus::EnLivraison)
        ->and($order->delivery_company)->toBe('Yalidine')
        ->and($order->tracking_number)->toBe('YAL-123')
        ->and($order->shipped_at)->not->toBeNull();

    $order = $this->flow->transition($order, 'deliver');
    expect($order->status)->toBe(OrderStatus::Livree)
        ->and($order->delivered_at)->not->toBeNull()
        ->and($order->completed_at)->not->toBeNull()
        ->and(pooledMl($p))->toBe(90)
        ->and(Customer::first()->delivered_count)->toBe(1)
        ->and($order->history->pluck('to_status')->map->value->all())
        ->toBe(['en_attente', 'confirmee', 'en_livraison', 'livree']);
});

it('puts stock back on a return when asked to', function () {
    $p = makePerfume(poolMl: 100, sealed: 1);
    $full = variantOf($p, '100 ml scellé');
    $order = placeOnline([[$full, 1], [variantOf($p, '10 ml'), 1]]);
    $this->flow->transition($order, 'confirm');
    $this->flow->transition($order, 'ship');

    $order = $this->flow->transition($order, 'return', null, ['restock' => true]);

    expect($order->status)->toBe(OrderStatus::Retournee)
        ->and($order->stock_deducted)->toBeFalse()
        ->and(pooledMl($p))->toBe(100)
        ->and($full->fresh()->stock_qty)->toBe(1)
        ->and(Customer::first()->returned_count)->toBe(1);
});

it('keeps the stock deducted on a return without restock (loss)', function () {
    $p = makePerfume(poolMl: 100);
    $order = placeOnline([[variantOf($p, '30 ml'), 1]]);
    $this->flow->transition($order, 'confirm');
    $this->flow->transition($order, 'ship');

    $order = $this->flow->transition($order, 'return', null, ['restock' => false]);

    expect($order->status)->toBe(OrderStatus::Retournee)
        ->and($order->stock_deducted)->toBeTrue()
        ->and(pooledMl($p))->toBe(70)
        ->and($order->history->last()->note)->toBe('Non remis en stock');
});

it('sells a confirmed order in the shop', function () {
    $p = makePerfume(poolMl: 100);
    $order = placeOnline([[variantOf($p, '10 ml'), 1]], ['delivery_mode' => 'boutique', 'address' => null]);
    $this->flow->transition($order, 'confirm');

    $order = $this->flow->transition($order, 'sell_in_store');

    expect($order->status)->toBe(OrderStatus::VendueBoutique)->and($order->completed_at)->not->toBeNull();
});

it('rejects transitions the state machine does not allow', function (string $setup, string $action) {
    $p = makePerfume(poolMl: 100);
    $order = placeOnline([[variantOf($p, '10 ml'), 1]]);

    match ($setup) {
        'pending' => null,
        'confirmed' => $this->flow->transition($order, 'confirm'),
        'cancelled' => $this->flow->transition($order, 'cancel'),
        'delivered' => collect(['confirm', 'ship', 'deliver'])->each(fn ($a) => $this->flow->transition($order, $a)),
    };
    $before = $order->fresh();

    expect(fn () => $this->flow->transition($order, $action))->toThrow(InvalidTransitionException::class);
    expect($order->fresh()->status)->toBe($before->status)
        ->and($order->fresh()->history)->toHaveCount($before->history->count());
})->with([
    'ship a pending order' => ['pending', 'ship'],
    'deliver a pending order' => ['pending', 'deliver'],
    'return a pending order' => ['pending', 'return'],
    'sell a pending order' => ['pending', 'sell_in_store'],
    'confirm twice' => ['confirmed', 'confirm'],
    'deliver without shipping' => ['confirmed', 'deliver'],
    'confirm a cancelled order' => ['cancelled', 'confirm'],
    'cancel a cancelled order' => ['cancelled', 'cancel'],
    'cancel a delivered order' => ['delivered', 'cancel'],
    'return a delivered order' => ['delivered', 'return'],
    'reopen a pending order' => ['pending', 'reopen'],
    'reopen a confirmed order' => ['confirmed', 'reopen'],
    'reopen a delivered order' => ['delivered', 'reopen'],
]);

it('reopens a cancelled order as pending and it can be confirmed again', function () {
    $p = makePerfume(poolMl: 100);
    $order = placeOnline([[variantOf($p, '30 ml'), 2]]);
    $this->flow->transition($order, 'confirm');
    $this->flow->transition($order, 'cancel', null, ['reason' => 'Client injoignable']);
    expect(pooledMl($p))->toBe(100)->and(Customer::first()->cancelled_count)->toBe(1);

    $order = $this->flow->transition($order, 'reopen', makeOwner());

    expect($order->status)->toBe(OrderStatus::EnAttente)
        ->and($order->cancelled_at)->toBeNull()
        ->and($order->cancel_reason)->toBeNull()
        ->and($order->confirmed_at)->toBeNull()
        ->and($order->stock_deducted)->toBeFalse()
        ->and(pooledMl($p))->toBe(100)                       // nothing taken while pending
        ->and(Customer::first()->cancelled_count)->toBe(0)   // no longer counted as cancelled
        ->and($order->history->last()->note)->toBe('Commande rouverte')
        ->and($order->status->actions())->toBe(['confirm', 'no_answer', 'cancel']);

    $order = $this->flow->transition($order, 'confirm');
    expect($order->stock_deducted)->toBeTrue()->and(pooledMl($p))->toBe(40);
});

it('cannot confirm a reopened order when the stock is gone, and it stays pending', function () {
    $p = makePerfume(poolMl: 60);
    $order = placeOnline([[variantOf($p, '30 ml'), 2]]);
    $this->flow->transition($order, 'cancel');
    $this->flow->transition($order, 'reopen');
    $p->update(['stock_ml' => 10]); // sold elsewhere in the meantime

    expect(fn () => $this->flow->transition($order, 'confirm'))->toThrow(InsufficientStockException::class);
    expect($order->fresh()->status)->toBe(OrderStatus::EnAttente);
});

it('rejects an unknown action', function () {
    $p = makePerfume(poolMl: 100);

    expect(fn () => $this->flow->transition(placeOnline([[variantOf($p, '10 ml'), 1]]), 'explode'))
        ->toThrow(\App\Exceptions\ShopException::class);
});

it('counts unanswered calls on a pending order only', function () {
    $p = makePerfume(poolMl: 100);
    $order = placeOnline([[variantOf($p, '10 ml'), 1]]);

    $this->flow->transition($order, 'no_answer');
    $order = $this->flow->transition($order, 'no_answer');

    expect($order->status)->toBe(OrderStatus::EnAttente)
        ->and($order->call_attempts)->toBe(2)
        ->and($order->history)->toHaveCount(3);

    $this->flow->transition($order, 'confirm');
    expect(fn () => $this->flow->transition($order, 'no_answer'))->toThrow(InvalidTransitionException::class);
});

it('keeps cached stock equal to the ledger after a mixed sequence of operations', function () {
    $p = makePerfume(poolMl: 300, sealed: 3);
    $full = variantOf($p, '100 ml scellé');

    $a = placeOnline([[variantOf($p, '30 ml'), 2], [$full, 1]]);
    $b = placeOnline([[variantOf($p, '20 ml'), 3]]);
    $this->flow->transition($a, 'confirm');
    $this->flow->transition($b, 'confirm');
    $this->flow->transition($a, 'cancel');
    app(\App\Services\StockService::class)->openBottle($full->fresh());

    expect(pooledMl($p))->toBe((int) StockMovement::where('product_id', $p->id)->sum('ml_change'))
        ->and($full->fresh()->stock_qty)->toBe((int) StockMovement::where('variant_id', $full->id)->sum('qty_change'));
});
