<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Customer-account routes: a signed-in user with a customer profile. */
class EnsureCustomer
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (! $user || $user->is_staff || ! $user->isActive()) {
            return response()->json(['message' => 'Please sign in with your mobile number.', 'code' => 'customer_only'], 403);
        }

        $customer = $user->customer()->first();
        if (! $customer) {
            return response()->json(['message' => 'Customer profile not found.', 'code' => 'customer_only'], 403);
        }
        $request->attributes->set('customer', $customer);

        return $next($request);
    }
}
