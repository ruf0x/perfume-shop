<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;

it('signs everyone out by deleting sessions and tokens', function () {
    $user = makeOwner();
    $user->createToken('dev');
    DB::table('sessions')->insert(['id' => 'abc', 'user_id' => $user->id, 'ip_address' => '127.0.0.1', 'user_agent' => 'test', 'payload' => '', 'last_activity' => time()]);

    $this->artisan('auth:sign-out-everyone')->assertSuccessful();

    expect(DB::table('sessions')->count())->toBe(0)
        ->and(DB::table('personal_access_tokens')->count())->toBe(0)
        ->and(User::count())->toBe(1);   // accounts are untouched
});
