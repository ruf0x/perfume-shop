<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

/**
 * The website-admin switch (config/features.php, `web_admin`). When it is off, the admin can only be used from the
 * desktop app, which signs in with a token: every call that comes through a browser session is refused.
 *
 * Note: this closes the web admin (page, login and session calls); it is not a firewall. The token sign-in of the
 * desktop app stays open, and is protected by the username, the password and the login throttle.
 */
class EnsureWebAdminAllowed
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! settings()->webAdminEnabled() && ! $this->usesToken($request)) {
            return self::denied();
        }

        return $next($request);
    }

    /** A Bearer token (desktop app) rather than a cookie session (website). */
    private function usesToken(Request $request): bool
    {
        return $request->user()?->currentAccessToken() instanceof PersonalAccessToken;
    }

    /** 403 with a stable `code` the website recognises to show its "use the desktop app" page. */
    public static function denied(): JsonResponse
    {
        return response()->json([
            'message' => "L'administration sur le site web est désactivée. Utilisez l'application de bureau.",
            'code' => 'web_admin_disabled',
        ], 403);
    }
}
