<?php

namespace App\Services;

use App\Models\Setting;
use Illuminate\Support\Facades\Cache;

class SettingsService
{
    private const CACHE_KEY = 'settings.all';

    /** Defaults used until the owner saves a value. */
    public const DEFAULTS = [
        'shop_name' => 'Arena Cosmétique',
        'shop_phone' => null,
        'shop_address' => 'MCR6+39H LPP Hayet Regency, Oran',
        'socials' => [
            'instagram' => 'https://www.instagram.com/arenecosmetique/',
            'facebook' => 'https://web.facebook.com/people/Arena-cosm%C3%A9tique-Oran-hayate-regenci-lpp-Oran/61581182056275/',
            'tiktok' => 'https://www.tiktok.com/@arenacosmetiq',
        ],
        'show_unavailable' => false,
        'low_stock_threshold_ml' => 10,
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
