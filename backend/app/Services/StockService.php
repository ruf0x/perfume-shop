<?php

namespace App\Services;

use App\Enums\OrderChannel;
use App\Enums\ProductKind;
use App\Enums\StockMode;
use App\Enums\StockMovementType;
use App\Exceptions\InsufficientStockException;
use App\Exceptions\ShopException;
use App\Models\BottleSize;
use App\Models\Order;
use App\Models\OpenBottle;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * The only place that changes stock. Every change is written to stock_movements
 * (the source of truth) and mirrored in the cached totals products.stock_ml and
 * product_variants.stock_qty inside the same transaction, on locked rows.
 */
class StockService
{
    /**
     * What selling $qty of a variant consumes, expanding packs into their components.
     *
     * @return array{ml: array<int, int>, units: array<int, int>} ml per product id, sealed units per variant id
     */
    public function requirements(ProductVariant $variant, int $qty = 1): array
    {
        $needs = ['ml' => [], 'units' => []];
        $this->expand($variant, $qty, $needs, checkActive: true);

        return $needs;
    }

    /** Most a customer can put on one order line when the stock is hidden from them. */
    public const ORDER_MAX_QTY = 50;

    /**
     * The quantity limit the shop tells customers. With backorder it is a flat cap as long as the item is
     * listed (at least one can be sold), so the real stock is never revealed; otherwise the real stock.
     */
    public function shopMaxQty(ProductVariant $variant): int
    {
        $real = $this->maxQty($variant);

        return settings()->backorderEnabled() ? ($real >= 1 ? self::ORDER_MAX_QTY : 0) : $real;
    }

    /**
     * For the owner, on a pending order: can it be confirmed with the stock we have, and what is left per line.
     * Several lines can draw on the same ml pool, so the needs are added up before they are compared.
     *
     * @return array{possible: bool, shortages: list<array<string, mixed>>, lines: list<array{item_id: int, ok: bool, left: string, max_qty: int}>}
     */
    public function checkOrder(Order $order): array
    {
        $needs = ['ml' => [], 'units' => []];
        $perLine = [];
        foreach ($order->items()->with('variant.product')->get() as $item) {
            if (! $item->variant) {
                $perLine[$item->id] = ['ok' => false, 'left' => 'Article supprimé', 'max_qty' => 0, 'keys' => []];

                continue;
            }
            $own = ['ml' => [], 'units' => []];
            $this->expand($item->variant, $item->quantity, $own, checkActive: false);
            $this->expand($item->variant, $item->quantity, $needs, checkActive: false);
            $perLine[$item->id] = ['item' => $item, 'own' => $own];
        }

        $shortMl = [];
        foreach ($needs['ml'] as $productId => $ml) {
            if ((int) Product::query()->whereKey($productId)->value('stock_ml') < $ml) {
                $shortMl[$productId] = true;
            }
        }
        $shortUnits = [];
        foreach ($needs['units'] as $variantId => $units) {
            if ((int) ProductVariant::query()->whereKey($variantId)->value('stock_qty') < $units) {
                $shortUnits[$variantId] = true;
            }
        }

        $shortBottles = [];
        foreach ($needs['bottles'] ?? [] as $ml => $count) {
            $left = BottleSize::query()->where('ml', $ml)->value('qty');
            if ($left !== null && (int) $left < $count) {
                $shortBottles[$ml] = true;
            }
        }

        $lines = [];
        foreach ($perLine as $id => $entry) {
            if (isset($entry['keys'])) {
                $lines[] = ['item_id' => $id, 'ok' => false, 'left' => $entry['left'], 'max_qty' => 0];

                continue;
            }
            $item = $entry['item'];
            $variant = $item->variant;
            $ok = collect(array_keys($entry['own']['ml']))->every(fn ($p) => ! isset($shortMl[$p]))
                && collect(array_keys($entry['own']['units']))->every(fn ($v) => ! isset($shortUnits[$v]))
                && collect(array_keys($entry['own']['bottles'] ?? []))->every(fn ($m) => ! isset($shortBottles[$m]));

            if ($variant->stock_mode === StockMode::Pool) {
                $left = (int) $variant->product->stock_ml.' ml';
                $bottleLeft = BottleSize::query()->where('ml', $variant->ml)->value('qty');
                if ($bottleLeft !== null) {
                    $left .= ', '.(int) $bottleLeft.' bouteille(s) de '.$variant->ml.' ml';
                }
            } elseif ($variant->stock_mode === StockMode::Unit) {
                $left = (int) $variant->stock_qty.($variant->product->kind === ProductKind::Standard ? ' article(s)' : ' flacon(s)');
            } else {
                $left = 'peut être assemblé '.$this->maxQty($variant).' fois';
            }
            $lines[] = ['item_id' => $id, 'ok' => $ok, 'left' => $left, 'max_qty' => $this->maxQty($variant)];
        }

        $shortages = [];
        foreach (array_keys($shortMl) as $productId) {
            $shortages[] = ['name' => (string) Product::query()->whereKey($productId)->value('name'), 'unit' => 'ml', 'requested' => $needs['ml'][$productId], 'available' => (int) Product::query()->whereKey($productId)->value('stock_ml')];
        }
        foreach (array_keys($shortUnits) as $variantId) {
            $v = ProductVariant::query()->with('product')->find($variantId);
            $shortages[] = ['name' => "{$v->product->name} ({$v->label})", 'unit' => $v->product->kind === ProductKind::Standard ? 'article(s)' : 'flacon(s)', 'requested' => $needs['units'][$variantId], 'available' => (int) $v->stock_qty];
        }

        foreach (array_keys($shortBottles) as $ml) {
            $shortages[] = ['name' => "Bouteilles de {$ml} ml", 'unit' => 'bouteille(s)', 'requested' => $needs['bottles'][$ml], 'available' => (int) BottleSize::query()->where('ml', $ml)->value('qty')];
        }

        return ['possible' => $shortages === [] && collect($lines)->every(fn ($l) => $l['ok']), 'shortages' => $shortages, 'lines' => $lines];
    }

