<?php

namespace App\Models;

use App\Enums\DeliveryMode;
use App\Enums\OrderChannel;
use App\Enums\OrderStatus;
use App\Enums\PaymentMethod;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

class Order extends Model
{
    protected $guarded = ['id'];

    // Mirror the column defaults so a freshly created order is correct without a reload.
    protected $attributes = [
        'stock_deducted' => false,
        'call_attempts' => 0,
        'discount' => 0,
    ];

    protected function casts(): array
    {
        return [
            'channel' => OrderChannel::class,
            'status' => OrderStatus::class,
            'delivery_mode' => DeliveryMode::class,
            'payment_method' => PaymentMethod::class,
            'subtotal' => 'integer',
            'delivery_fee' => 'integer',
            'discount' => 'integer',
            'total' => 'integer',
            'amount_received' => 'integer',
            'call_attempts' => 'integer',
            'stock_deducted' => 'boolean',
            'confirmed_at' => 'datetime',
            'shipped_at' => 'datetime',
            'delivered_at' => 'datetime',
            'completed_at' => 'datetime',
            'cancelled_at' => 'datetime',
            'returned_at' => 'datetime',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function wilaya(): BelongsTo
    {
        return $this->belongsTo(Wilaya::class);
    }

    public function commune(): BelongsTo
    {
        return $this->belongsTo(Commune::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    public function history(): HasMany
    {
        return $this->hasMany(OrderStatusHistory::class)->orderBy('id');
    }

    public function stockMovements(): HasMany
    {
        return $this->hasMany(StockMovement::class);
    }

    public function scopeStatus(Builder $query, OrderStatus|string $status): Builder
    {
        return $query->where('status', $status);
    }

    public function scopeChannel(Builder $query, OrderChannel|string $channel): Builder
    {
        return $query->where('channel', $channel);
    }

    /**
     * Admin list filters: status, channel, from, to, wilaya_id, customer_id, min_total, max_total, q.
     *
     * @param  array<string, mixed>  $filters
     */
    public function scopeFilter(Builder $query, array $filters): Builder
    {
        return $query
            ->when($filters['status'] ?? null, fn (Builder $q, string $status) => $q->where('status', $status))
            ->when($filters['channel'] ?? null, fn (Builder $q, string $channel) => $q->where('channel', $channel))
            ->between($filters['from'] ?? null, $filters['to'] ?? null)
            ->when($filters['wilaya_id'] ?? null, fn (Builder $q, int $id) => $q->where('wilaya_id', $id))
            ->when($filters['customer_id'] ?? null, fn (Builder $q, int $id) => $q->where('customer_id', $id))
            ->when(isset($filters['min_total']), fn (Builder $q) => $q->where('total', '>=', $filters['min_total']))
            ->when(isset($filters['max_total']), fn (Builder $q) => $q->where('total', '<=', $filters['max_total']))
            ->when($filters['q'] ?? null, fn (Builder $q, string $term) => $q->where(fn (Builder $w) => $w
                ->where('reference', 'like', "%{$term}%")
                ->orWhere('phone', 'like', "%{$term}%")
                ->orWhere('first_name', 'like', "%{$term}%")
                ->orWhere('last_name', 'like', "%{$term}%")
                ->orWhereRaw("concat(first_name, ' ', last_name) like ?", ["%{$term}%"])));
    }

    public function scopeBetween(Builder $query, Carbon|string|null $from, Carbon|string|null $to): Builder
    {
        return $query
            ->when($from, fn (Builder $q) => $q->where('created_at', '>=', Carbon::parse($from)->startOfDay()))
            ->when($to, fn (Builder $q) => $q->where('created_at', '<=', Carbon::parse($to)->endOfDay()));
    }
}
