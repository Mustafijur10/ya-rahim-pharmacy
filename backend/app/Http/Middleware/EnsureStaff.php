<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Only active staff accounts may use the admin and rider APIs. */
class EnsureStaff
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user || ! $user->is_staff) {
            return response()->json(['message' => 'Staff only.', 'code' => 'forbidden'], 403);
        }
        if (! $user->isActive()) {
            return response()->json(['message' => 'Your account is inactive. Contact the owner.', 'code' => 'inactive'], 403);
        }

        // "Last active" on the Staff screen, written at most once a minute.
        if (! $user->last_active_at || $user->last_active_at->lt(now()->subMinute())) {
            $user->forceFill(['last_active_at' => now()])->saveQuietly();
        }

        return $next($request);
    }
}
