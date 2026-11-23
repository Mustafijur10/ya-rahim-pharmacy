<?php

use App\Http\Middleware\EnsureCustomer;
use App\Http\Middleware\EnsureFeature;
use App\Http\Middleware\EnsureModuleAccess;
use App\Http\Middleware\EnsureStaff;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Spatie\Permission\Middleware\PermissionMiddleware;
use Spatie\Permission\Middleware\RoleMiddleware;
use Spatie\Permission\Middleware\RoleOrPermissionMiddleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Cookie-based Sanctum sessions for the Next.js site and admin.
        $middleware->statefulApi();

        $middleware->alias([
            'role' => RoleMiddleware::class,
            'permission' => PermissionMiddleware::class,
            'role_or_permission' => RoleOrPermissionMiddleware::class,
            'staff' => EnsureStaff::class,
            'module' => EnsureModuleAccess::class,
            'customer' => EnsureCustomer::class,
            'feature' => EnsureFeature::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Always answer API requests with JSON, never an HTML error page.
        $exceptions->shouldRenderJsonWhen(fn ($request) => $request->is('api/*') || $request->expectsJson());
    })->create();
