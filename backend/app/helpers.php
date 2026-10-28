<?php

use App\Services\SettingsService;

if (! function_exists('settings')) {
    /**
     * Shop settings: settings() returns the service, settings('key', $default) one value.
     */
    function settings(?string $key = null, mixed $default = null): mixed
    {
        $service = app(SettingsService::class);

        return $key === null ? $service : $service->get($key, $default);
    }
}
