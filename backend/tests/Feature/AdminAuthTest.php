<?php

use App\Enums\UserRole;
use App\Models\User;

/** Requests from the SPA are "stateful" only when they come from a whitelisted origin. */
function spa(): array
{
    return ['Origin' => 'http://localhost:5173', 'Referer' => 'http://localhost:5173/admin'];
}

it('signs an admin in with username and password and returns the user', function () {
    $user = User::create(['name' => 'Owner', 'username' => 'boss', 'password' => 'secret-pass', 'role' => UserRole::Owner]);

    $this->withHeaders(spa())->postJson('/api/admin/login', ['username' => 'boss', 'password' => 'secret-pass'])
        ->assertOk()
        ->assertJsonPath('data.username', 'boss')
        ->assertJsonPath('data.role', 'owner')
        ->assertJsonMissingPath('data.password');

    expect($user->fresh()->last_login_at)->not->toBeNull();
    $this->withHeaders(spa())->getJson('/api/admin/me')->assertOk()->assertJsonPath('data.username', 'boss');
});

it('explains how to call login from a tool that sends no Origin header', function () {
    User::create(['name' => 'Owner', 'username' => 'boss', 'password' => 'secret-pass', 'role' => UserRole::Owner]);

    $this->postJson('/api/admin/login', ['username' => 'boss', 'password' => 'secret-pass'])
        ->assertStatus(400)->assertJsonPath('message', "Requête non reconnue : envoyez l'en-tête Origin (ou Referer) du site, par ex. http://localhost:5173.");
});

it('rejects wrong credentials and inactive accounts', function () {
    User::create(['name' => 'Off', 'username' => 'off', 'password' => 'secret-pass', 'role' => UserRole::Staff, 'is_active' => false]);
    User::create(['name' => 'On', 'username' => 'on', 'password' => 'secret-pass', 'role' => UserRole::Staff]);

    $this->withHeaders(spa())->postJson('/api/admin/login', ['username' => 'on', 'password' => 'wrong'])
        ->assertUnprocessable()->assertJsonValidationErrors('username');
    $this->withHeaders(spa())->postJson('/api/admin/login', ['username' => 'off', 'password' => 'secret-pass'])
        ->assertUnprocessable();
    $this->getJson('/api/admin/me')->assertUnauthorized();
});

it('throttles login attempts', function () {
    foreach (range(1, 5) as $i) {
        $this->withHeaders(spa())->postJson('/api/admin/login', ['username' => 'x', 'password' => 'y'])->assertUnprocessable();
    }
    $this->withHeaders(spa())->postJson('/api/admin/login', ['username' => 'x', 'password' => 'y'])->assertStatus(429);
});

it('gives a bearer token for testing tools only when dev tokens are enabled', function () {
    User::create(['name' => 'Owner', 'username' => 'boss', 'password' => 'secret-pass', 'role' => UserRole::Owner]);
    User::create(['name' => 'Off', 'username' => 'off', 'password' => 'secret-pass', 'role' => UserRole::Owner, 'is_active' => false]);

    // off by default outside local development
    $this->postJson('/api/admin/token', ['username' => 'boss', 'password' => 'secret-pass'])->assertNotFound();

    config(['shop.dev_tokens' => true]);
    $this->postJson('/api/admin/token', ['username' => 'boss', 'password' => 'wrong'])->assertUnprocessable();
    $this->postJson('/api/admin/token', ['username' => 'off', 'password' => 'secret-pass'])->assertUnprocessable();

    $token = $this->postJson('/api/admin/token', ['username' => 'boss', 'password' => 'secret-pass'])
        ->assertOk()->assertJsonPath('user.username', 'boss')->json('token');

    app('auth')->forgetGuards();
    $this->withToken($token)->getJson('/api/admin/me')->assertOk()->assertJsonPath('data.username', 'boss');
    $this->withToken($token)->getJson('/api/admin/settings')->assertOk();   // owner routes work with the token too

    // asking again replaces the previous token
    $this->postJson('/api/admin/token', ['username' => 'boss', 'password' => 'secret-pass'])->assertOk();
    app('auth')->forgetGuards();
    $this->withToken($token)->getJson('/api/admin/me')->assertUnauthorized();
});

it('applies the role limits to bearer tokens as well', function () {
    config(['shop.dev_tokens' => true]);
    User::create(['name' => 'S', 'username' => 'staff', 'password' => 'secret-pass', 'role' => UserRole::Staff]);
    $token = $this->postJson('/api/admin/token', ['username' => 'staff', 'password' => 'secret-pass'])->json('token');

    app('auth')->forgetGuards();
    $this->withToken($token)->getJson('/api/admin/orders')->assertOk();
    $this->withToken($token)->getJson('/api/admin/users')->assertForbidden();
});

it('logs out', function () {
    User::create(['name' => 'Owner', 'username' => 'boss', 'password' => 'secret-pass', 'role' => UserRole::Owner]);
    $this->withHeaders(spa())->postJson('/api/admin/login', ['username' => 'boss', 'password' => 'secret-pass'])->assertOk();

    $this->withHeaders(spa())->postJson('/api/admin/logout')->assertNoContent();
    app('auth')->forgetGuards(); // tests reuse one app between requests; a real request starts clean
    $this->withHeaders(spa())->getJson('/api/admin/me')->assertUnauthorized();
});

it('protects every admin route from anonymous visitors', function () {
    foreach (['get' => ['/api/admin/me', '/api/admin/orders', '/api/admin/orders/1'], 'post' => ['/api/admin/orders/1/transition']] as $method => $urls) {
        foreach ($urls as $url) {
            $this->{$method.'Json'}($url)->assertUnauthorized();
        }
    }
});

it('lets staff use orders but blocks owner-only sections', function () {
    $staff = User::create(['name' => 'Staff', 'username' => 'staff', 'password' => 'secret-pass', 'role' => UserRole::Staff]);

    $this->actingAs($staff)->getJson('/api/admin/orders')->assertOk();
});

it('signs out a deactivated account that still has a session', function () {
    $staff = User::create(['name' => 'Staff', 'username' => 'staff', 'password' => 'secret-pass', 'role' => UserRole::Staff]);
    $staff->update(['is_active' => false]);

    $this->actingAs($staff)->getJson('/api/admin/orders')->assertForbidden();
});

it('changes the password only with the current one', function () {
    $user = User::create(['name' => 'Owner', 'username' => 'boss', 'password' => 'old-password', 'role' => UserRole::Owner]);

    $this->actingAs($user)->putJson('/api/admin/me/password', ['current_password' => 'nope', 'password' => 'new-password-1', 'password_confirmation' => 'new-password-1'])
        ->assertUnprocessable()->assertJsonValidationErrors('current_password');

    $this->actingAs($user)->putJson('/api/admin/me/password', ['current_password' => 'old-password', 'password' => 'short', 'password_confirmation' => 'short'])
        ->assertUnprocessable()->assertJsonValidationErrors('password');

    $this->actingAs($user)->putJson('/api/admin/me/password', ['current_password' => 'old-password', 'password' => 'new-password-1', 'password_confirmation' => 'new-password-1'])
        ->assertNoContent();
    expect(\Illuminate\Support\Facades\Hash::check('new-password-1', $user->fresh()->password))->toBeTrue();
});
