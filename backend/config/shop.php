<?php

return [

    /*
    | Owner account created by AdminSeeder. Read from env here (not in the seeder)
    | so it keeps working when the config is cached.
    */
    'admin' => [
        'name' => env('ADMIN_NAME', 'Propriétaire'),
        'username' => env('ADMIN_USERNAME', 'admin'),
        'password' => env('ADMIN_PASSWORD'),
    ],

    /*
    | Bearer-token login (POST /api/admin/token) for Postman / Swagger testing. Cookie sessions are
    | what the real frontend uses; keep this off in production.
    */
    'dev_tokens' => env('DEV_API_TOKENS', env('APP_ENV') === 'local'),

    /*
    | Database backups (php artisan db:backup, run weekly by the scheduler). Keep the folder OUTSIDE
    | the web root. On cPanel: BACKUP_PATH=/home/USER/backups
    */
    'backup_path' => env('BACKUP_PATH', storage_path('app/backups')),
    'dump_binary' => env('DB_DUMP_BINARY', 'mysqldump'),

    // Default delivery fees (DZD) seeded for every wilaya; editable in the admin.
    'default_home_fee' => 600,
    'default_desk_fee' => 400,

];
