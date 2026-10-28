<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Usage: ->middleware('role:owner'). The owner can do everything staff can. */
class EnsureRole
{
    public function handle(Request $request, Closure $next, string $role): Response
    {
        $user = $request->user();

        if (! $user || ($user->role->value !== $role && ! $user->isOwner())) {
            return response()->json(['message' => "Vous n'avez pas accès à cette section."], 403);
        }

        return $next($request);
    }
}
