<?php

use App\Enums\OrderChannel;
use App\Enums\OrderStatus;
use App\Exceptions\InsufficientStockException;
use App\Exceptions\ShopException;
use App\Models\Customer;
use App\Models\Order;
use App\Models\StockMovement;
use App\Services\OrderPlacement;

it('creates a pending cash-on-delivery order without touching stock', function () {
    $p = makePerfume(poolMl: 100);

    $order = placeOnline([[variantOf($p, '20 ml'), 2]]);

    expect($order->status)->toBe(OrderStatus::EnAttente)
        ->and($order->channel)->toBe(OrderChannel::Online)
        ->and($order->reference)->toBe('CMD-000001')
        ->and($order->stock_deducted)->toBeFalse()
        ->and($order->subtotal)->toBe(3600)
        ->and($order->delivery_fee)->toBe(600)
        ->and($order->total)->toBe(4200)
        ->and($order->history)->toHaveCount(1)
        ->and(pooledMl($p))->toBe(100)
        ->and(StockMovement::where('order_id', $order->id)->count())->toBe(0);
});

it('ignores any price sent by the client', function () {
    $p = makePerfume(poolMl: 100);
    $data = orderData([[variantOf($p, '10 ml'), 1]]);
    $data['lines'][0]['price'] = 1;
    $data['lines'][0]['unit_price'] = 1;
    $data['total'] = 1;
    $data['delivery_fee'] = 0;

    $order = app(OrderPlacement::class)->placeOnline($data);

    expect($order->items->first()->unit_price)->toBe(1000)
        ->and($order->total)->toBe(1600);
});

it('snapshots names and prices so later edits do not change the order', function () {
    $p = makePerfume('Ancien nom', poolMl: 100);
    $v = variantOf($p, '10 ml');
    $order = placeOnline([[$v, 1]]);

    $v->update(['price' => 99999]);
    $p->update(['name' => 'Nouveau nom']);

    $item = $order->fresh()->items->first();
    expect($item->unit_price)->toBe(1000)
        ->and($item->product_name)->toBe('Ancien nom')
        ->and($item->variant_label)->toBe('10 ml');
});

it('merges duplicate lines for the same variant', function () {
    $p = makePerfume(poolMl: 100);
    $v = variantOf($p, '10 ml');

    $order = placeOnline([[$v, 1], [$v, 2]]);

    expect($order->items)->toHaveCount(1)
        ->and($order->items->first()->quantity)->toBe(3);
});

it('refuses a blacklisted phone number', function () {
    $p = makePerfume(poolMl: 100);
    Customer::create(['phone' => '0550123456', 'first_name' => 'X', 'last_name' => 'Y', 'is_blacklisted' => true]);

    expect(fn () => placeOnline([[variantOf($p, '10 ml'), 1]]))->toThrow(ShopException::class);
    expect(Order::count())->toBe(0);
});

it('validates and normalises Algerian phone numbers', function () {
    $p = makePerfume(poolMl: 100);
    $v = variantOf($p, '10 ml');

    foreach (['0123456789', '055012345', 'abc', '0850123456'] as $bad) {
        expect(fn () => placeOnline([[$v, 1]], ['phone' => $bad]))->toThrow(ShopException::class);
    }

    $order = placeOnline([[$v, 1]], ['phone' => '+213 550 12 34 56']);
    expect($order->phone)->toBe('0550123456');
});

it('reuses the customer by phone and counts their orders', function () {
    $p = makePerfume(poolMl: 100);
    $v = variantOf($p, '10 ml');

    placeOnline([[$v, 1]]);
    placeOnline([[$v, 1]], ['first_name' => 'Amina']);

    expect(Customer::count())->toBe(1)
        ->and(Customer::first()->orders_count)->toBe(2)
        ->and(Customer::first()->first_name)->toBe('Amina');
});

it('requires an address for delivery but not for store pickup', function () {
    $p = makePerfume(poolMl: 100);
    $v = variantOf($p, '10 ml');

    expect(fn () => placeOnline([[$v, 1]], ['address' => null]))->toThrow(ShopException::class);

    $pickup = placeOnline([[$v, 1]], ['address' => null, 'delivery_mode' => 'boutique']);
    expect($pickup->delivery_fee)->toBe(0)->and($pickup->total)->toBe(1000);

    // A delivery office needs no address: the shop picks the office (e.g. ZR Express).
    $desk = placeOnline([[$v, 1]], ['address' => null, 'delivery_mode' => 'stop_desk']);
    expect($desk->address)->toBeNull()->and($desk->delivery_fee)->toBe(400);
});

