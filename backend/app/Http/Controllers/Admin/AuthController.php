<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\ChangePasswordRequest;
use App\Http\Requests\Admin\LoginRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /**
     * Sign in (cookie session). Call `GET /sanctum/csrf-cookie` first.
     *
     * Throttled to 5 attempts per minute per username + IP.
     */
    public function login(LoginRequest $request): UserResource
    {
        // Sanctum only starts a session for requests coming from a whitelisted frontend origin.
        abort_unless($request->hasSession(), 400, "Requête non reconnue : envoyez l'en-tête Origin (ou Referer) du site, par ex. http://localhost:5173.");

        $credentials = $request->validated() + ['is_active' => true];

        if (! Auth::guard('web')->attempt($credentials)) {
            throw ValidationException::withMessages(['username' => 'Identifiants incorrects.']);
        }

        $request->session()->regenerate();

        $user = $request->user('web');
        $user->forceFill(['last_login_at' => now()])->save();

        return new UserResource($user);
    }

    /**
     * Get a Bearer token for Postman / Swagger testing (local development only, 404 elsewhere).
     *
     * Send it as `Authorization: Bearer <token>`. No cookie or CSRF header needed.
     */
    public function token(LoginRequest $request): JsonResponse
    {
        abort_unless(config('shop.dev_tokens'), 404);

        $user = User::query()->where('username', $request->validated('username'))->where('is_active', true)->first();

        if (! $user || ! Hash::check($request->validated('password'), $user->password)) {
            throw ValidationException::withMessages(['username' => 'Identifiants incorrects.']);
        }

        $user->tokens()->where('name', 'dev')->delete();

        return response()->json(['token' => $user->createToken('dev')->plainTextToken, 'user' => new UserResource($user)]);
    }

    public function logout(Request $request): Response
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->noContent();
    }

    /** The signed-in admin (use it on page load to know if the session is still valid). */
    public function me(Request $request): UserResource
    {
        return new UserResource($request->user());
    }

    public function changePassword(ChangePasswordRequest $request): Response
    {
        $request->user()->update(['password' => $request->validated('password')]);

        return response()->noContent();
    }
}
