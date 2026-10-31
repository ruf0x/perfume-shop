<?php

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Support\Facades\Artisan;
use Laravel\Sanctum\PersonalAccessToken;

/** The desktop app signs in with a token; the website's admin can be switched off. */
function desktopUser(array $overrides = []): User
{
    return User::create($overrides + ['name' => 'Owner', 'username' => 'boss', 'password' => 'secret-pass', 'role' => UserRole::Owner]);
}

/** A request from the website's admin: stateful only from a whitelisted origin. */
function desktopSpa(): array
{
    return ['Origin' => 'http://localhost:5173', 'Referer' => 'http://localhost:5173/admin'];
}

function desktopLogin($test, string $username = 'boss', string $password = 'secret-pass')
{
    return $test->postJson('/api/admin/desktop/login', ['username' => $username, 'password' => $password]);
}

describe('desktop sign-in', function () {
    it('returns a token that works as a Bearer, without any cookie', function () {
        desktopUser();

        $res = desktopLogin($this)->assertOk()->assertJsonPath('user.username', 'boss');
        $token = $res->json('token');

        expect($token)->toBeString()->and(PersonalAccessToken::count())->toBe(1);

        $this->withToken($token)->getJson('/api/admin/me')->assertOk()->assertJsonPath('data.username', 'boss');
        $this->flushHeaders();   // the test keeps the Bearer header it was given
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/admin/me')->assertUnauthorized();   // no token, no session
    });

    it('expires its token after 30 days', function () {
        desktopUser();
        desktopLogin($this)->assertOk();

        $expires = PersonalAccessToken::first()->expires_at;
        expect(now()->diffInDays($expires))->toBeGreaterThan(29)->and(now()->diffInDays($expires))->toBeLessThanOrEqual(30);

        $this->travel(31)->days();
        $this->withToken(desktopLogin($this)->json('token'))->getJson('/api/admin/me')->assertOk();   // a fresh one works
    });

    it('refuses wrong passwords and deactivated users', function () {
        desktopUser();
        desktopUser(['username' => 'gone', 'is_active' => false]);

        desktopLogin($this, 'boss', 'nope')->assertUnprocessable()->assertJsonValidationErrors('username');
        desktopLogin($this, 'gone')->assertUnprocessable();
        expect(PersonalAccessToken::count())->toBe(0);
    });

    it('signing out deletes the token that was used, and only that one', function () {
        desktopUser();
        $first = desktopLogin($this)->json('token');
        $second = desktopLogin($this)->json('token');

        $this->withToken($first)->postJson('/api/admin/logout')->assertNoContent();

        expect(PersonalAccessToken::count())->toBe(1);
        $this->app['auth']->forgetGuards();
        $this->withToken($second)->getJson('/api/admin/me')->assertOk();
    });

    it('lets staff sign in too, with their own limits', function () {
        desktopUser(['username' => 'caissier', 'role' => UserRole::Staff]);
        $token = desktopLogin($this, 'caissier')->json('token');

        $this->withToken($token)->getJson('/api/admin/orders')->assertOk();
        $this->withToken($token)->getJson('/api/admin/settings')->assertForbidden();
    });
});

describe('administration on the website', function () {
    it('is on by default and says so to the website', function () {
        expect(settings()->webAdminEnabled())->toBeTrue();
        $this->getJson('/api/settings/public')->assertOk()->assertJsonPath('data.web_admin_enabled', true);
    });

    it('refuses the website sign-in and every browser session call once it is switched off', function () {
        $user = desktopUser();
        settings()->set('web_admin_enabled', false);

        $this->getJson('/api/settings/public')->assertJsonPath('data.web_admin_enabled', false);

        // sign in through the website
        $this->withHeaders(desktopSpa())->postJson('/api/admin/login', ['username' => 'boss', 'password' => 'secret-pass'])
            ->assertForbidden()->assertJsonPath('code', 'web_admin_disabled');

        // an already open browser session
        $this->actingAs($user)->getJson('/api/admin/me')->assertForbidden()->assertJsonPath('code', 'web_admin_disabled');
        $this->getJson('/api/admin/orders')->assertForbidden();
        $this->getJson('/api/admin/orders/999999')->assertForbidden();   // 403, not 404, before route binding
    });

    it('keeps the desktop app fully working while it is off', function () {
        desktopUser();
        settings()->set('web_admin_enabled', false);

        $token = desktopLogin($this)->assertOk()->json('token');

        $this->withToken($token)->getJson('/api/admin/me')->assertOk();
        $this->withToken($token)->getJson('/api/admin/orders')->assertOk();
        $this->withToken($token)->putJson('/api/admin/settings', ['web_admin_enabled' => true])->assertOk()->assertJsonPath('data.web_admin_enabled', true);

        // switched back on: the website works again
        $this->app['auth']->forgetGuards();
        $this->withHeaders(desktopSpa())->postJson('/api/admin/login', ['username' => 'boss', 'password' => 'secret-pass'])->assertOk();
    });

    it('can be switched off by the owner from the settings', function () {
        $this->actingAs(desktopUser())->putJson('/api/admin/settings', ['web_admin_enabled' => false])->assertOk()->assertJsonPath('data.web_admin_enabled', false);

        expect(settings()->webAdminEnabled())->toBeFalse();
        $this->getJson('/api/admin/me')->assertForbidden();   // the very next browser call is refused
    });

    it('does not touch the shop itself', function () {
        settings()->set('web_admin_enabled', false);

        $this->getJson('/api/products')->assertOk();
        $this->getJson('/api/product-types')->assertOk();
        $this->getJson('/api/settings/public')->assertOk();
    });

    it('has a rescue command to switch it back on', function () {
        settings()->set('web_admin_enabled', false);

        Artisan::call('admin:web', ['state' => 'on']);
        expect(settings()->webAdminEnabled())->toBeTrue()->and(Artisan::output())->toContain('activée');

        Artisan::call('admin:web', ['state' => 'off']);
        expect(settings()->webAdminEnabled())->toBeFalse();

        expect(Artisan::call('admin:web', ['state' => 'maybe']))->not->toBe(0);
        Artisan::call('admin:web');
        expect(Artisan::output())->toContain('désactivée');
    });
});

describe('desktop app origin', function () {
    it('is allowed by CORS (the app loads from app://local)', function () {
        $this->withHeaders(['Origin' => 'app://local', 'Access-Control-Request-Method' => 'POST', 'Access-Control-Request-Headers' => 'authorization,content-type'])
            ->options('/api/admin/desktop/login')
            ->assertSuccessful()
            ->assertHeader('Access-Control-Allow-Origin', 'app://local');
    });
});