    /** How many of this variant can be sold with the current stock (0 if inactive or unsellable). */
    public function maxQty(ProductVariant $variant): int
    {
        try {
            $needs = $this->requirements($variant);
        } catch (ShopException) {
            return 0;
        }

        $limits = [];
        foreach ($needs['ml'] as $productId => $ml) {
            $limits[] = intdiv((int) Product::query()->whereKey($productId)->value('stock_ml'), $ml);
        }
        foreach ($needs['units'] as $variantId => $units) {
            $limits[] = intdiv((int) ProductVariant::query()->whereKey($variantId)->value('stock_qty'), $units);
        }
        foreach ($needs['bottles'] ?? [] as $ml => $count) {
            $left = BottleSize::query()->where('ml', $ml)->value('qty');
            if ($left !== null) {
                $limits[] = intdiv(max(0, (int) $left), $count);
            }
        }

        return $limits === [] ? 0 : max(0, min($limits));
    }

    /**
     * Whether the shop should list a product as in stock. Perfumes and cosmetics: enough ml in the pool
     * (the low-stock threshold) or a unit in stock; packs: at least one can be assembled.
     * Uses the loaded `variants` relation (no extra queries).
     */
    public function productAvailable(Product $product): bool
    {
        if ($product->kind === ProductKind::Pack) {
            $variant = $product->variants->first();

            return $variant !== null && $this->maxQty($variant) >= 1;
        }

        return $product->stock_ml >= settings()->lowStockThresholdMl()
            || $product->variants->contains(fn (ProductVariant $v) => $v->is_active && $v->stock_mode === StockMode::Unit && $v->stock_qty > 0);
    }

