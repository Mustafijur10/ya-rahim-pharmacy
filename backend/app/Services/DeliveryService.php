<?php

namespace App\Services;

use App\Enums\OrderStatus;
use App\Exceptions\BusinessException;
use App\Models\Delivery;
use App\Models\Order;
use App\Models\User;
use App\Services\Sms\SmsService;
use Illuminate\Support\Facades\DB;

class DeliveryService
{
    public function __construct(
        private OrderService $orders,
        private SmsService $sms,
    ) {}

    /** Assign a rider (or courier partner) to a packed order. The customer gets the 4-digit code by SMS. */
    public function assign(Order $order, User $assignedBy, ?User $rider = null, ?string $courierName = null): Delivery
    {
        if (! $rider && ! $courierName) {
            throw new BusinessException('Choose a rider or a courier partner.');
        }
        if ($rider && ! $rider->hasRole('rider')) {
            throw new BusinessException('The selected person is not a delivery rider.');
        }
        if (! $order->delivery_type->needsRider()) {
            throw new BusinessException('This order is for pickup, not delivery.');
        }
        if ($order->status !== OrderStatus::Packing) {
            throw new BusinessException('Only orders being packed can be assigned to a rider.');
        }

        return DB::transaction(function () use ($order, $assignedBy, $rider, $courierName) {
            $existing = Delivery::where('order_id', $order->id)->lockForUpdate()->first();
            if ($existing && $existing->status !== 'assigned') {
                throw new BusinessException('This delivery is already on the way.');
            }

            $code = (string) random_int(1000, 9999);
            $delivery = Delivery::updateOrCreate(['order_id' => $order->id], [
                'rider_id' => $rider?->id,
                'courier_name' => $courierName,
                'status' => 'assigned',
                'otp_code' => $code,
                'cash_to_collect' => round($order->balanceDue(), 2),
                'assigned_at' => now(),
            ]);

            $this->orders->logStatus($order, $order->status, $order->status, $assignedBy, 'Assigned to '.($rider?->name ?? $courierName));

            $this->sms->send(
                $order->recipient_phone,
                "Ya Rahim Pharmacy: order {$order->code} is being packed. Give code $code to the rider when you receive it."
                    .($delivery->cash_to_collect > 0 ? ' Pay ৳'.number_format((float) $delivery->cash_to_collect, 0).' on delivery.' : ''),
                'delivery_code',
            );

            return $delivery;
        });
    }

    public function pickUp(Delivery $delivery, User $rider): Delivery
    {
        $this->assertRider($delivery, $rider);
        if ($delivery->status !== 'assigned') {
            throw new BusinessException('This delivery has already been picked up.');
        }

        return DB::transaction(function () use ($delivery, $rider) {
            $delivery->update(['status' => 'picked_up', 'picked_up_at' => now()]);
            $order = $this->orders->transition($delivery->order()->firstOrFail(), OrderStatus::OutForDelivery, $rider, 'Picked up by rider');

            $this->sms->send($order->recipient_phone, "Ya Rahim Pharmacy: order {$order->code} is on the way.", 'out_for_delivery');

            return $delivery->refresh();
        });
    }

    /** Rider hands over the order: checks the customer's code and records the cash collected. */
    public function complete(Delivery $delivery, User $rider, string $code, float $cashCollected = 0): Delivery
    {
        $this->assertRider($delivery, $rider);

        return DB::transaction(function () use ($delivery, $rider, $code, $cashCollected) {
            $delivery = Delivery::whereKey($delivery->id)->lockForUpdate()->firstOrFail();
            if ($delivery->status !== 'picked_up') {
                throw new BusinessException('Pick up the order before completing the delivery.');
            }
            if (! hash_equals($delivery->otp_code, trim($code))) {
                throw new BusinessException('The delivery code is wrong. Ask the customer for the 4-digit code from their SMS.', 'wrong_code');
            }

            $due = round((float) $delivery->cash_to_collect, 2);
            if (abs($cashCollected - $due) > 0.009) {
                throw new BusinessException('Collect exactly ৳'.number_format($due, 2).' from the customer.', 'cash_mismatch');
            }

            $order = Order::whereKey($delivery->order_id)->lockForUpdate()->firstOrFail();
            if ($due > 0) {
                $this->orders->recordPayments($order, [['method' => 'cash', 'amount' => $due]], $rider, null);
            }

            $delivery->update([
                'status' => 'delivered',
                'cash_collected' => $due,
                'delivered_at' => now(),
            ]);

            $this->orders->transition($order, OrderStatus::Delivered, $rider, 'Delivered, code confirmed');

            return $delivery->refresh();
        });
    }

    /** Customer not reachable etc.: order goes back to packing, stock stays reserved. */
    public function fail(Delivery $delivery, User $rider, string $reason): Delivery
    {
        $this->assertRider($delivery, $rider);
        if ($delivery->status !== 'picked_up') {
            throw new BusinessException('Only a delivery that is on the way can be marked failed.');
        }

        return DB::transaction(function () use ($delivery, $rider, $reason) {
            $delivery->update(['status' => 'failed', 'failed_reason' => $reason]);
            $this->orders->transition($delivery->order()->firstOrFail(), OrderStatus::Packing, $rider, "Delivery failed: $reason");

            return $delivery->refresh();
        });
    }

    /** Cash a rider is carrying (delivered, not yet handed to the shop). */
    public function cashHeld(User $rider): float
    {
        return round((float) Delivery::where('rider_id', $rider->id)
            ->where('status', 'delivered')
            ->whereNull('cash_settled_at')
            ->sum('cash_collected'), 2);
    }

    /** Rider hands their cash to the manager / cashier. */
    public function settleCash(User $rider, User $receivedBy): float
    {
        return DB::transaction(function () use ($rider, $receivedBy) {
            $deliveries = Delivery::where('rider_id', $rider->id)
                ->where('status', 'delivered')
                ->whereNull('cash_settled_at')
                ->lockForUpdate()
                ->get();

            $total = round((float) $deliveries->sum('cash_collected'), 2);
            Delivery::whereIn('id', $deliveries->pluck('id'))->update(['cash_settled_at' => now(), 'settled_to' => $receivedBy->id]);

            activity('deliveries')->causedBy($receivedBy)->performedOn($rider)
                ->withProperties(['amount' => $total, 'deliveries' => $deliveries->count()])
                ->log('Rider cash settled');

            return $total;
        });
    }

    private function assertRider(Delivery $delivery, User $rider): void
    {
        if ($delivery->rider_id !== $rider->id) {
            throw new BusinessException('This delivery is assigned to someone else.', 'forbidden', 403);
        }
    }
}
