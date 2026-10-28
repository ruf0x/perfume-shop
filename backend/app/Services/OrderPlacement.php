<?php

namespace App\Services;

use App\Enums\DeliveryMode;
use App\Enums\OrderChannel;
use App\Enums\OrderStatus;
use App\Enums\PaymentMethod;
use App\Exceptions\InsufficientStockException;
use App\Exceptions\ShopException;
use App\Models\Commune;
use App\Models\Customer;
use App\Models\Order;
use App\Models\User;
use App\Support\Phone;
use App\Support\Quote;
use App\Support\QuoteLine;
use Illuminate\Support\Facades\DB;

class OrderPlacement
{
    public function __construct(
        private Pricing $pricing,
        private StockService $stock,
        private OrderReference $references,
    ) {}

    /**
     * A client order from the shop: pending, cash on delivery, stock untouched until the owner confirms.
     *
     * @param  array{first_name: string, last_name: string, phone: string, phone2?: ?string, wilaya_id?: ?int, commune_id?: ?int, address?: ?string, delivery_mode: string, customer_note?: ?string, lines: list<array{variant_id: int, quantity: int}>}  $data
     */
    public function placeOnline(array $data, ?string $ip = null): Order
    {
        $phone = Phone::normalize($data['phone'] ?? null) ?? throw new ShopException('Numéro de téléphone invalide.');
        $phone2 = filled($data['phone2'] ?? null)
            ? (Phone::normalize($data['phone2']) ?? throw new ShopException('Second numéro de téléphone invalide.'))
            : null;
        $mode = DeliveryMode::tryFrom($data['delivery_mode'] ?? '') ?? throw new ShopException('Mode de livraison invalide.');

        if ($mode !== DeliveryMode::Boutique && blank($data['address'] ?? null)) {
            throw new ShopException("L'adresse est obligatoire pour une livraison.");
        }

        $wilayaId = $data['wilaya_id'] ?? null;
        $communeId = $data['commune_id'] ?? null;
        if ($communeId && ! Commune::query()->whereKey($communeId)->where('wilaya_id', $wilayaId)->exists()) {
            throw new ShopException("Cette commune n'appartient pas à la wilaya choisie.");
        }

        return DB::transaction(function () use ($data, $phone, $phone2, $mode, $wilayaId, $communeId, $ip) {
            if (Customer::query()->where('phone', $phone)->where('is_blacklisted', true)->exists()) {
                throw new ShopException('Impossible de passer commande avec ce numéro. Contactez la boutique.');
            }

            $quote = $this->pricing->quote($data['lines'], $wilayaId, $mode);
            $this->assertAvailable($quote);

            $customer = $this->upsertCustomer($phone, $data['first_name'], $data['last_name'], $wilayaId, $communeId, $data['address'] ?? null);
            $customer->increment('orders_count');

            $order = Order::create([
                'reference' => $this->references->next(OrderChannel::Online),
                'channel' => OrderChannel::Online,
                'status' => OrderStatus::EnAttente,
                'customer_id' => $customer->id,
                'first_name' => $data['first_name'],
                'last_name' => $data['last_name'],
                'phone' => $phone,
                'phone2' => $phone2,
                'wilaya_id' => $wilayaId,
                'commune_id' => $communeId,
                'address' => $data['address'] ?? null,
                'delivery_mode' => $mode,
                'customer_note' => $data['customer_note'] ?? null,
                'subtotal' => $quote->subtotal,
                'delivery_fee' => $quote->deliveryFee,
                'discount' => 0,
                'total' => $quote->total,
                'payment_method' => PaymentMethod::Cod,
                'ip_address' => $ip,
            ]);

            $this->createItems($order, $quote);
            $this->logCreation($order, OrderStatus::EnAttente, null, 'Commande passée en ligne');

            return $order->load('items');
        });
    }