    /**
     * Stock level of a perfume or cosmetic for the admin: `out`, `low` or `ok`.
     * Expects `variants` loaded with the active unit variants only.
     */
    public function stockStatus(Product $product): string
    {
        $units = (int) $product->variants
            ->filter(fn (ProductVariant $v) => $v->is_active && $v->stock_mode === StockMode::Unit)
            ->sum('stock_qty');

        if ($product->stock_ml === 0 && $units === 0) {
            return 'out';
        }
        if (! $this->productAvailable($product)) {
            return 'low';
        }

        $lowUnits = $product->kind === ProductKind::Standard
            && $product->stock_ml < settings()->lowStockThresholdMl()
            && $units <= settings()->lowStockThresholdQty();

        return $lowUnits ? 'low' : 'ok';
    }

    public function availability(ProductVariant $variant, int $qty): bool
    {
        return $qty >= 1 && $this->maxQty($variant) >= $qty;
    }

    /**
     * Receive stock: $ml goes to the perfume's pool, $qty sealed bottles to a unit variant.
     * Receiving "2 bottles of 100 ml" for decanting is addEntry($product, null, ml: 200).
     */
    public function addEntry(
        Product $product,
        ?ProductVariant $variant = null,
        int $ml = 0,
        int $qty = 0,
        ?int $unitCost = null,
        ?string $note = null,
        ?User $user = null,
    ): StockMovement {
        if ($ml < 0 || $qty < 0 || ($ml === 0 && $qty === 0)) {
            throw new ShopException('La quantité à ajouter doit être positive.');
        }

        return $this->apply($product, $variant, StockMovementType::Entree, $ml, $qty, $unitCost, $note, $user);
    }

    /**
     * Manual correction or loss. Values are signed; a loss can only remove stock.
     * Refuses to take the stock below zero.
     */
    public function adjust(
        Product $product,
        ?ProductVariant $variant,
        StockMovementType $type,
        int $mlChange = 0,
        int $qtyChange = 0,
        ?string $note = null,
        ?User $user = null,
        ?int $openBottleId = null,
    ): StockMovement {
        if (! in_array($type, [StockMovementType::Ajustement, StockMovementType::Perte], true)) {
            throw new ShopException('Type de mouvement invalide pour un ajustement.');
        }
        if ($mlChange === 0 && $qtyChange === 0) {
            throw new ShopException('Aucune quantité à ajuster.');
        }
        if ($type === StockMovementType::Perte && ($mlChange > 0 || $qtyChange > 0)) {
            throw new ShopException('Une perte ne peut que diminuer le stock.');
        }

        return $this->apply($product, $variant, $type, $mlChange, $qtyChange, null, $note, $user, $openBottleId);
    }

    /** Open a sealed bottle: -1 sealed unit, +ml in the decant pool (one transaction, two movements). */
    public function openBottle(ProductVariant $unitVariant, ?User $user = null): void
    {
        if ($unitVariant->stock_mode !== StockMode::Unit || ! $unitVariant->ml || $unitVariant->product?->kind !== ProductKind::Perfume) {
            throw new ShopException('Seul un flacon scellé (avec contenance) peut être ouvert.');
        }

        DB::transaction(function () use ($unitVariant, $user) {
            $product = Product::query()->lockForUpdate()->findOrFail($unitVariant->product_id);
            $variant = ProductVariant::query()->lockForUpdate()->findOrFail($unitVariant->id);

            if ($variant->stock_qty < 1) {
                throw new ShopException("Aucun flacon scellé « {$variant->label} » en stock.");
            }

            $note = "Flacon {$variant->ml} ml ouvert";
            $this->record($product, $variant, StockMovementType::OuvertureFlacon, 0, -1, null, null, $note, $user);
            $this->record($product, null, StockMovementType::OuvertureFlacon, $variant->ml, 0, null, null, $note, $user);

            $variant->decrement('stock_qty');
            $product->increment('stock_ml', $variant->ml);
            OpenBottle::create(['product_id' => $product->id, 'variant_id' => $variant->id, 'label' => "Flacon {$variant->ml} ml", 'capacity_ml' => $variant->ml, 'remaining_ml' => $variant->ml, 'opened_at' => now()]);
        });
    }

