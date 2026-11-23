<?php

namespace Tests\Feature\Services;

use App\Enums\OrderStatus;
use App\Exceptions\BusinessException;
use App\Models\Customer;
use App\Models\Prescription;
use App\Models\SmsLog;
use App\Services\DeliveryService;
use App\Services\OrderService;
use App\Services\PrescriptionService;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class OnlineOrderTest extends TestCase
{
    use RefreshDatabase;

    private OrderService $orders;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedBasics();
        $this->orders = app(OrderService::class);
    }

    private function checkout(array $items, array $extra = []): array
    {
        return $extra + [
            'items' => $items,
            'delivery_type' => 'express',
            'delivery_area_id' => $this->area->id,
            'recipient_name' => 'Rafiq Hasan',
            'recipient_phone' => '+880 1811-000001',
            'delivery_address' => 'House 12, Road 5',
            'payment_method' => 'cash',
        ];
    }

    public function test_otc_order_uses_store_prices_and_delivery_fee(): void
    {
        $napa = $this->medicine(['name' => 'Napa', 'discount_percent' => 8]);
        $this->batch($napa, 100, mrp: 1.2);

        $order = $this->orders->placeOnline($this->checkout([['medicine_id' => $napa->id, 'quantity' => 2]]));

        $this->assertStringStartsWith('ON-', $order->code);
        $this->assertSame(OrderStatus::New, $order->status);
        $this->assertEquals(24.00, (float) $order->subtotal);
        $this->assertEquals(1.92, (float) $order->discount_total);
        $this->assertEquals(100.00, (float) $order->delivery_fee);
        $this->assertEquals(122.08, (float) $order->total);
        $this->assertSame('01811000001', $order->customer->phone);   // phone normalised, customer created
        $this->assertSame(80, app(StockService::class)->available($napa->id, $this->branch->id)); // reserved
        $this->assertSame(1, SmsLog::where('purpose', 'order_placed')->count());
    }

    public function test_rx_order_requires_a_prescription(): void
    {
        $seclo = $this->medicine(['name' => 'Seclo', 'rx_required' => true]);
        $this->batch($seclo, 100, mrp: 6);

        try {
            $this->orders->placeOnline($this->checkout([['medicine_id' => $seclo->id, 'quantity' => 1]]));
            $this->fail('Expected prescription_required');
        } catch (BusinessException $e) {
            $this->assertSame('prescription_required', $e->errorCode);
        }
        // Nothing was reserved.
        $this->assertSame(100, app(StockService::class)->available($seclo->id, $this->branch->id));
    }

    public function test_full_rx_journey_from_upload_to_delivery(): void
    {
        Storage::fake('local');
        $seclo = $this->medicine(['name' => 'Seclo', 'rx_required' => true]);
        $napa = $this->medicine(['name' => 'Napa']);
        $this->batch($seclo, 100, mrp: 6);
        $this->batch($napa, 100, mrp: 1.2);
        $pharmacist = $this->staff('pharmacist');
        $manager = $this->staff('manager');
        $rider = $this->staff('rider');

        // 1. Customer uploads the prescription and places the order (cash on delivery).
        $customer = Customer::factory()->create(['phone' => '01811000001']);
        $rx = app(PrescriptionService::class)->upload([UploadedFile::fake()->image('rx.jpg')], $customer);
        Storage::disk('local')->assertExists($rx->pages->first()->path);

        $order = $this->orders->placeOnline($this->checkout(
            [['medicine_id' => $seclo->id, 'quantity' => 2], ['medicine_id' => $napa->id, 'quantity' => 1]],
            ['prescription_id' => $rx->id],
        ), $customer);
        $this->assertSame(OrderStatus::RxVerification, $order->status);

        // 2. Can't skip verification.
        try {
            $this->orders->transition($order, OrderStatus::Packing, $manager);
            $this->fail('Packing before verification must fail');
        } catch (BusinessException $e) {
            $this->assertSame('prescription_not_verified', $e->errorCode);
        }

        // 3. Pharmacist verifies → packing.
        $order = $this->orders->verifyPrescription($order, $pharmacist, 'Prescription verified. Dr. name and date checked.');
        $this->assertSame(OrderStatus::Packing, $order->status);
        $this->assertSame('verified', $rx->fresh()->status);

        // 4. Assign rider; customer gets the code by SMS.
        $delivery = app(DeliveryService::class)->assign($order, $manager, $rider);
        $this->assertEquals((float) $order->total, (float) $delivery->cash_to_collect);
        $this->assertTrue(SmsLog::where('purpose', 'delivery_code')->where('message', 'like', "%{$delivery->otp_code}%")->exists());

        // 5. Rider picks up → out for delivery; wrong code is refused; right code + cash → delivered.
        app(DeliveryService::class)->pickUp($delivery, $rider);
        $this->assertSame(OrderStatus::OutForDelivery, $order->fresh()->status);

        try {
            app(DeliveryService::class)->complete($delivery, $rider, '0000', (float) $order->total);
            $this->fail('Wrong code must fail');
        } catch (BusinessException $e) {
            $this->assertSame('wrong_code', $e->errorCode);
        }

        app(DeliveryService::class)->complete($delivery->fresh(), $rider, $delivery->otp_code, (float) $order->total);

        $order = $order->fresh();
        $this->assertSame(OrderStatus::Delivered, $order->status);
        $this->assertSame('paid', $order->payment_status);
        $this->assertEquals((float) $order->total, app(DeliveryService::class)->cashHeld($rider));
        $this->assertSame(1, $customer->fresh()->orders_count);

        // 6. Rider hands the cash to the manager.
        $this->assertEquals((float) $order->total, app(DeliveryService::class)->settleCash($rider, $manager));
        $this->assertEquals(0.0, app(DeliveryService::class)->cashHeld($rider));

        $this->assertSame(
            ['rx_verification', 'packing', 'packing', 'out_for_delivery', 'delivered'],
            $order->statusHistory()->pluck('to_status')->all(),
        );
    }

    public function test_cancelling_returns_reserved_stock(): void
    {
        $med = $this->medicine();
        $this->batch($med, 50, mrp: 2);
        $order = $this->orders->placeOnline($this->checkout([['medicine_id' => $med->id, 'quantity' => 3]]));
        $this->assertSame(20, app(StockService::class)->available($med->id, $this->branch->id));

        $this->orders->cancel($order, $this->staff('manager'), 'Customer changed mind');

        $this->assertSame(OrderStatus::Cancelled, $order->fresh()->status);
        $this->assertSame(50, app(StockService::class)->available($med->id, $this->branch->id));
    }

    public function test_invalid_status_jumps_are_refused(): void
    {
        $med = $this->medicine();
        $this->batch($med, 50);
        $order = $this->orders->placeOnline($this->checkout([['medicine_id' => $med->id, 'quantity' => 1]]));

        $this->expectExceptionMessage('cannot move to');
        $this->orders->transition($order, OrderStatus::Delivered);
    }

    public function test_pickup_order_is_free_and_paid_at_the_counter(): void
    {
        $cashier = $this->staff('cashier');
        $this->openShift($cashier);
        $med = $this->medicine();
        $this->batch($med, 50, mrp: 3);

        $order = $this->orders->placeOnline($this->checkout([['medicine_id' => $med->id, 'quantity' => 1]], ['delivery_type' => 'pickup']));
        $this->assertEquals(0.0, (float) $order->delivery_fee);

        $this->orders->transition($order, OrderStatus::Packing, $cashier);
        $this->orders->transition($order, OrderStatus::ReadyForPickup, $cashier);
        $done = $this->orders->completePickup($order, [['method' => 'cash', 'amount' => 30]], $cashier);

        $this->assertSame(OrderStatus::Completed, $done->status);
        $this->assertSame('paid', $done->payment_status);
    }

    public function test_express_is_refused_where_not_available(): void
    {
        $this->area->update(['express_available' => false]);
        $med = $this->medicine();
        $this->batch($med, 50);

        $this->expectExceptionMessage('Express delivery is not available');
        $this->orders->placeOnline($this->checkout([['medicine_id' => $med->id, 'quantity' => 1]]));
    }

    public function test_rejected_prescription_can_be_replaced(): void
    {
        $pharmacist = $this->staff('pharmacist');
        $rx = $this->medicine(['rx_required' => true]);
        $this->batch($rx, 50);
        $customer = Customer::factory()->create();
        $old = Prescription::create(['customer_id' => $customer->id, 'status' => 'pending']);

        $order = $this->orders->placeOnline($this->checkout([['medicine_id' => $rx->id, 'quantity' => 1]], ['prescription_id' => $old->id]), $customer);
        $this->orders->rejectPrescription($order, $pharmacist, 'Photo is blurry');
        $this->assertSame('rejected', $old->fresh()->status);
        $this->assertSame(OrderStatus::RxVerification, $order->fresh()->status);

        $new = Prescription::create(['customer_id' => $customer->id, 'status' => 'pending']);
        $this->orders->attachPrescription($order->fresh(), $new);
        $this->orders->verifyPrescription($order->fresh(), $pharmacist);

        $this->assertSame(OrderStatus::Packing, $order->fresh()->status);
    }
}
