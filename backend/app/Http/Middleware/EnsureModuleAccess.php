<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Permission-grid check on a route.
 *   ->middleware('module:pos')                    full access required
 *   ->middleware('module:orders,full,view')       any of these levels
 */
class EnsureModuleAccess
{
    public function handle(Request $request, Closure $next, string $module, string ...$levels): Response
    {
        if (! $request->user()?->hasModuleAccess($module, ...$levels)) {
            return response()->json([
                'message' => 'You do not have access to this section.',
                'code' => 'forbidden',
            ], 403);
        }

        return $next($request);
    }
}