    /**
     * Take the stock of an order out. All-or-nothing: if anything is short nothing is written.
     *
     * @throws InsufficientStockException
     */
    public function deductForOrder(Order $order, ?User $user = null): void
    {
        if ($order->stock_deducted) {
            return;
        }

        DB::transaction(function () use ($order, $user) {
            $needs = ['ml' => [], 'units' => []];
            foreach ($order->items()->with('variant')->get() as $item) {
                if (! $item->variant) {
                    throw new ShopException("L'article « {$item->product_name} » n'existe plus.");
                }
                $this->expand($item->variant, $item->quantity, $needs, checkActive: false);
            }

            $products = $this->lockProducts(array_keys($needs['ml']));
            $variants = $this->lockVariants(array_keys($needs['units']));
            $bottleService = app(BottleService::class);
            $bottles = $bottleService->lockTracked(array_keys($needs['bottles'] ?? []));

            $shortages = [];
            foreach ($needs['ml'] as $productId => $ml) {
                if ($products[$productId]->stock_ml < $ml) {
                    $shortages[] = ['name' => $products[$productId]->name, 'unit' => 'ml', 'requested' => $ml, 'available' => $products[$productId]->stock_ml];
                }
            }
            foreach ($needs['bottles'] ?? [] as $ml => $count) {
                if ($bottles->has($ml) && $bottles[$ml]->qty < $count) {
                    $shortages[] = ['name' => "Bouteilles de {$ml} ml", 'unit' => 'bouteille(s)', 'requested' => $count, 'available' => $bottles[$ml]->qty];
                }
            }
            foreach ($needs['units'] as $variantId => $units) {
                if ($variants[$variantId]->stock_qty < $units) {
                    $v = $variants[$variantId];
                    $unit = $v->product->kind === ProductKind::Standard ? 'article(s)' : 'flacon(s)';
                    $shortages[] = ['name' => "{$v->product->name} ({$v->label})", 'unit' => $unit, 'requested' => $units, 'available' => $v->stock_qty];
                }
            }
            if ($shortages !== []) {
                throw new InsufficientStockException($shortages);
            }

            $type = $order->channel === OrderChannel::Pos ? StockMovementType::VenteCaisse : StockMovementType::VenteEnLigne;

            // Lines that name their bottle take from it first; the rest of each product's ml comes from the newest bottles.
            $named = [];
            foreach ($order->items()->with('variant.packItems.component')->get() as $item) {
                if ($item->open_bottle_id && $item->variant?->stock_mode === StockMode::Pool) {
                    $named[$item->product_id][] = [$item->open_bottle_id, (int) $item->variant->ml * $item->quantity];
                }
                // A pack: each decant component that names its bottle takes from that bottle.
                if ($item->component_bottles && $item->variant?->stock_mode === StockMode::Pack) {
                    foreach ($item->variant->packItems as $pack) {
                        $bottleId = $item->component_bottles[(string) $pack->component_variant_id] ?? null;
                        if ($bottleId && $pack->component?->stock_mode === StockMode::Pool) {
                            $named[$pack->component->product_id][] = [(int) $bottleId, (int) $pack->component->ml * $pack->quantity * $item->quantity];
                        }
                    }
                }
            }

            foreach ($needs['ml'] as $productId => $ml) {
                $this->record($products[$productId], null, $type, -$ml, 0, null, $order->id, $order->reference, $user);
                $products[$productId]->decrement('stock_ml', $ml);
                $fromNamed = 0;
                foreach ($named[$productId] ?? [] as [$bottleId, $amount]) {
                    $this->drawFromBottles($products[$productId], $amount, 'decanted_ml', $bottleId);
                    $fromNamed += $amount;
                }
                $this->drawFromBottles($products[$productId], $ml - $fromNamed, 'decanted_ml');
            }
            foreach ($needs['units'] as $variantId => $units) {
                $this->record($variants[$variantId]->product, $variants[$variantId], $type, 0, -$units, null, $order->id, $order->reference, $user);
                $variants[$variantId]->decrement('stock_qty', $units);
            }
            foreach ($needs['bottles'] ?? [] as $ml => $count) {
                if ($bottles->has($ml)) {
                    $bottleService->consume($bottles[$ml], $count, $order, $user);
                }
            }

            $order->forceFill(['stock_deducted' => true])->save();
        });
    }

