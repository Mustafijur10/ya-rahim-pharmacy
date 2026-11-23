<?php

use App\Http\Controllers\Api\Account\AccountController;
use App\Http\Controllers\Api\Admin\ApprovalController;
use App\Http\Controllers\Api\Admin\CustomerController;
use App\Http\Controllers\Api\Admin\DashboardController;
use App\Http\Controllers\Api\Admin\InventoryController;
use App\Http\Controllers\Api\Admin\MedicineController;
use App\Http\Controllers\Api\Admin\ModulesController;
use App\Http\Controllers\Api\Admin\OperationsController;
use App\Http\Controllers\Api\Admin\OrderController;
use App\Http\Controllers\Api\Admin\PosController;
use App\Http\Controllers\Api\Admin\PrescriptionController;
use App\Http\Controllers\Api\Admin\PurchaseController;
use App\Http\Controllers\Api\Admin\SettingsController;
use App\Http\Controllers\Api\Admin\ShiftController;
use App\Http\Controllers\Api\Admin\StaffController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\Rider\RiderController;
use App\Http\Controllers\Api\Store\CatalogController;
use App\Http\Controllers\Api\Store\StoreRequestController;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

/*
 * Ya Rahim Pharmacy API
 *
 * /api/auth/*     sign-in (staff: password or PIN, customers: SMS code)
 * /api/store/*    public catalog, cart quote
 * /api/account/*  signed-in customer (checkout, orders, prescriptions, refills)
 * /api/admin/*    staff; every route checks the permission grid (module:level)
 * /api/rider/*    delivery riders
 */

Route::get('/health', function () {
    DB::connection()->getPdo();

    return response()->json(['status' => 'ok', 'app' => config('app.name'), 'database' => DB::connection()->getDatabaseName(), 'time' => now()->toIso8601String()]);
});

/* ---------------- Auth ---------------- */
Route::prefix('auth')->group(function () {
    Route::post('staff/login', [AuthController::class, 'staffLogin'])->middleware('throttle:login');
    Route::post('otp/request', [AuthController::class, 'requestOtp'])->middleware('throttle:otp');
    Route::post('otp/verify', [AuthController::class, 'verifyOtp'])->middleware('throttle:login');
    Route::post('customer/login', [AuthController::class, 'customerLogin'])->middleware('throttle:login');
    Route::get('staff/directory', [AuthController::class, 'staffDirectory'])->middleware('throttle:30,1');

    Route::middleware('auth:sanctum')->group(function () {
        Route::get('me', [AuthController::class, 'me']);
        Route::post('logout', [AuthController::class, 'logout']);
    });
});

/* ---------------- Public store ---------------- */
Route::prefix('store')->controller(CatalogController::class)->group(function () {
    Route::get('home', 'home');
    Route::get('settings', 'settings');
    Route::get('categories', 'categories');
    Route::get('companies', 'companies');
    Route::get('medicines', 'medicines');
    Route::get('medicines/suggest', 'suggest')->middleware('throttle:120,1');
    Route::get('medicines/{slug}', 'show');
    Route::get('delivery-areas', 'deliveryAreas');
    Route::post('cart/quote', 'quote')->middleware('throttle:60,1');
});
Route::prefix('store')->controller(StoreRequestController::class)->group(function () {
    Route::post('prescription-requests', 'prescriptionRequest')->middleware('throttle:uploads');
    Route::post('contact', 'contact')->middleware('throttle:5,10');
});

/* ---------------- Customer account ---------------- */
Route::prefix('account')->middleware(['auth:sanctum', 'customer'])->controller(AccountController::class)->group(function () {
    Route::get('profile', 'profile');
    Route::put('profile', 'updateProfile');
    Route::put('password', 'setPassword');

    Route::post('checkout', 'checkout')->middleware('throttle:20,1');
    Route::get('orders', 'orders');
    Route::get('orders/{code}', 'order');
    Route::post('orders/{code}/cancel', 'cancelOrder');
    Route::post('orders/{code}/prescription', 'attachPrescription');

    Route::get('addresses', 'addresses');
    Route::post('addresses', 'saveAddress');
    Route::put('addresses/{id}', 'saveAddress');
    Route::delete('addresses/{id}', 'deleteAddress');

    Route::get('prescriptions', 'prescriptions');
    Route::post('prescriptions', 'uploadPrescription')->middleware('throttle:uploads');
    Route::get('prescriptions/{prescriptionId}/pages/{pageId}', 'prescriptionPage');

    Route::get('refills', 'refills');
    Route::post('refills', 'createRefill');
    Route::patch('refills/{id}', 'updateRefill');
});

