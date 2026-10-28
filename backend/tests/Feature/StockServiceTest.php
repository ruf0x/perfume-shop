<?php

use App\Enums\StockMovementType;
use App\Exceptions\ShopException;
use App\Models\StockMovement;
use App\Services\StockService;

beforeEach(fn () => $this->stock = app(StockService::class));

it('computes availability and max quantity for pool variants', function () {
    $p = makePerfume(poolMl: 100);

    expect($this->stock->maxQty(variantOf($p, '30 ml')))->toBe(3)
        ->and($this->stock->availability(variantOf($p, '30 ml'), 3))->toBeTrue()
        ->and($this->stock->availability(variantOf($p, '30 ml'), 4))->toBeFalse()
        ->and($this->stock->availability(variantOf($p, '10 ml'), 0))->toBeFalse();
});

it('computes max quantity for sealed unit variants independently of the pool', function () {
    $p = makePerfume(poolMl: 0, sealed: 2);

    expect($this->stock->maxQty(variantOf($p, '100 ml scellé')))->toBe(2)
        ->and($this->stock->maxQty(variantOf($p, '10 ml')))->toBe(0);
});

it('limits a pack by its scarcest resource, counting a shared pool once', function () {
    $a = makePerfume('A', poolMl: 50);
    $b = makePerfume('B', poolMl: 500);
    // 2 x 10 ml of A + 1 x 30 ml of B per pack => A needs 20 ml/pack => 2 packs from 50 ml
    $pack = makePack([[variantOf($a, '10 ml'), 2], [variantOf($b, '30 ml'), 1]]);
    // the same perfume in two components must be summed: 10 + 30 = 40 ml per pack => 1 pack from 50 ml
    $same = makePack([[variantOf($a, '10 ml'), 1], [variantOf($a, '30 ml'), 1]]);

    expect($this->stock->maxQty($pack))->toBe(2)
        ->and($this->stock->maxQty($same))->toBe(1);
});

it('treats an inactive variant or product as not sellable', function () {
    $p = makePerfume(poolMl: 100);
    $v = variantOf($p, '10 ml');

    $v->update(['is_active' => false]);
    expect($this->stock->maxQty($v->fresh()))->toBe(0);

    $v->update(['is_active' => true]);
    $p->update(['is_active' => false]);
    expect($this->stock->maxQty($v->fresh()))->toBe(0);
});

it('records entries in the ledger and the cached totals', function () {
    $p = makePerfume();
    $full = variantOf($p, '100 ml scellé');

    $this->stock->addEntry($p, ml: 200, unitCost: 5000, note: '2 flacons à décanter');
    $this->stock->addEntry($p, $full, qty: 3);

    expect(pooledMl($p))->toBe(200)
        ->and($full->fresh()->stock_qty)->toBe(3)
        ->and(StockMovement::count())->toBe(2)
        ->and(StockMovement::first()->unit_cost)->toBe(5000);
});

it('refuses empty or negative entries and unit entries on a pool variant', function () {
    $p = makePerfume();

    expect(fn () => $this->stock->addEntry($p))->toThrow(ShopException::class);
    expect(fn () => $this->stock->addEntry($p, ml: -5))->toThrow(ShopException::class);
    expect(fn () => $this->stock->addEntry($p, variantOf($p, '10 ml'), qty: 1))->toThrow(ShopException::class);
});

it('refuses adjustments that would take the stock below zero', function () {
    $p = makePerfume(poolMl: 50);

    expect(fn () => $this->stock->adjust($p, null, StockMovementType::Perte, mlChange: -60))->toThrow(ShopException::class);
    expect(pooledMl($p))->toBe(50);

    $this->stock->adjust($p, null, StockMovementType::Perte, mlChange: -20, note: 'renversé');
    expect(pooledMl($p))->toBe(30);
});

it('does not let a loss add stock', function () {
    $p = makePerfume(poolMl: 50);

    expect(fn () => $this->stock->adjust($p, null, StockMovementType::Perte, mlChange: 10))->toThrow(ShopException::class);
});

it('opens a sealed bottle into the pool', function () {
    $p = makePerfume(poolMl: 10, sealed: 2);
    $full = variantOf($p, '100 ml scellé');

    $this->stock->openBottle($full);

    expect(pooledMl($p))->toBe(110)
        ->and($full->fresh()->stock_qty)->toBe(1)
        ->and(StockMovement::where('type', StockMovementType::OuvertureFlacon)->count())->toBe(2);
});

it('refuses to open a bottle when none is in stock or on a pool variant', function () {
    $p = makePerfume(poolMl: 10, sealed: 0);

    expect(fn () => $this->stock->openBottle(variantOf($p, '100 ml scellé')))->toThrow(ShopException::class);
    expect(fn () => $this->stock->openBottle(variantOf($p, '10 ml')))->toThrow(ShopException::class);
});

it('rebuilds drifted cached totals from the ledger', function () {
    $p = makePerfume(poolMl: 300, sealed: 4);
    $full = variantOf($p, '100 ml scellé');
    $this->stock->openBottle($full);

    $p->update(['stock_ml' => 9999]);
    $full->update(['stock_qty' => 42]);

    expect($this->stock->recalculate($p->fresh()))->toBeTrue()
        ->and(pooledMl($p))->toBe(400)
        ->and($full->fresh()->stock_qty)->toBe(3)
        ->and($this->stock->recalculate($p->fresh()))->toBeFalse();
});