    /**
     * Put an order's stock back (cancellation / return). Reverses exactly the movements
     * that deductForOrder wrote. Does nothing if the stock was not taken.
     */
    public function restoreForOrder(Order $order, StockMovementType $type = StockMovementType::Annulation, ?User $user = null): void
    {
        if (! $order->stock_deducted) {
            return;
        }

        DB::transaction(function () use ($order, $type, $user) {
            // Reverse the NET effect of the order (an order edited after confirmation has
            // been deducted, restored and deducted again: only the last deduction counts).
            $net = $order->stockMovements()->get()
                ->groupBy(fn (StockMovement $m) => $m->product_id.'|'.$m->variant_id)
                ->map(fn ($group) => [
                    'product_id' => $group->first()->product_id,
                    'variant_id' => $group->first()->variant_id,
                    'ml' => (int) $group->sum('ml_change'),
                    'qty' => (int) $group->sum('qty_change'),
                ])
                ->filter(fn (array $n) => $n['ml'] !== 0 || $n['qty'] !== 0);

            $products = $this->lockProducts($net->pluck('product_id')->unique()->all());
            $variants = $this->lockVariants($net->pluck('variant_id')->filter()->unique()->all());

            foreach ($net as $n) {
                $variant = $n['variant_id'] ? $variants[$n['variant_id']] : null;
                $this->record($products[$n['product_id']], $variant, $type, -$n['ml'], -$n['qty'], null, $order->id, $order->reference, $user);

                if ($n['ml'] !== 0) {
                    $products[$n['product_id']]->increment('stock_ml', -$n['ml']);
                }
                if ($n['ml'] < 0) {
                    $this->giveBack($products[$n['product_id']], -$n['ml']);
                }
                if ($n['qty'] !== 0) {
                    $variant->increment('stock_qty', -$n['qty']);
                }
            }

            app(BottleService::class)->restoreForOrder($order, $type, $user);

            $order->forceFill(['stock_deducted' => false])->save();
        });
    }

    /** Rebuild the cached totals of a product (and its sealed variants) from the ledger. */
    public function recalculate(Product $product): bool
    {
        return DB::transaction(function () use ($product) {
            $locked = Product::withTrashed()->lockForUpdate()->findOrFail($product->id);
            $changed = false;

            $ml = (int) $locked->stockMovements()->sum('ml_change');
            if ($locked->stock_ml !== $ml) {
                $locked->forceFill(['stock_ml' => $ml])->save();
                $changed = true;
            }

            foreach ($locked->variants()->where('stock_mode', StockMode::Unit)->lockForUpdate()->get() as $variant) {
                $qty = (int) StockMovement::query()->where('variant_id', $variant->id)->sum('qty_change');
                if ($variant->stock_qty !== $qty) {
                    $variant->forceFill(['stock_qty' => $qty])->save();
                    $changed = true;
                }
            }

            return $changed;
        });
    }

