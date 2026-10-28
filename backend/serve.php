<?php

/**
 * Local dev server:  composer serve   (or: php serve.php [host] [port])
 *
 * `php artisan serve` starts PHP without a temporary directory on some Windows setups (Herd's php.ini),
 * which makes every file upload fail with "unable to create a temporary file". This starts the same
 * built-in server with the upload directory set explicitly.
 */
$host = $argv[1] ?? '127.0.0.1';
$port = $argv[2] ?? '8000';
$router = __DIR__.'/vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php';

echo "Perfume Shop API on http://{$host}:{$port} (Ctrl+C to stop)\n";

// Laravel's router script looks for index.php in the working directory.
chdir(__DIR__.'/public');

passthru(sprintf(
    '"%s" -d upload_tmp_dir=%s -d upload_max_filesize=16M -d post_max_size=32M -S %s:%s -t %s %s',
    PHP_BINARY,
    escapeshellarg(sys_get_temp_dir()),
    $host,
    $port,
    escapeshellarg(__DIR__.'/public'),
    escapeshellarg($router),
));
