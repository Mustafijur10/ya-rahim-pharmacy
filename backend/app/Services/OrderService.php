<?php

namespace App\Services;

use App\Enums\DeliveryType;
use App\Enums\OrderChannel;
use App\Enums\OrderStatus;
use App\Enums\PaymentMethod;
use App\Enums\StockMovementType;
use App\Exceptions\BusinessException;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeliveryArea;
use App\Models\Medicine;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Prescription;
use App\Models\Shift;
use App\Models\User;
use App\Services\Sms\SmsService;
use App\Support\Sequence;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class OrderService
{
    public function __construct(
        private StockService $stock,
        private SmsService $sms,
    ) {}

    /* ------------------------------------------------------------------ */
    /* Building orders */
    /* ------------------------------------------------------------------ */

    public function newCode(OrderChannel $channel): string
    {
        return $channel === OrderChannel::Shop
            ? Sequence::code(config('pharmacy.order_code_prefix.shop'), 'order.shop')
            : Sequence::code(config('pharmacy.order_code_prefix.online'), 'order.online');
    }

    /**
     * Add lines to an order, taking stock FEFO. Must run inside a transaction.
     *
     * @param  list<array{medicine_id:int, quantity:int, pack_size_id?:int|null}>  $lines  quantity = number of packs
     * @param  string  $pricing  "online": each medicine's own discount; "pos": one discount % for the whole sale
     */
    public function addItems(Order $order, array $lines, string $pricing, float $saleDiscountPercent = 0, ?User $user = null, bool $rxReleased = false): void
    {
        if ($lines === []) {
            throw new BusinessException('The order has no items.');
        }

        $medicines = Medicine::with('packSizes')
            ->whereIn('id', array_column($lines, 'medicine_id'))
            ->get()
            ->keyBy('id');

        foreach ($lines as $line) {
            $medicine = $medicines->get($line['medicine_id']);
            if (! $medicine || ! $medicine->is_active) {
                throw new BusinessException('One of the medicines is no longer available.', 'medicine_unavailable', 422, ['medicine_id' => $line['medicine_id']]);
            }

            $packs = (int) $line['quantity'];
            if ($packs < 1) {
                throw new BusinessException("Quantity for {$medicine->full_name} must be at least 1.");
            }

            $pack = ! empty($line['pack_size_id'])
                ? $medicine->packSizes->firstWhere('id', $line['pack_size_id'])
                : ($medicine->packSizes->firstWhere('is_default', true) ?? $medicine->packSizes->first());
            if (! empty($line['pack_size_id']) && ! $pack) {
                throw new BusinessException("Invalid pack size for {$medicine->full_name}.");
            }

            $units = $pack ? $pack->units * $packs : $packs;
            $discountPercent = $pricing === 'online'
                ? min(100, (float) $medicine->discount_percent + (float) ($pack?->extra_discount_percent ?? 0))
                : $saleDiscountPercent;

            $taken = $this->stock->take($medicine->id, $order->branch_id, $units, StockMovementType::Sale, $order, $user?->id);

            $label = $pack
                ? $packs.' '.Str::plural($pack->short_name, $packs)
                : $packs.' '.$medicine->unit_name;

            foreach ($taken as $part) {
                $batch = $part['batch'];
                $qty = $part['quantity'];
                $mrpTotal = round((float) $batch->mrp * $qty, 2);
                $discount = round($mrpTotal * $discountPercent / 100, 2);

                $order->items()->create([
                    'medicine_id' => $medicine->id,
                    'batch_id' => $batch->id,
                    'pack_size_id' => $pack?->id,
                    'name' => $medicine->full_name,
                    'quantity' => $qty,
                    'quantity_label' => count($taken) > 1 ? "$qty {$medicine->unit_name}" : $label,
                    'unit_mrp' => $batch->mrp,
                    'unit_cost' => $batch->cost_price,
                    'discount' => $discount,
                    'line_total' => $mrpTotal - $discount,
                    'rx_required' => $medicine->rx_required,
                    'rx_status' => $medicine->rx_required ? ($rxReleased ? 'approved' : 'pending') : null,
                ]);
            }

            $medicine->increment('sold_count', $packs);
        }

        $this->recalculate($order);
    }

    public function recalculate(Order $order): Order
    {
        $items = $order->items()->get();

        $subtotal = $items->sum(fn (OrderItem $i) => round((float) $i->unit_mrp * $i->quantity, 2));
        $discount = (float) $items->sum('discount');

        $order->forceFill([
            'subtotal' => round($subtotal, 2),
            'discount_total' => round($discount, 2),
            'total' => round($subtotal - $discount + (float) $order->delivery_fee, 2),
            'requires_rx' => $items->contains('rx_required', true),
        ])->save();

        return $order;
    }

    /**
     * Record payments against an order. Cash may be over-tendered (change is given);
     * all other methods must match exactly.
     *
     * @param  list<array{method:string, amount:float|int|string, received_amount?:float|null, transaction_id?:string|null}>  $payments
     */
    public function recordPayments(Order $order, array $payments, ?User $receivedBy, ?Shift $shift): void
    {
        $due = round($order->balanceDue(), 2);
        $sum = round(array_sum(array_map(fn ($p) => (float) $p['amount'], $payments)), 2);

        if (abs($sum - $due) > 0.009) {
            throw new BusinessException('Payments (৳'.number_format($sum, 2).') must equal the amount due (৳'.number_format($due, 2).').', 'payment_mismatch');
        }

        foreach ($payments as $p) {
            $method = PaymentMethod::from($p['method']);
            $amount = round((float) $p['amount'], 2);
            if ($amount <= 0) {
                continue;
            }

            $received = null;
            $change = null;
            if ($method === PaymentMethod::Cash) {
                $received = isset($p['received_amount']) ? round((float) $p['received_amount'], 2) : $amount;
                if ($received < $amount) {
                    throw new BusinessException('Cash received is less than the cash amount.');
                }
                $change = round($received - $amount, 2);
            }

            $order->payments()->create([
                'method' => $method,
                'amount' => $amount,
                'received_amount' => $received,
                'change_amount' => $change,
                'transaction_id' => $p['transaction_id'] ?? null,
                'status' => 'success',
                'received_by' => $receivedBy?->id,
                'shift_id' => $shift?->id,
                'paid_at' => now(),
            ]);
        }

        $order->forceFill(['paid_amount' => round((float) $order->paid_amount + $sum, 2)]);
        $order->payment_status = $order->balanceDue() <= 0.009 ? 'paid' : 'partial';
        $order->save();
    }

    /* ------------------------------------------------------------------ */
    /* Online / phone orders */
    /* ------------------------------------------------------------------ */

    /**
     * Place a website or phone order. Stock is reserved immediately (FEFO) so the
     * shop counter can't sell the same strips; cancelling puts it back.
     *
     * $data keys: items, delivery_type (express|standard|pickup), delivery_area_id, recipient_name,
     * recipient_phone, delivery_address, delivery_landmark, payment_method, prescription_id,
     * customer_note, channel (online|phone), branch_id
     */
    public function placeOnline(array $data, ?Customer $customer = null, ?User $staff = null): Order
    {
        $deliveryType = DeliveryType::from($data['delivery_type'] ?? 'standard');
        if ($deliveryType === DeliveryType::Counter) {
            throw new BusinessException('Choose delivery or pick up in shop.');
        }
        $channel = OrderChannel::from($data['channel'] ?? 'online');
        $branchId = $data['branch_id'] ?? Branch::where('is_active', true)->value('id');
        // "cash" = cash on delivery; "pay_at_shop" = reserve online, pay at the counter (pickup only).
        $preference = $data['payment_method'] ?? 'cash';
        if ($preference === 'pay_at_shop' && $deliveryType !== DeliveryType::Pickup) {
            throw new BusinessException('“Pay at the shop” is available with “Pick up in shop”.', 'pay_at_shop_pickup_only');
        }
        $paymentMethod = $preference === 'pay_at_shop' ? PaymentMethod::Cash : PaymentMethod::from($preference);

        return DB::transaction(function () use ($data, $customer, $staff, $deliveryType, $channel, $branchId, $paymentMethod, $preference) {
            $customer ??= $this->findOrCreateCustomer($data['recipient_phone'] ?? null, $data['recipient_name'] ?? null);

            [$area, $fee] = $this->deliveryFee($deliveryType, $data['delivery_area_id'] ?? null);

            $order = Order::create([
                'code' => $this->newCode($channel),
                'branch_id' => $branchId,
                'channel' => $channel,
                'customer_id' => $customer?->id,
                'status' => OrderStatus::New,
                'delivery_type' => $deliveryType,
                'delivery_area_id' => $area?->id,
                'recipient_name' => $data['recipient_name'] ?? $customer?->name,
                'recipient_phone' => $data['recipient_phone'] ?? $customer?->phone,
                'delivery_address' => $deliveryType->needsRider() ? ($data['delivery_address'] ?? null) : null,
                'delivery_landmark' => $deliveryType->needsRider() ? ($data['delivery_landmark'] ?? null) : null,
                'delivery_fee' => $fee,
                'customer_note' => $data['customer_note'] ?? null,
                'cashier_id' => $staff?->id,
                'payment_preference' => $preference === 'cash' ? ($deliveryType === DeliveryType::Pickup ? 'pay_at_shop' : 'cod') : $preference,
                'hold_until' => $preference === 'pay_at_shop' ? now()->addHours(24) : null,
                'placed_at' => now(),
            ]);

            if ($deliveryType->needsRider() && blank($order->delivery_address)) {
                throw new BusinessException('Delivery address is required.');
            }

            $this->addItems($order, $data['items'] ?? [], 'online', 0, $staff);

            if ($order->requires_rx) {
                $prescription = $this->usablePrescription($data['prescription_id'] ?? null, $customer);
                if (! $prescription) {
                    $count = $order->items()->where('rx_required', true)->distinct()->count('medicine_id');
                    throw new BusinessException("A prescription is required for $count item(s) in your cart.", 'prescription_required', 422);
                }
                $prescription->customer_id ??= $customer?->id;
                $prescription->save();

                $order->prescription_id = $prescription->id;
                $order->status = OrderStatus::RxVerification;
                $order->save();
            }

            if ($paymentMethod !== PaymentMethod::Cash) {
                // Online payment is confirmed later by the gateway callback.
                $order->payments()->create([
                    'method' => $paymentMethod,
                    'amount' => $order->total,
                    'status' => 'pending',
                ]);
            }

            $this->logStatus($order, null, $order->status, $staff, 'Order placed');

            $this->sms->send(
                $order->recipient_phone,
                "Ya Rahim Pharmacy: order {$order->code} received. Total ৳".number_format((float) $order->total, 0)
                    .($order->requires_rx ? '. Our pharmacist will check your prescription and call you.' : '. We will update you soon.'),
                'order_placed',
            );

            return $order->refresh();
        });
    }

    /** Pharmacist approves the prescription: Rx lines approved, order moves to packing. */
    public function verifyPrescription(Order $order, User $pharmacist, ?string $note = null): Order
    {
        if (! $pharmacist->hasModuleAccess('rx', 'full')) {
            throw new BusinessException('Only a pharmacist can verify prescriptions.', 'forbidden', 403);
        }

        return DB::transaction(function () use ($order, $pharmacist, $note) {
            $order = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            if ($order->status !== OrderStatus::RxVerification) {
                throw new BusinessException('This order is not waiting for prescription verification.');
            }
            if (! $order->prescription_id) {
                throw new BusinessException('No prescription is attached to this order.');
            }

            Prescription::whereKey($order->prescription_id)->update([
                'status' => 'verified',
                'verified_by' => $pharmacist->id,
                'verified_at' => now(),
                'pharmacist_note' => $note,
                'reject_reason' => null,
            ]);
            $order->items()->where('rx_required', true)->update(['rx_status' => 'approved']);
            $order->forceFill(['pharmacist_id' => $pharmacist->id, 'verified_at' => now()])->save();

            $order = $this->transition($order, OrderStatus::Packing, $pharmacist, 'Prescription verified');

            activity('rx')->performedOn($order)->causedBy($pharmacist)->withProperties(['note' => $note])->log('Prescription verified');

            if ($note) {
                $this->sms->send($order->recipient_phone, "Ya Rahim Pharmacy ({$order->code}): $note", 'rx_verified');
            }

            return $order;
        });
    }

    /** Pharmacist rejects the prescription. The order waits for a new one (or staff cancels it). */
    public function rejectPrescription(Order $order, User $pharmacist, string $reason): Order
    {
        if (! $pharmacist->hasModuleAccess('rx', 'full')) {
            throw new BusinessException('Only a pharmacist can reject prescriptions.', 'forbidden', 403);
        }
        if ($order->status !== OrderStatus::RxVerification) {
            throw new BusinessException('This order is not waiting for prescription verification.');
        }

        DB::transaction(function () use ($order, $pharmacist, $reason) {
            if ($order->prescription_id) {
                Prescription::whereKey($order->prescription_id)->update([
                    'status' => 'rejected',
                    'verified_by' => $pharmacist->id,
                    'verified_at' => now(),
                    'reject_reason' => $reason,
                ]);
            }
            $this->logStatus($order, $order->status, $order->status, $pharmacist, "Prescription rejected: $reason");
            activity('rx')->performedOn($order)->causedBy($pharmacist)->withProperties(['reason' => $reason])->log('Prescription rejected');
        });

        $this->sms->send(
            $order->recipient_phone,
            "Ya Rahim Pharmacy ({$order->code}): we could not accept your prescription — $reason. Please upload a clear, valid prescription.",
            'rx_rejected',
        );

        return $order->refresh();
    }

    /** Attach a new prescription after a rejection. */
    public function attachPrescription(Order $order, Prescription $prescription): Order
    {
        if ($order->status !== OrderStatus::RxVerification) {
            throw new BusinessException('This order is not waiting for a prescription.');
        }
        $order->update(['prescription_id' => $prescription->id]);
        $order->items()->where('rx_required', true)->update(['rx_status' => 'pending']);

        return $order->refresh();
    }

    /* ------------------------------------------------------------------ */
    /* Status changes */
    /* ------------------------------------------------------------------ */

    public function transition(Order $order, OrderStatus $to, ?User $user = null, ?string $note = null): Order
    {
        return DB::transaction(function () use ($order, $to, $user, $note) {
            $order = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            $from = $order->status;

            if (! $from->canMoveTo($to)) {
                throw new BusinessException("An order that is “{$from->label()}” cannot move to “{$to->label()}”.", 'invalid_transition');
            }

            if ($to === OrderStatus::Packing && $order->items()->where('rx_required', true)->where('rx_status', '!=', 'approved')->exists()) {
                throw new BusinessException('The prescription must be verified before packing.', 'prescription_not_verified');
            }
            if ($to === OrderStatus::ReadyForPickup && $order->delivery_type !== DeliveryType::Pickup) {
                throw new BusinessException('Only pickup orders can be marked ready for pickup.');
            }
            if ($to === OrderStatus::OutForDelivery && ! $order->delivery_type->needsRider()) {
                throw new BusinessException('Pickup orders are not delivered.');
            }
            if (in_array($to, [OrderStatus::Completed, OrderStatus::Delivered], true) && $order->balanceDue() > 0.009) {
                throw new BusinessException('Collect the full payment before completing the order.', 'payment_due');
            }

            if ($to === OrderStatus::Cancelled) {
                $this->restockAll($order, $user);
                $order->cancel_reason = $note;
                $order->cancelled_at = now();
                $order->payments()->where('status', 'pending')->update(['status' => 'failed']);
            }
            if (in_array($to, [OrderStatus::Delivered, OrderStatus::Completed], true) && ! $order->completed_at) {
                $order->completed_at = now();
                $this->recordCustomerPurchase($order);
            }

            $order->status = $to;
            $order->save();
            $this->logStatus($order, $from, $to, $user, $note);

            $message = match ($to) {
                OrderStatus::ReadyForPickup => "Ya Rahim Pharmacy: order {$order->code} is ready for pickup at the counter.",
                OrderStatus::Cancelled => "Ya Rahim Pharmacy: order {$order->code} was cancelled.".($note ? " Reason: $note" : ''),
                default => null,
            };
            if ($message && $order->channel !== OrderChannel::Shop) {
                $this->sms->send($order->recipient_phone, $message, 'order_'.$to->value);
            }

            return $order;
        });
    }

    public function cancel(Order $order, User $user, string $reason): Order
    {
        return $this->transition($order, OrderStatus::Cancelled, $user, $reason);
    }

    /** Customer collects a pickup order at the counter and pays. */
    public function completePickup(Order $order, array $payments, User $cashier): Order
    {
        return DB::transaction(function () use ($order, $payments, $cashier) {
            $order = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            if ($order->status !== OrderStatus::ReadyForPickup) {
                throw new BusinessException('This order is not ready for pickup.');
            }
            if ($order->balanceDue() > 0.009) {
                $this->recordPayments($order, $payments, $cashier, $cashier->openShift()->first());
            }

            return $this->transition($order, OrderStatus::Completed, $cashier, 'Collected at counter');
        });
    }

    /* ------------------------------------------------------------------ */
    /* Helpers */
    /* ------------------------------------------------------------------ */

    public function logStatus(Order $order, ?OrderStatus $from, OrderStatus $to, ?User $user, ?string $note = null): void
    {
        $order->statusHistory()->create([
            'from_status' => $from?->value,
            'to_status' => $to->value,
            'user_id' => $user?->id,
            'note' => $note,
        ]);
    }

    public function recordCustomerPurchase(Order $order): void
    {
        if (! $order->customer_id) {
            return;
        }
        Customer::whereKey($order->customer_id)->update([
            'total_spent' => DB::raw('total_spent + '.(float) $order->total),
            'orders_count' => DB::raw('orders_count + 1'),
            'last_purchase_at' => now(),
        ]);
    }

    /** @return array{0: ?DeliveryArea, 1: float} */
    public function deliveryFee(DeliveryType $type, ?int $areaId): array
    {
        if (! $type->needsRider()) {
            return [null, 0.0];
        }

        $area = $areaId ? DeliveryArea::where('is_active', true)->find($areaId) : null;
        if (! $area) {
            throw new BusinessException('Please choose a delivery area.', 'delivery_area_required');
        }
        if ($type === DeliveryType::Express) {
            if (! $area->express_available || $area->express_fee === null) {
                throw new BusinessException("Express delivery is not available in {$area->name}.", 'express_unavailable');
            }

            return [$area, (float) $area->express_fee];
        }

        return [$area, (float) $area->standard_fee];
    }

    private function restockAll(Order $order, ?User $user): void
    {
        foreach ($order->items()->with('batch')->get() as $item) {
            $qty = $item->quantity - $item->returned_quantity;
            if ($qty > 0 && $item->batch) {
                $this->stock->put($item->batch, $qty, StockMovementType::Cancel, $order, $user?->id, 'Order cancelled');
            }
        }
    }

    private function findOrCreateCustomer(?string $phone, ?string $name): ?Customer
    {
        $phone = $this->sms->normalise($phone);
        if (! $phone) {
            throw new BusinessException('A valid mobile number is required.', 'phone_required');
        }

        return Customer::firstOrCreate(['phone' => $phone], ['name' => $name ?: 'Customer']);
    }

    private function usablePrescription(?int $id, ?Customer $customer): ?Prescription
    {
        if (! $id) {
            return null;
        }
        $prescription = Prescription::find($id);
        if (! $prescription || $prescription->status === 'rejected') {
            return null;
        }
        if ($prescription->customer_id && $customer && $prescription->customer_id !== $customer->id) {
            return null;
        }

        return $prescription;
    }
}
