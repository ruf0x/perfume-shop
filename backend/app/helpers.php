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

if (! function_exists('media_url')) {
    /** Public URL of a file stored on the "public" disk (null when there is none). */
    function media_url(?string $path): ?string
    {
        return $path ? \Illuminate\Support\Facades\Storage::disk('public')->url($path) : null;
    }
}
