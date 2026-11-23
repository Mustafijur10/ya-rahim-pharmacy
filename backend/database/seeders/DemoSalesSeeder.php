<?php

namespace Database\Seeders;

use App\Enums\OrderStatus;
use App\Exceptions\InsufficientStockException;
use App\Models\Customer;
use App\Models\DeliveryArea;
use App\Models\Medicine;
use App\Models\Order;
use App\Models\Prescription;
use App\Models\User;
use App\Services\ApprovalService;
use App\Services\DeliveryService;
use App\Services\OrderService;
use App\Services\PosService;
use App\Services\PricingService;
use App\Services\ShiftService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

/**
 * DEMO DATA for development: a week of counter sales and online orders in every state,
 * created through the real services so stock, payments and history stay consistent.
 * Runs only outside production.
 */
class DemoSalesSeeder extends Seeder
{
    public function run(): void
    {
        if (app()->isProduction()) {
            return;
        }
        mt_srand(7);

        $pos = app(PosService::class);
        $orders = app(OrderService::class);
        $shifts = app(ShiftService::class);

        $cashier = User::role('cashier')->firstOrFail();
        $manager = User::role('manager')->firstOrFail();
        $pharmacist = User::role('pharmacist')->firstOrFail();
        $rider = User::role('rider')->firstOrFail();
        $customers = Customer::whereNotNull('phone')->limit(12)->get();
        $area = DeliveryArea::firstOrFail();

        // Only medicines with plenty of stock and no Rx (so the cashier can sell them alone).
        $otc = Medicine::active()->where('rx_required', false)
            ->whereHas('batches', fn ($q) => $q->where('quantity', '>=', 200)->whereDate('expiry_date', '>', now()->addMonths(3)))
            ->pluck('id')->all();
        $rx = Medicine::active()->where('rx_required', true)
            ->whereHas('batches', fn ($q) => $q->where('quantity', '>=', 100)->whereDate('expiry_date', '>', now()->addMonths(3)))
            ->pluck('id')->all();

        $pick = fn (array $ids, int $n) => collect($ids)->shuffle()->take($n)->map(fn ($id) => ['medicine_id' => $id, 'quantity' => mt_rand(1, 2)])->values()->all();

        // ---- 6 past days + today of counter sales -------------------------------------
        // Take the real "now" first: setTestNow() below would otherwise shift every later day.
        $base = now()->copy();
        for ($daysAgo = 6; $daysAgo >= 0; $daysAgo--) {
            $day = $base->copy()->subDays($daysAgo)->setTime(9, 0);
            Carbon::setTestNow($day);
            foreach ([$cashier, $manager] as $seller) {
                $shift = $seller->openShift()->first() ?? $shifts->open($seller, 5000, $seller->is($cashier) ? 'Counter 1' : 'Counter 2');

                $sales = mt_rand(4, 7);
                for ($i = 0; $i < $sales; $i++) {
                    Carbon::setTestNow($day->copy()->addMinutes(20 + $i * mt_rand(30, 70)));
                    $items = $pick($otc, mt_rand(1, 3));
                    // Counter sales at MRP (no discount): the total is the MRP subtotal of the FEFO batches.
                    $total = app(PricingService::class)->quote($items, $seller->branch_id)['subtotal'];
                    $roll = mt_rand(1, 100);
                    $method = $roll <= 55 ? 'cash' : ($roll <= 80 ? 'bkash' : ($roll <= 90 ? 'nagad' : 'card'));
                    try {
                        $pos->sell($seller, [
                            'items' => $items,
                            'customer_id' => mt_rand(0, 2) ? null : $customers->random()->id,
                            'payments' => [[
                                'method' => $method,
                                'amount' => $total,
                                'received_amount' => $method === 'cash' ? ceil($total / 100) * 100 : null,
                                'transaction_id' => $method === 'cash' ? null : strtoupper($method).mt_rand(100000, 999999),
                            ]],
                        ]);
                    } catch (InsufficientStockException) {
                        // Demo data only: skip a sale when a medicine runs low.
                    }
                }

                if ($daysAgo > 0) {
                    Carbon::setTestNow($day->copy()->setTime(21, 0));
                    $shifts->close($shift->fresh(), $seller, $shifts->summary($shift->fresh())['expected_cash']);
                }
            }
        }
        Carbon::setTestNow();

        // Re-pick from what's still well stocked after a week of counter sales.
        $wellStocked = fn (bool $rxOnly) => Medicine::active()->where('rx_required', $rxOnly)
            ->whereHas('batches', fn ($q) => $q->where('quantity', '>=', 60)->whereDate('expiry_date', '>', now()->addMonths(3)))
            ->pluck('id')->all();
        $otc = $wellStocked(false);
        $rx = $wellStocked(true);

        // ---- Online orders in every state ---------------------------------------------
        $online = function (array $items, string $type, ?int $rxId, Customer $c, int $minutesAgo) use ($orders, $area) {
            Carbon::setTestNow(now()->subMinutes($minutesAgo));
            $o = $orders->placeOnline([
                'items' => $items,
                'delivery_type' => $type,
                'delivery_area_id' => $area->id,
                'recipient_name' => $c->name,
                'recipient_phone' => $c->phone,
                'delivery_address' => '[House, road, area]',
                'prescription_id' => $rxId,
                'payment_method' => $type === 'pickup' ? 'pay_at_shop' : 'cash',
            ], $c);
            Carbon::setTestNow();

            return $o;
        };
        $rxFor = fn (Customer $c) => Prescription::create(['customer_id' => $c->id, 'status' => 'pending'])->id;

        // Waiting for the pharmacist (oldest first)
        foreach ([37, 31, 22, 14] as $i => $mins) {
            $c = $customers[$i];
            $online($pick($rx, 1) + [1 => ['medicine_id' => $otc[$i], 'quantity' => 1]], 'standard', $rxFor($c), $c, $mins);
        }
        // New (no Rx)
        $online($pick($otc, 2), 'express', null, $customers[4], 9);
        // Packing → rider assigned → out for delivery
        $o = $online($pick($rx, 1), 'express', $rxFor($customers[5]), $customers[5], 95);
        $orders->verifyPrescription($o, $pharmacist, 'Prescription verified. Dr. name and date checked.');
        $d = app(DeliveryService::class)->assign($o->fresh(), $manager, $rider);
        app(DeliveryService::class)->pickUp($d, $rider);
        // Delivered earlier today
        $o = $online($pick($otc, 3), 'standard', null, $customers[6], 300);
        $orders->transition($o, OrderStatus::Packing, $manager);
        $d = app(DeliveryService::class)->assign($o->fresh(), $manager, $rider);
        app(DeliveryService::class)->pickUp($d, $rider);
        app(DeliveryService::class)->complete($d->fresh(), $rider, $d->otp_code, (float) $o->fresh()->total);
        // Ready for pickup (pay at shop)
        $o = $online($pick($otc, 1), 'pickup', null, $customers[7], 50);
        $orders->transition($o, OrderStatus::Packing, $manager);
        $orders->transition($o, OrderStatus::ReadyForPickup, $manager);

        // ---- Requests waiting at the counter ------------------------------------------
        $approvals = app(ApprovalService::class);
        $approvals->request('rx_release', $cashier->branch_id, $cashier, data: ['medicines' => ['Monas 10 mg × 2 strips']], reason: 'Customer has prescription at counter');
        $approvals->request('discount', $cashier->branch_id, $cashier, amount: 10, data: ['customer' => 'Salma Begum'], reason: 'Regular customer');

        $this->command?->info('Demo sales: '.Order::where('channel', 'shop')->count().' counter sales, '.Order::where('channel', 'online')->count().' online orders.');
    }
}