    /** Shared by addEntry() and adjust(): validate, lock, refuse negative stock, write movement + cache. */
    private function apply(
        Product $product,
        ?ProductVariant $variant,
        StockMovementType $type,
        int $ml,
        int $qty,
        ?int $unitCost,
        ?string $note,
        ?User $user,
        ?int $openBottleId = null,
    ): StockMovement {
        if (! $product->kind->hasOwnStock()) {
            throw new ShopException('Le stock se gère par produit, pas par pack.');
        }
        if ($qty !== 0) {
            if (! $variant || $variant->product_id !== $product->id || $variant->stock_mode !== StockMode::Unit) {
                throw new ShopException($product->kind === ProductKind::Standard
                    ? 'Les articles en stock se gèrent sur une variante « à l\'unité » de ce produit.'
                    : 'Les flacons scellés se gèrent sur une variante « flacon complet » de ce parfum.');
            }
        }

        return DB::transaction(function () use ($product, $variant, $type, $ml, $qty, $unitCost, $note, $user, $openBottleId) {
            $lockedProduct = Product::query()->lockForUpdate()->findOrFail($product->id);
            $lockedVariant = $variant ? ProductVariant::query()->lockForUpdate()->findOrFail($variant->id) : null;

            if ($lockedProduct->stock_ml + $ml < 0) {
                throw new ShopException("Stock insuffisant : {$lockedProduct->stock_ml} ml disponibles pour « {$lockedProduct->name} ».");
            }
            if ($qty !== 0 && $lockedVariant->stock_qty + $qty < 0) {
                $thing = $lockedProduct->kind === ProductKind::Standard ? 'article(s)' : 'flacon(s)';
                throw new ShopException("Stock insuffisant : {$lockedVariant->stock_qty} {$thing} disponibles pour « {$lockedProduct->name} ».");
            }

            $movement = $this->record($lockedProduct, $qty !== 0 ? $lockedVariant : null, $type, $ml, $qty, $unitCost, null, $note, $user, $openBottleId);

            if ($ml !== 0) {
                $lockedProduct->increment('stock_ml', $ml);
            }
            if ($ml < 0) {
                $this->drawFromBottles($lockedProduct, -$ml, $type === StockMovementType::Perte ? 'lost_ml' : 'adjusted_ml', $openBottleId);
            }
            if ($qty !== 0) {
                $lockedVariant->increment('stock_qty', $qty);
            }

            return $movement;
        });
    }

    /**
     * Cancel a hand-made movement (entry, loss, correction): its effect is reversed by a new movement, and the
     * original keeps its row, marked cancelled. Sales and order movements are never cancelled here.
     */
    public function cancelMovement(StockMovement $movement, ?User $user = null): void
    {
        if (! in_array($movement->type, [StockMovementType::Entree, StockMovementType::Perte, StockMovementType::Ajustement], true) || $movement->order_id !== null || $movement->cancelled_at !== null) {
            throw new ShopException("Ce mouvement ne peut pas être modifié : il vient d'une commande ou d'une vente, ou il est déjà annulé.");
        }

        DB::transaction(function () use ($movement, $user) {
            $product = Product::query()->lockForUpdate()->findOrFail($movement->product_id);
            $variant = $movement->variant_id ? ProductVariant::query()->lockForUpdate()->findOrFail($movement->variant_id) : null;
            $ml = (int) $movement->ml_change;
            $qty = (int) $movement->qty_change;

            if ($ml !== 0 && $product->stock_ml - $ml < 0) {
                throw new ShopException("Impossible d'annuler : il ne reste pas assez de ml dans « {$product->name} ».");
            }
            if ($qty !== 0 && $variant->stock_qty - $qty < 0) {
                throw new ShopException("Impossible d'annuler : il ne reste pas assez de « {$variant->label} ».");
            }

            if ($ml !== 0) {
                $product->decrement('stock_ml', $ml);
                $field = match ($movement->type) {
                    StockMovementType::Perte => 'lost_ml',
                    StockMovementType::Ajustement => 'adjusted_ml',
                    default => null,
                };
                if ($field !== null && $ml < 0) {
                    $this->giveBackTo($product, -$ml, $field, $movement->open_bottle_id);
                }
            }
            if ($qty !== 0) {
                $variant->decrement('stock_qty', $qty);
            }

            $this->record($product, $variant, StockMovementType::Ajustement, -$ml, -$qty, null, null, 'Annulation : '.($movement->note ?? $movement->type->value), $user);
            $movement->forceFill(['cancelled_at' => now()])->save();
        });
    }