/* ---------------- Admin (staff) ---------------- */
Route::prefix('admin')->middleware(['auth:sanctum', 'staff'])->group(function () {

    // Dashboards
    Route::get('dashboard', [DashboardController::class, 'index'])->middleware('module:dashboard,full,view');
    Route::get('dashboard/counter', [DashboardController::class, 'counter'])->middleware('module:pos');
    Route::get('dashboard/pharmacist', [DashboardController::class, 'pharmacist'])->middleware('module:rx');

    // POS & shifts
    Route::middleware('module:pos')->group(function () {
        Route::get('pos/search', [PosController::class, 'search']);
        Route::post('pos/quote', [PosController::class, 'quote']);
        Route::post('pos/sales', [PosController::class, 'sell']);
        Route::get('pos/held', [PosController::class, 'held']);
        Route::post('pos/held', [PosController::class, 'hold']);
        Route::post('pos/held/{heldSale}/resume', [PosController::class, 'resume']);
        Route::get('pos/customers', [PosController::class, 'customers']);
        Route::post('pos/customers', [PosController::class, 'createCustomer']);
        Route::get('pos/receipts/{order}', [PosController::class, 'receipt']);

        Route::get('shifts/current', [ShiftController::class, 'current']);
        Route::post('shifts', [ShiftController::class, 'open']);
        Route::post('shifts/{shift}/close', [ShiftController::class, 'close']);
        Route::get('shifts', [ShiftController::class, 'index']);
    });

    // Orders (online, phone, and shop sales history)
    Route::middleware('module:orders,full,view')->group(function () {
        Route::get('orders', [OrderController::class, 'index']);
        Route::get('orders/stats', [OrderController::class, 'stats']);
        Route::get('orders/{order}', [OrderController::class, 'show']);
    });
    Route::middleware('module:orders')->group(function () {
        Route::post('orders/phone', [OrderController::class, 'storePhoneOrder']);
        Route::post('orders/{order}/transition', [OrderController::class, 'transition']);
        Route::post('orders/{order}/cancel', [OrderController::class, 'cancel']);
        Route::post('orders/{order}/assign-rider', [OrderController::class, 'assignRider']);
        Route::post('orders/{order}/collect', [OrderController::class, 'collectPickup']);
    });
    Route::post('orders/{order}/returns', [OrderController::class, 'requestReturn'])->middleware('module:returns,full,approval');

    // Prescriptions
    Route::middleware('module:rx,full,view')->group(function () {
        Route::get('prescriptions', [PrescriptionController::class, 'index']);
        Route::get('prescriptions/{prescription}', [PrescriptionController::class, 'show']);
        Route::get('prescriptions/{prescription}/pages/{page}', [PrescriptionController::class, 'page']);
    });
    Route::middleware('module:rx')->group(function () {
        Route::post('orders/{order}/verify-rx', [OrderController::class, 'verifyRx']);
        Route::post('orders/{order}/reject-rx', [OrderController::class, 'rejectRx']);
    });
    Route::post('prescriptions', [PrescriptionController::class, 'store'])->middleware(['module:pos', 'throttle:uploads']);

    // Approvals: everyone sees their own; deciding is checked per type in ApprovalService.
    Route::get('approvals', [ApprovalController::class, 'index']);
    Route::post('approvals', [ApprovalController::class, 'store'])->middleware('module:pos');
    Route::get('approvals/{approval}', [ApprovalController::class, 'show']);
    Route::post('approvals/{approval}/approve', [ApprovalController::class, 'approve']);
    Route::post('approvals/{approval}/reject', [ApprovalController::class, 'reject']);

    // Inventory & catalog
    Route::middleware('module:inventory,full,view')->group(function () {
        Route::get('inventory', [InventoryController::class, 'index']);
        Route::get('inventory/summary', [InventoryController::class, 'summary']);
        Route::get('inventory/movements', [InventoryController::class, 'movements']);
        Route::get('medicines', [MedicineController::class, 'index']);
        Route::get('medicines/references', [MedicineController::class, 'references']);
        Route::get('medicines/{medicine}', [MedicineController::class, 'show']);
    });
    Route::middleware('module:inventory')->group(function () {
        Route::post('medicines', [MedicineController::class, 'store']);
        Route::put('medicines/{medicine}', [MedicineController::class, 'update']);
        Route::delete('medicines/{medicine}', [MedicineController::class, 'destroy']);
        Route::post('categories', [MedicineController::class, 'saveCategory']);
        Route::put('categories/{category}', [MedicineController::class, 'saveCategory']);
        Route::post('companies', [MedicineController::class, 'saveCompany']);
        Route::put('companies/{company}', [MedicineController::class, 'saveCompany']);
        Route::post('generics', [MedicineController::class, 'saveGeneric']);
        Route::put('generics/{generic}', [MedicineController::class, 'saveGeneric']);
    });
    Route::middleware('module:stock_adjustment,full,approval')->group(function () {
        Route::post('inventory/adjustments', [InventoryController::class, 'adjust']);
        Route::get('inventory/adjustments', [InventoryController::class, 'adjustments']);
    });

    // Purchases & suppliers
    Route::middleware('module:purchases')->group(function () {
        Route::get('purchases', [PurchaseController::class, 'index']);
        Route::get('purchases/{purchase}', [PurchaseController::class, 'show']);
        Route::post('purchases', [PurchaseController::class, 'store']);
        Route::get('suppliers', [MedicineController::class, 'suppliers']);
        Route::post('suppliers', [MedicineController::class, 'saveSupplier']);
        Route::put('suppliers/{supplier}', [MedicineController::class, 'saveSupplier']);
    });

    // Customers
    Route::middleware('module:customers,full,view')->group(function () {
        Route::get('customers', [CustomerController::class, 'index']);
        Route::get('customers/{customer}', [CustomerController::class, 'show']);
    });
    Route::middleware('module:customers')->group(function () {
        Route::post('customers', [CustomerController::class, 'store']);
        Route::put('customers/{customer}', [CustomerController::class, 'update']);
    });

    // Deliveries & riders
    Route::middleware('module:orders')->group(function () {
        Route::get('riders', [OperationsController::class, 'riders']);
        Route::get('deliveries', [OperationsController::class, 'deliveries']);
        Route::post('riders/{rider}/settle', [OperationsController::class, 'settleRider']);
    });

    // Cold chain (pharmacists and managers)
    Route::middleware('module:inventory,full,view')->group(function () {
        Route::get('temperature-logs', [OperationsController::class, 'temperatures']);
        Route::post('temperature-logs', [OperationsController::class, 'logTemperature']);
    });

    // Staff, roles, activity
    Route::middleware('module:staff,full,view')->group(function () {
        Route::get('staff', [StaffController::class, 'index']);
        Route::get('roles', [StaffController::class, 'roles']);
        Route::get('activity', [StaffController::class, 'activity']);
    });
    Route::middleware('module:staff')->group(function () {
        Route::post('staff', [StaffController::class, 'store']);
        Route::put('staff/{staff}', [StaffController::class, 'update']);
        Route::post('staff/{staff}/pin', [StaffController::class, 'resetPin']);
        Route::put('roles/{role}', [StaffController::class, 'updateRole']);
    });

    // Modules & features (super admin)
    Route::middleware('module:modules')->group(function () {
        Route::get('modules', [ModulesController::class, 'index']);
        Route::put('modules', [ModulesController::class, 'update']);
    });

    // Settings (owner)
    Route::middleware('module:settings')->group(function () {
        Route::get('settings', [SettingsController::class, 'index']);
        Route::put('settings', [SettingsController::class, 'update']);
        Route::post('delivery-areas', [SettingsController::class, 'saveArea']);
        Route::put('delivery-areas/{area}', [SettingsController::class, 'saveArea']);
    });
});

/* ---------------- Rider app ---------------- */
Route::prefix('rider')->middleware(['auth:sanctum', 'staff', 'role:rider'])->controller(RiderController::class)->group(function () {
    Route::get('today', 'today');
    Route::get('history', 'history');
    Route::get('deliveries/{id}', 'show');
    Route::post('deliveries/{id}/pickup', 'pickUp');
    Route::post('deliveries/{id}/complete', 'complete');
    Route::post('deliveries/{id}/fail', 'fail');
});
