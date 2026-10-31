<?php

namespace App\Services;

use App\Enums\DeliveryMode;
use App\Exceptions\ShopException;
use App\Models\ProductVariant;
use App\Models\Wilaya;
use App\Support\Quote;
use App\Support\QuoteLine;

class Pricing
{
    public function __construct(private StockService $stock) {}

    /**
     * Price a cart from the database. Prices, delivery fee and availability are all
     * recomputed here; the client only supplies variant ids and quantities.
     *
     * At the caisse ($allowPriceOverride) the cashier may sell a line at another price than the
     * catalogue's (a negotiated price): that is the only way a client-sent price is ever used.
     *
     * @param  list<array{variant_id: int, quantity: int, unit_price?: ?int}>  $lines
     */
    public function quote(array $lines, ?int $wilayaId = null, ?DeliveryMode $mode = null, int $discount = 0, bool $allowPriceOverride = false): Quote
    {
        $quantities = [];
        $prices = [];
        foreach ($lines as $line) {
            $quantity = (int) $line['quantity'];
            if ($quantity < 1) {
                throw new ShopException('Quantité invalide.');
            }
            $quantities[(int) $line['variant_id']] = ($quantities[(int) $line['variant_id']] ?? 0) + $quantity;
            if ($allowPriceOverride && isset($line['unit_price'])) {
                if ((int) $line['unit_price'] < 0) {
                    throw new ShopException('Prix invalide.');
                }
                $prices[(int) $line['variant_id']] = (int) $line['unit_price'];
            }
        }
        if ($quantities === []) {
            throw new ShopException('Le panier est vide.');
        }

        $variants = ProductVariant::query()->with('product')->whereIn('id', array_keys($quantities))->get()->keyBy('id');

        $quoteLines = [];
        $subtotal = 0;
        foreach ($quantities as $variantId => $quantity) {
            $variant = $variants->get($variantId) ?? throw new ShopException('Un article du panier est introuvable.');

            $unitPrice = $prices[$variantId] ?? $variant->price;
            $lineTotal = $unitPrice * $quantity;
            $subtotal += $lineTotal;
            $quoteLines[] = new QuoteLine($variant, $quantity, $unitPrice, $lineTotal, $this->stock->maxQty($variant));
        }

        if ($discount < 0 || $discount > $subtotal) {
            throw new ShopException('Remise invalide.');
        }

        $fee = $this->deliveryFee($subtotal, $wilayaId, $mode);

        return new Quote($quoteLines, $subtotal, $fee, $discount, $subtotal + $fee - $discount);
    }

    private function deliveryFee(int $subtotal, ?int $wilayaId, ?DeliveryMode $mode): int
    {
        if ($mode === null) {
            return 0; // caisse: no delivery
        }

        if ($mode === DeliveryMode::Boutique) {
            if (! settings()->storePickupEnabled()) {
                throw new ShopException("Le retrait en boutique n'est pas disponible.");
            }

            return 0;
        }

        $wilaya = $wilayaId ? Wilaya::find($wilayaId) : null;
        if (! $wilaya || ! $wilaya->is_active) {
            throw new ShopException("Nous ne livrons pas dans cette wilaya.");
        }

        $freeOver = settings()->freeDeliveryOver();
        if ($freeOver !== null && $subtotal >= $freeOver) {
            return 0;
        }

        return $mode === DeliveryMode::StopDesk ? $wilaya->desk_fee : $wilaya->home_fee;
    }
}
