<?php

namespace App\Services;

use App\Enums\OrderChannel;
use App\Enums\ProductKind;
use App\Enums\StockMode;
use App\Enums\StockMovementType;
use App\Exceptions\InsufficientStockException;
use App\Exceptions\ShopException;
use App\Models\Order;
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

        return $limits === [] ? 0 : max(0, min($limits));
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

        return $this->apply($product, $variant, $type, $mlChange, $qtyChange, null, $note, $user);
    }

    /** Open a sealed bottle: -1 sealed unit, +ml in the decant pool (one transaction, two movements). */
    public function openBottle(ProductVariant $unitVariant, ?User $user = null): void
    {
        if ($unitVariant->stock_mode !== StockMode::Unit || ! $unitVariant->ml) {
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
        });
    }

    /**
     * Take the stock of an order out. All-or-nothing: if anything is short nothing is written.
     *
     * @throws InsufficientStockException
     */
    public function deductForOrder(Order $order): void
    {
        if ($order->stock_deducted) {
            return;
        }

        DB::transaction(function () use ($order) {
            $needs = ['ml' => [], 'units' => []];
            foreach ($order->items()->with('variant')->get() as $item) {
                if (! $item->variant) {
                    throw new ShopException("L'article « {$item->product_name} » n'existe plus.");
                }
                $this->expand($item->variant, $item->quantity, $needs, checkActive: false);
            }

            $products = $this->lockProducts(array_keys($needs['ml']));
            $variants = $this->lockVariants(array_keys($needs['units']));

            $shortages = [];
            foreach ($needs['ml'] as $productId => $ml) {
                if ($products[$productId]->stock_ml < $ml) {
                    $shortages[] = ['name' => $products[$productId]->name, 'unit' => 'ml', 'requested' => $ml, 'available' => $products[$productId]->stock_ml];
                }
            }
            foreach ($needs['units'] as $variantId => $units) {
                if ($variants[$variantId]->stock_qty < $units) {
                    $v = $variants[$variantId];
                    $shortages[] = ['name' => "{$v->product->name} ({$v->label})", 'unit' => 'flacon(s)', 'requested' => $units, 'available' => $v->stock_qty];
                }
            }
            if ($shortages !== []) {
                throw new InsufficientStockException($shortages);
            }

            $type = $order->channel === OrderChannel::Pos ? StockMovementType::VenteCaisse : StockMovementType::VenteEnLigne;

            foreach ($needs['ml'] as $productId => $ml) {
                $this->record($products[$productId], null, $type, -$ml, 0, null, $order->id, $order->reference);
                $products[$productId]->decrement('stock_ml', $ml);
            }
            foreach ($needs['units'] as $variantId => $units) {
                $this->record($variants[$variantId]->product, $variants[$variantId], $type, 0, -$units, null, $order->id, $order->reference);
                $variants[$variantId]->decrement('stock_qty', $units);
            }

            $order->forceFill(['stock_deducted' => true])->save();
        });
    }

    /**
     * Put an order's stock back (cancellation / return). Reverses exactly the movements
     * that deductForOrder wrote. Does nothing if the stock was not taken.
     */
    public function restoreForOrder(Order $order, StockMovementType $type = StockMovementType::Annulation): void
    {
        if (! $order->stock_deducted) {
            return;
        }

        DB::transaction(function () use ($order, $type) {
            $sales = $order->stockMovements()
                ->whereIn('type', [StockMovementType::VenteEnLigne, StockMovementType::VenteCaisse])
                ->get();

            $products = $this->lockProducts($sales->pluck('product_id')->unique()->all());
            $variants = $this->lockVariants($sales->pluck('variant_id')->filter()->unique()->all());

            foreach ($sales as $sale) {
                $this->record($products[$sale->product_id], $sale->variant_id ? $variants[$sale->variant_id] : null, $type, -$sale->ml_change, -$sale->qty_change, null, $order->id, $order->reference);

                if ($sale->ml_change !== 0) {
                    $products[$sale->product_id]->increment('stock_ml', -$sale->ml_change);
                }
                if ($sale->qty_change !== 0) {
                    $variants[$sale->variant_id]->increment('stock_qty', -$sale->qty_change);
                }
            }

            $order->forceFill(['stock_deducted' => false])->save();
        });
    }

    /** Rebuild the cached totals of a product (and its sealed variants) from the ledger. */
    public function recalculate(Product $product): bool
    {
        return DB::transaction(function () use ($product) {
            $locked = Product::query()->lockForUpdate()->findOrFail($product->id);
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
    ): StockMovement {
        if ($product->kind !== ProductKind::Perfume) {
            throw new ShopException('Le stock se gère par parfum, pas par pack.');
        }
        if ($qty !== 0) {
            if (! $variant || $variant->product_id !== $product->id || $variant->stock_mode !== StockMode::Unit) {
                throw new ShopException('Les flacons scellés se gèrent sur une variante « flacon complet » de ce parfum.');
            }
        }

        return DB::transaction(function () use ($product, $variant, $type, $ml, $qty, $unitCost, $note, $user) {
            $lockedProduct = Product::query()->lockForUpdate()->findOrFail($product->id);
            $lockedVariant = $variant ? ProductVariant::query()->lockForUpdate()->findOrFail($variant->id) : null;

            if ($lockedProduct->stock_ml + $ml < 0) {
                throw new ShopException("Stock insuffisant : {$lockedProduct->stock_ml} ml disponibles pour « {$lockedProduct->name} ».");
            }
            if ($qty !== 0 && $lockedVariant->stock_qty + $qty < 0) {
                throw new ShopException("Stock insuffisant : {$lockedVariant->stock_qty} flacon(s) disponibles pour « {$lockedProduct->name} ».");
            }

            $movement = $this->record($lockedProduct, $qty !== 0 ? $lockedVariant : null, $type, $ml, $qty, $unitCost, null, $note, $user);

            if ($ml !== 0) {
                $lockedProduct->increment('stock_ml', $ml);
            }
            if ($qty !== 0) {
                $lockedVariant->increment('stock_qty', $qty);
            }

            return $movement;
        });
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
