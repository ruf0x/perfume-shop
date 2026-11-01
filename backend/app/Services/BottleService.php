<?php

namespace App\Services;

use App\Enums\OrderChannel;
use App\Enums\StockMovementType;
use App\Exceptions\ShopException;
use App\Models\BottleMovement;
use App\Models\BottleSize;
use App\Models\Order;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * The only writer of the empty decant bottles. A size is only limited once the shop has entered it: a decant
 * size without a row here (nothing counted) is never blocked. Every change is a bottle_movements row.
 */
class BottleService
{
    /** Receive bottles: creates the size the first time. $totalCost is what the whole entry cost. */
    public function addEntry(int $ml, int $quantity, ?int $totalCost = null, ?string $note = null, ?User $user = null): BottleSize
    {
        if ($ml < 1 || $quantity < 1) {
            throw new ShopException('Contenance et quantité invalides.');
        }

        return DB::transaction(function () use ($ml, $quantity, $totalCost, $note, $user) {
            $size = BottleSize::query()->firstOrCreate(['ml' => $ml]);
            $size = BottleSize::query()->lockForUpdate()->findOrFail($size->id);
            $this->record($size, StockMovementType::Entree, $quantity, $totalCost, null, $user, $note);
            $size->increment('qty', $quantity);

            return $size->refresh();
        });
    }

    /** Correct the count: negative = bottles lost or broken, positive = found again. Never below zero. */
    public function adjust(int $ml, int $delta, StockMovementType $type, string $note, ?User $user = null): BottleSize
    {
        if ($delta === 0) {
            throw new ShopException('Indiquez une quantité.');
        }

        return DB::transaction(function () use ($ml, $delta, $type, $note, $user) {
            $size = BottleSize::query()->where('ml', $ml)->lockForUpdate()->first() ?? throw new ShopException("Aucune bouteille de {$ml} ml n'est suivie.");
            if ($size->qty + $delta < 0) {
                throw new ShopException("Il ne reste que {$size->qty} bouteille(s) de {$ml} ml.");
            }
            $this->record($size, $type, $delta, null, null, $user, $note);
            $size->increment('qty', $delta);

            return $size->refresh();
        });
    }

    /**
     * Lock the tracked sizes among $mls (inside a transaction).
     *
     * @param  list<int>  $mls
     * @return Collection<int, BottleSize> keyed by ml
     */
    public function lockTracked(array $mls): Collection
    {
        if ($mls === []) {
            return collect();
        }

        return BottleSize::query()->whereIn('ml', $mls)->orderBy('id')->lockForUpdate()->get()->keyBy('ml');
    }

    /** Take the bottles of a sale off the stock (the caller locked and checked them). */
    public function consume(BottleSize $size, int $count, Order $order, ?User $user): void
    {
        $type = $order->channel === OrderChannel::Pos ? StockMovementType::VenteCaisse : StockMovementType::VenteEnLigne;
        $this->record($size, $type, -$count, null, $order, $user, null);
        $size->decrement('qty', $count);
    }

    /** Put back the bottles of an order (cancellation / return): reverses its own net movements. */
    public function restoreForOrder(Order $order, StockMovementType $type, ?User $user): void
    {
        $net = BottleMovement::query()->where('order_id', $order->id)->get()
            ->groupBy('bottle_size_id')->map(fn ($g) => (int) $g->sum('qty_change'))->filter(fn (int $n) => $n !== 0);

        if ($net->isEmpty()) {
            return;
        }

        $sizes = BottleSize::query()->whereIn('id', $net->keys())->orderBy('id')->lockForUpdate()->get()->keyBy('id');
        foreach ($net as $sizeId => $qty) {
            $this->record($sizes[$sizeId], $type, -$qty, null, $order, $user, null);
            $sizes[$sizeId]->increment('qty', -$qty);
        }
    }

    private function record(BottleSize $size, StockMovementType $type, int $qty, ?int $totalCost, ?Order $order, ?User $user, ?string $note): void
    {
        BottleMovement::create([
            'bottle_size_id' => $size->id,
            'type' => $type,
            'qty_change' => $qty,
            'total_cost' => $totalCost,
            'order_id' => $order?->id,
            'order_reference' => $order?->reference,
            'user_id' => $user?->id,
            'note' => $note,
        ]);
    }
}