    /** An opened bottle that has not been used yet (opened by mistake): its flacon goes back to the sealed stock. */
    public function discardOpenBottle(OpenBottle $bottle, ?User $user = null): void
    {
        if ($bottle->decanted_ml !== 0 || $bottle->lost_ml !== 0 || $bottle->adjusted_ml !== 0 || $bottle->remaining_ml !== $bottle->capacity_ml) {
            throw new ShopException('Ce flacon a déjà servi : on ne peut plus le supprimer. Corrigez plutôt les ventes ou les pertes.');
        }

        DB::transaction(function () use ($bottle, $user) {
            $product = Product::query()->lockForUpdate()->findOrFail($bottle->product_id);
            $variant = $bottle->variant_id ? ProductVariant::query()->lockForUpdate()->find($bottle->variant_id) : null;
            if ($product->stock_ml - $bottle->capacity_ml < 0) {
                throw new ShopException("Impossible : il ne reste pas assez de ml dans « {$product->name} ».");
            }

            $product->decrement('stock_ml', $bottle->capacity_ml);
            if ($variant) {
                $variant->increment('stock_qty');
            }
            $this->record($product, $variant, StockMovementType::Ajustement, -$bottle->capacity_ml, $variant ? 1 : 0, null, null, "Flacon ouvert par erreur ({$bottle->label})", $user);
            $bottle->delete();
        });
    }

    /** Give ml back to the bottle it came from (or the newest bottle that lost some of that kind). */
    private function giveBackTo(Product $product, int $ml, string $field, ?int $bottleId): void
    {
        if ($bottleId !== null) {
            $bottle = OpenBottle::query()->whereKey($bottleId)->lockForUpdate()->first();
            if ($bottle) {
                $back = min($ml, $bottle->{$field});
                $bottle->{$field} -= $back;
                $bottle->remaining_ml += $back;
                $bottle->save();
                $ml -= $back;
            }
        }

        $bottles = OpenBottle::query()->where('product_id', $product->id)->where($field, '>', 0)
            ->orderByDesc('opened_at')->orderByDesc('id')->lockForUpdate()->get();
        foreach ($bottles as $bottle) {
            if ($ml <= 0) {
                break;
            }
            $back = min($ml, $bottle->{$field});
            $bottle->{$field} -= $back;
            $bottle->remaining_ml += $back;
            $bottle->save();
            $ml -= $back;
        }
    }

    /**
     * Take `$ml` out of the open bottles: the chosen one, or else the newest bottle that still has ml (then the next).
     * What no bottle holds is bulk stock, which only the pool total knows about.
     */
    private function drawFromBottles(Product $product, int $ml, string $field, ?int $bottleId = null): void
    {
        if ($ml <= 0) {
            return;
        }

        if ($bottleId !== null) {
            $bottle = OpenBottle::query()->where('product_id', $product->id)->whereKey($bottleId)->lockForUpdate()->first()
                ?? throw new ShopException("Ce flacon n'appartient pas à « {$product->name} ».");
            if ($bottle->remaining_ml < $ml) {
                throw new ShopException("Il ne reste que {$bottle->remaining_ml} ml dans ce flacon.");
            }
            $bottle->remaining_ml -= $ml;
            $bottle->{$field} += $ml;
            $bottle->save();

            return;
        }

        $bottles = OpenBottle::query()->where('product_id', $product->id)->where('remaining_ml', '>', 0)
            ->orderByDesc('opened_at')->orderByDesc('id')->lockForUpdate()->get();

        foreach ($bottles as $bottle) {
            if ($ml <= 0) {
                break;
            }
            $take = min($ml, $bottle->remaining_ml);
            $bottle->remaining_ml -= $take;
            $bottle->{$field} += $take;
            $bottle->save();
            $ml -= $take;
        }
    }