it('prices delivery from the wilaya and mode, with a free-delivery threshold', function () {
    $p = makePerfume(poolMl: 500);
    $v = variantOf($p, '30 ml');

    expect(placeOnline([[$v, 1]], ['delivery_mode' => 'stop_desk'])->delivery_fee)->toBe(400);

    settings()->set('free_delivery_over', 2500);
    expect(placeOnline([[$v, 1]])->delivery_fee)->toBe(0);
});

it('refuses store pickup when it is disabled and inactive wilayas', function () {
    $p = makePerfume(poolMl: 100);
    $v = variantOf($p, '10 ml');

    settings()->set('store_pickup_enabled', false);
    expect(fn () => placeOnline([[$v, 1]], ['delivery_mode' => 'boutique']))->toThrow(ShopException::class);

    makeWilaya(31)->update(['is_active' => false]);
    expect(fn () => placeOnline([[$v, 1]], ['wilaya_id' => 31]))->toThrow(ShopException::class);
});

it('rejects a commune that does not belong to the wilaya', function () {
    $p = makePerfume(poolMl: 100);
    makeWilaya(31);
    $commune = \App\Models\Commune::create(['wilaya_id' => 31, 'name' => 'Oran']);

    expect(fn () => placeOnline([[variantOf($p, '10 ml'), 1]], ['commune_id' => $commune->id]))->toThrow(ShopException::class);
});

it('refuses a line the shop cannot supply', function () {
    $p = makePerfume(poolMl: 15);

    expect(fn () => placeOnline([[variantOf($p, '20 ml'), 1]]))->toThrow(InsufficientStockException::class);
    expect(Order::count())->toBe(0);
});

it('numbers online and caisse orders with independent sequences', function () {
    $p = makePerfume(poolMl: 500);
    $v = variantOf($p, '10 ml');
    $owner = makeOwner();

    $a = placeOnline([[$v, 1]]);
    $b = placeOnline([[$v, 1]]);
    $pos = app(OrderPlacement::class)->placePos(['lines' => lines([[$v, 1]]), 'amount_received' => 1000], $owner);

    expect([$a->reference, $b->reference, $pos->reference])->toBe(['CMD-000001', 'CMD-000002', 'POS-000001']);
});

it('deducts stock immediately on a caisse sale and completes the order', function () {
    $p = makePerfume(poolMl: 100, sealed: 2);
    $owner = makeOwner();

    $order = app(OrderPlacement::class)->placePos([
        'lines' => lines([[variantOf($p, '30 ml'), 1], [variantOf($p, '100 ml scellé'), 1]]),
        'discount' => 500,
        'payment_method' => 'especes',
        'amount_received' => 11000,
    ], $owner);

    expect($order->status)->toBe(OrderStatus::VendueBoutique)
        ->and($order->channel)->toBe(OrderChannel::Pos)
        ->and($order->stock_deducted)->toBeTrue()
        ->and($order->subtotal)->toBe(11500)
        ->and($order->total)->toBe(11000)
        ->and($order->amount_received - $order->total)->toBe(0)
        ->and($order->created_by)->toBe($owner->id)
        ->and(pooledMl($p))->toBe(70)
        ->and(variantOf($p, '100 ml scellé')->fresh()->stock_qty)->toBe(1)
        ->and(StockMovement::where('order_id', $order->id)->where('type', 'vente_caisse')->count())->toBe(2);
});

it('refuses a caisse sale without enough cash or enough stock and writes nothing', function () {
    $p = makePerfume(poolMl: 20);
    $owner = makeOwner();
    $place = fn (array $d) => app(OrderPlacement::class)->placePos($d, $owner);

    expect(fn () => $place(['lines' => lines([[variantOf($p, '10 ml'), 1]]), 'amount_received' => 500]))->toThrow(ShopException::class);
    expect(fn () => $place(['lines' => lines([[variantOf($p, '30 ml'), 1]]), 'amount_received' => 5000]))->toThrow(InsufficientStockException::class);
    expect(fn () => $place(['lines' => lines([[variantOf($p, '10 ml'), 1]]), 'discount' => 5000, 'amount_received' => 5000]))->toThrow(ShopException::class);

    expect(Order::count())->toBe(0)->and(pooledMl($p))->toBe(20);
});
