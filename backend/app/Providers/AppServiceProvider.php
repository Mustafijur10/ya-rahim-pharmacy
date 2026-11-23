<?php

namespace App\Providers;

use App\Models;
use App\Services\Sms\LogSmsGateway;
use App\Services\Sms\SmsGateway;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // Swap for the real provider's gateway once an SMS account is set up.
        $this->app->singleton(SmsGateway::class, LogSmsGateway::class);
    }

    public function boot(): void
    {
        // Short, stable names in polymorphic columns (stock_movements.reference_type, etc.)
        // so renaming a PHP class never breaks old rows.
        Relation::enforceMorphMap([
            'user' => Models\User::class,
            'order' => Models\Order::class,
            'purchase' => Models\Purchase::class,
            'sale_return' => Models\SaleReturn::class,
            'stock_adjustment' => Models\StockAdjustment::class,
            'approval_request' => Models\ApprovalRequest::class,
            'medicine' => Models\Medicine::class,
            'batch' => Models\Batch::class,
            'prescription' => Models\Prescription::class,
            'customer' => Models\Customer::class,
            'delivery' => Models\Delivery::class,
            'shift' => Models\Shift::class,
            'supplier' => Models\Supplier::class,
            'supplier_payment' => Models\SupplierPayment::class,
        ]);

        // Brute-force protection for sign-in and SMS codes.
        RateLimiter::for('login', fn (Request $request) => [
            Limit::perMinute(5)->by('login|'.strtolower((string) $request->input('login', $request->input('phone'))).'|'.$request->ip()),
            Limit::perMinute(20)->by('login-ip|'.$request->ip()),
        ]);
        RateLimiter::for('otp', fn (Request $request) => [
            Limit::perHour(6)->by('otp|'.preg_replace('/\D/', '', (string) $request->input('phone'))),
            Limit::perHour(30)->by('otp-ip|'.$request->ip()),
        ]);
        RateLimiter::for('uploads', fn (Request $request) => Limit::perHour(30)->by('upload|'.($request->user()?->id ?: $request->ip())));

        // Catch N+1 queries while developing.
        Model::preventLazyLoading(! $this->app->isProduction());
    }
}
