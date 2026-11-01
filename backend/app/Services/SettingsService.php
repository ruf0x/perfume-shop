<?php

namespace App\Services;

use App\Models\Setting;
use Illuminate\Support\Facades\Cache;

class SettingsService
{
    private const CACHE_KEY = 'settings.all';

    /** Defaults used until the owner saves a value. */
    public const DEFAULTS = [
        'shop_name' => 'Roze Sham',
        'shop_phone' => null,
        'shop_address' => null,
        'socials' => [],
        'show_unavailable' => false,
        'low_stock_threshold_ml' => 10,
        'low_stock_threshold_qty' => 3,
        'store_pickup_enabled' => true,
        'free_delivery_over' => null,
    ];

    /** @return array<string, mixed> */
    public function all(): array
    {
        // "counter.*" rows belong to OrderReference, not to the shop settings.
        $stored = Cache::rememberForever(self::CACHE_KEY, fn () => Setting::query()
            ->where('key', 'not like', 'counter.%')
            ->pluck('value', 'key')
            ->map(fn (?string $value) => json_decode($value ?? 'null', true))
            ->all());

        return array_merge(self::DEFAULTS, $stored);
    }

    public function get(string $key, mixed $default = null): mixed
    {
        return $this->all()[$key] ?? $default;
    }

    public function set(string $key, mixed $value): void
    {
        Setting::updateOrCreate(['key' => $key], ['value' => json_encode($value)]);
        Cache::forget(self::CACHE_KEY);
    }

    /** @param array<string, mixed> $values */
    public function setMany(array $values): void
    {
        foreach ($values as $key => $value) {
            $this->set($key, $value);
        }
    }

    public function showUnavailable(): bool
    {
        return (bool) $this->get('show_unavailable');
    }

    public function lowStockThresholdMl(): int
    {
        return (int) $this->get('low_stock_threshold_ml');
    }

    /** Cosmetics are counted in units: at or below this many left, they show as low in stock. */
    public function lowStockThresholdQty(): int
    {
        return (int) $this->get('low_stock_threshold_qty');
    }

    /** Whether customers can order beyond the stock without seeing it. A code switch (config/features.php). */
    public function backorderEnabled(): bool
    {
        return (bool) config('features.backorder');
    }

    /** Whether the admin can be used from the website. A code switch (config/features.php), not an admin setting. */
    public function webAdminEnabled(): bool
    {
        return (bool) config('features.web_admin');
    }

    public function storePickupEnabled(): bool
    {
        return (bool) $this->get('store_pickup_enabled');
    }

    public function freeDeliveryOver(): ?int
    {
        $value = $this->get('free_delivery_over');

        return $value === null ? null : (int) $value;
    }
}
