<?php

namespace App\Http\Middleware;

use App\Support\Features;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** ->middleware('feature:blood_donors'): the route answers 404 while that module is turned off. */
class EnsureFeature
{
    public function handle(Request $request, Closure $next, string $feature): Response
    {
        if (! Features::enabled($feature)) {
            return response()->json(['message' => 'This feature is turned off.', 'code' => 'feature_off'], 404);
        }

        return $next($request);
    }
}
