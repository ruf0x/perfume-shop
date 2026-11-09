<?php

namespace App\Console\Commands;

use Illuminate\Foundation\Console\ServeCommand;

/**
 * `php artisan serve`, with a folder for uploaded files.
 *
 * On some Windows installs (Herd's php.ini) PHP's built-in server has no usable temporary folder, so every upload
 * fails before Laravel even runs ("File upload error - unable to create a temporary file") and no photo can be added.
 * That setting can only be given when PHP starts, so this command starts the same server with it. It replaces the
 * framework's `serve`: nothing else changes (host, port, workers, reloading on .env changes).
 */
class Serve extends ServeCommand
{
    protected function serverCommand()
    {
        $uploads = storage_path('app/tmp');
        if (! is_dir($uploads)) {
            @mkdir($uploads, 0777, true);
        }

        [$php, $flag, $address, $router] = parent::serverCommand();

        return [$php, '-d', 'upload_tmp_dir='.$uploads, '-d', 'upload_max_filesize=16M', '-d', 'post_max_size=32M', $flag, $address, $router];
    }
}