    /** A sale cancelled or returned: the ml go back to the newest bottle they were taken from. */
    private function giveBack(Product $product, int $ml): void
    {
        $bottles = OpenBottle::query()->where('product_id', $product->id)->where('decanted_ml', '>', 0)
            ->orderByDesc('opened_at')->orderByDesc('id')->lockForUpdate()->get();

        foreach ($bottles as $bottle) {
            if ($ml <= 0) {
                break;
            }
            $back = min($ml, $bottle->decanted_ml);
            $bottle->decanted_ml -= $back;
            $bottle->remaining_ml += $back;
            $bottle->save();
            $ml -= $back;
        }
    }

    private function record(
        Product $product,
        ?ProductVariant $variant,
        StockMovementType $type,
        int $ml,
        int $qty,
        ?int $unitCost,
        ?int $orderId,
        ?string $note,
        ?User $user = null,
        ?int $openBottleId = null,
    ): StockMovement {
        return StockMovement::create([
            'product_id' => $product->id,
            'variant_id' => $variant?->id,
            'type' => $type,
            'ml_change' => $ml,
            'qty_change' => $qty,
            'unit_cost' => $unitCost,
            'order_id' => $orderId,
            'user_id' => $user?->id,
            'open_bottle_id' => $openBottleId,
            'note' => $note,
        ]);
    }

    /**
     * @param  array{ml: array<int, int>, units: array<int, int>}  $needs
     */
    private function expand(ProductVariant $variant, int $qty, array &$needs, bool $checkActive, bool $inPack = false): void
    {
        // Only new sales require the item to be on sale; an existing order can still be
        // fulfilled after the owner hides the perfume from the shop.
        if ($checkActive && (! $variant->is_active || ! $variant->product?->is_active)) {
            throw new ShopException("L'article « {$variant->label} » n'est plus en vente.");
        }

        switch ($variant->stock_mode) {
            case StockMode::Pool:
                if (! $variant->ml) {
                    throw new ShopException("La variante « {$variant->label} » n'a pas de contenance (ml).");
                }
                $needs['ml'][$variant->product_id] = ($needs['ml'][$variant->product_id] ?? 0) + $variant->ml * $qty;
                // Each decant goes in one empty bottle of its size (counted only for the sizes the shop tracks).
                $needs['bottles'][$variant->ml] = ($needs['bottles'][$variant->ml] ?? 0) + $qty;
                break;

            case StockMode::Unit:
                $needs['units'][$variant->id] = ($needs['units'][$variant->id] ?? 0) + $qty;
                break;

            case StockMode::Pack:
                if ($inPack) {
                    throw new ShopException('Un pack ne peut pas contenir un autre pack.');
                }
                $items = $variant->packItems()->with('component.product')->get();
                if ($items->isEmpty()) {
                    throw new ShopException("Le pack « {$variant->label} » est vide.");
                }
                foreach ($items as $item) {
                    $this->expand($item->component, $item->quantity * $qty, $needs, $checkActive, inPack: true);
                }
                break;
        }
    }

    /**
     * @param  list<int>  $ids
     * @return \Illuminate\Support\Collection<int, Product>
     */
    private function lockProducts(array $ids)
    {
        return Product::query()->withTrashed()->whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get()->keyBy('id');
    }

    /**
     * @param  list<int>  $ids
     * @return \Illuminate\Support\Collection<int, ProductVariant>
     */
    private function lockVariants(array $ids)
    {
        return ProductVariant::query()->with(['product' => fn ($q) => $q->withTrashed()])->whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get()->keyBy('id');
    }
}