    /**
     * A sale at the counter: completed immediately, stock deducted immediately.
     *
     * @param  array{lines: list<array{variant_id: int, quantity: int}>, discount?: int, payment_method?: string, amount_received?: ?int, first_name?: ?string, last_name?: ?string, phone?: ?string}  $data
     */
    public function placePos(array $data, User $user): Order
    {
        $payment = PaymentMethod::tryFrom($data['payment_method'] ?? PaymentMethod::Especes->value);
        if (! $payment || $payment === PaymentMethod::Cod) {
            throw new ShopException('Mode de paiement invalide.');
        }

        $phone = filled($data['phone'] ?? null)
            ? (Phone::normalize($data['phone']) ?? throw new ShopException('Numéro de téléphone invalide.'))
            : null;

        return DB::transaction(function () use ($data, $user, $payment, $phone) {
            $quote = $this->pricing->quote($data['lines'], discount: (int) ($data['discount'] ?? 0));
            $this->assertAvailable($quote);

            $received = isset($data['amount_received']) ? (int) $data['amount_received'] : null;
            if ($payment === PaymentMethod::Especes && ($received === null || $received < $quote->total)) {
                throw new ShopException('Le montant reçu est inférieur au total.');
            }

            $customer = null;
            if ($phone) {
                $customer = $this->upsertCustomer($phone, $data['first_name'] ?? 'Client', $data['last_name'] ?? 'Boutique');
                $customer->increment('orders_count');
            }

            $order = Order::create([
                'reference' => $this->references->next(OrderChannel::Pos),
                'channel' => OrderChannel::Pos,
                'status' => OrderStatus::VendueBoutique,
                'customer_id' => $customer?->id,
                'first_name' => $data['first_name'] ?? null,
                'last_name' => $data['last_name'] ?? null,
                'phone' => $phone,
                'delivery_mode' => DeliveryMode::Boutique,
                'subtotal' => $quote->subtotal,
                'delivery_fee' => 0,
                'discount' => $quote->discount,
                'total' => $quote->total,
                'payment_method' => $payment,
                'amount_received' => $received,
                'completed_at' => now(),
                'created_by' => $user->id,
            ]);

            $this->createItems($order, $quote);
            $this->stock->deductForOrder($order, $user);
            $this->logCreation($order, OrderStatus::VendueBoutique, $user, 'Vente en caisse');

            return $order->load('items');
        });
    }

    private function assertAvailable(Quote $quote): void
    {
        $shortages = collect($quote->lines)
            ->reject(fn (QuoteLine $line) => $line->available())
            ->map(fn (QuoteLine $line) => [
                'name' => "{$line->variant->product->name} ({$line->variant->label})",
                'unit' => 'unité(s)',
                'requested' => $line->quantity,
                'available' => $line->maxQty,
            ])
            ->values()
            ->all();

        if ($shortages !== []) {
            throw new InsufficientStockException($shortages);
        }
    }

    /** Snapshot the lines: later price/name changes never alter an existing order. */
    private function createItems(Order $order, Quote $quote): void
    {
        foreach ($quote->lines as $line) {
            $order->items()->create([
                'product_id' => $line->variant->product_id,
                'variant_id' => $line->variant->id,
                'product_name' => $line->variant->product->name,
                'variant_label' => $line->variant->label,
                'ml' => $line->variant->ml,
                'unit_price' => $line->unitPrice,
                'quantity' => $line->quantity,
                'line_total' => $line->lineTotal,
            ]);
        }
    }

    private function upsertCustomer(string $phone, string $firstName, string $lastName, ?int $wilayaId = null, ?int $communeId = null, ?string $address = null): Customer
    {
        $customer = Customer::query()->firstOrNew(['phone' => $phone]);
        $customer->fill(array_filter([
            'first_name' => $firstName,
            'last_name' => $lastName,
            'wilaya_id' => $wilayaId,
            'commune_id' => $communeId,
            'address' => $address,
        ], fn ($value) => $value !== null))->save();

        return $customer;
    }

    private function logCreation(Order $order, OrderStatus $status, ?User $user, string $note): void
    {
        $order->history()->create([
            'from_status' => null,
            'to_status' => $status,
            'user_id' => $user?->id,
            'note' => $note,
        ]);
    }
}
