<?php

namespace Tests\Feature\Services;

use App\Enums\OrderStatus;
use App\Exceptions\ApprovalRequiredException;
use App\Exceptions\BusinessException;
use App\Exceptions\InsufficientStockException;
use App\Models\ApprovalRequest;
use App\Models\Customer;
use App\Models\Order;
use App\Services\ApprovalService;
use App\Services\OrderService;
use App\Services\PosService;
use App\Services\ShiftService;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PosServiceTest extends TestCase
{
    use RefreshDatabase;

    private PosService $pos;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedBasics();
        $this->pos = app(PosService::class);
    }

    private function cash(float $amount, ?float $received = null): array
    {
        return [['method' => 'cash', 'amount' => $amount, 'received_amount' => $received ?? $amount]];
    }

    public function test_counter_sale_with_discount_and_change(): void
    {
        $cashier = $this->staff('cashier');
        $this->openShift($cashier);
        $seclo = $this->medicine(['name' => 'Seclo']);          // ৳6 per cap, strip of 10
        $this->batch($seclo, 100, '+1 year', mrp: 6, cost: 5.2);
        $customer = Customer::factory()->create();

        $order = $this->pos->sell($cashier, [
            'items' => [['medicine_id' => $seclo->id, 'quantity' => 2]],   // 2 strips = 20 caps = ৳120
            'customer_id' => $customer->id,
            'discount_percent' => 5,                                         // −৳6
            'payments' => $this->cash(114, 200),
        ]);

        $this->assertStringStartsWith('POS-', $order->code);
        $this->assertSame(OrderStatus::Completed, $order->status);
        $this->assertEquals(120.00, (float) $order->subtotal);
        $this->assertEquals(6.00, (float) $order->discount_total);
        $this->assertEquals(114.00, (float) $order->total);
        $this->assertSame('paid', $order->payment_status);
        $this->assertEquals(86.00, (float) $order->payments->first()->change_amount);
        $this->assertSame('2 strips', $order->items->first()->quantity_label);
        $this->assertSame(1, $customer->fresh()->orders_count);
        $this->assertEquals(114.00, (float) $customer->fresh()->total_spent);
    }

    public function test_split_payment_must_match_total(): void
    {
        $cashier = $this->staff('cashier');
        $this->openShift($cashier);
        $med = $this->medicine();
        $this->batch($med, 50, mrp: 10);

        $order = $this->pos->sell($cashier, [
            'items' => [['medicine_id' => $med->id, 'quantity' => 1]],
            'payments' => [['method' => 'cash', 'amount' => 40], ['method' => 'bkash', 'amount' => 60, 'transaction_id' => 'TX1']],
        ]);
        $this->assertCount(2, $order->payments);

        $this->expectExceptionMessage('must equal the amount due');
        $this->pos->sell($cashier, [
            'items' => [['medicine_id' => $med->id, 'quantity' => 1]],
            'payments' => [['method' => 'bkash', 'amount' => 90]],
        ]);
    }

    public function test_selling_requires_an_open_shift(): void
    {
        $this->expectExceptionMessage('Open your shift');
        $this->pos->sell($this->staff('cashier'), ['items' => [], 'payments' => []]);
    }

    public function test_cashier_discount_above_limit_needs_manager_approval(): void
    {
        $cashier = $this->staff('cashier');
        $manager = $this->staff('manager');
        $this->openShift($cashier);
        $med = $this->medicine();
        $this->batch($med, 50, mrp: 10);
        $sale = ['items' => [['medicine_id' => $med->id, 'quantity' => 1]], 'discount_percent' => 10, 'payments' => $this->cash(90)];

        try {
            $this->pos->sell($cashier, $sale);
            $this->fail('Expected approval to be required');
        } catch (ApprovalRequiredException $e) {
            $this->assertSame('discount', $e->context['approval_type']);
        }
        $this->assertSame(0, Order::count());
        $this->assertSame(50, app(StockService::class)->available($med->id, $this->branch->id));

        $approvals = app(ApprovalService::class);
        $request = $approvals->request('discount', $this->branch->id, $cashier, amount: 10, reason: 'Regular customer');
        $approvals->approve($request, $manager);

        $order = $this->pos->sell($cashier, $sale + ['discount_approval_id' => $request->id]);
        $this->assertEquals(90.00, (float) $order->total);

        // An approval works only once.
        $this->expectException(BusinessException::class);
        $this->pos->sell($cashier, $sale + ['discount_approval_id' => $request->id]);
    }

    public function test_manager_can_give_a_bigger_discount_without_approval(): void
    {
        $manager = $this->staff('manager');
        $this->openShift($manager);
        $med = $this->medicine();
        $this->batch($med, 50, mrp: 10);

        $order = $this->pos->sell($manager, [
            'items' => [['medicine_id' => $med->id, 'quantity' => 1]],
            'discount_percent' => 15,
            'payments' => $this->cash(85),
        ]);

        $this->assertEquals(85.00, (float) $order->total);
    }

    public function test_cashier_needs_a_pharmacist_to_release_rx_medicine(): void
    {
        $cashier = $this->staff('cashier');
        $pharmacist = $this->staff('pharmacist');
        $this->openShift($cashier);
        $rx = $this->medicine(['rx_required' => true]);
        $this->batch($rx, 50, mrp: 10);
        $sale = ['items' => [['medicine_id' => $rx->id, 'quantity' => 1]], 'payments' => $this->cash(100)];

        try {
            $this->pos->sell($cashier, $sale);
            $this->fail('Expected rx release approval');
        } catch (ApprovalRequiredException $e) {
            $this->assertSame('rx_release', $e->context['approval_type']);
        }

        $approvals = app(ApprovalService::class);
        $request = $approvals->request('rx_release', $this->branch->id, $cashier, data: ['medicine' => $rx->name]);
        $approvals->approve($request, $pharmacist);

        $order = $this->pos->sell($cashier, $sale + ['rx_approval_id' => $request->id]);
        $this->assertSame($pharmacist->id, $order->pharmacist_id);
        $this->assertSame('approved', $order->items->first()->rx_status);
    }

    public function test_pharmacist_can_sell_rx_directly(): void
    {
        $pharmacist = $this->staff('pharmacist');
        $this->openShift($pharmacist);
        $rx = $this->medicine(['rx_required' => true]);
        $this->batch($rx, 50, mrp: 10);

        $order = $this->pos->sell($pharmacist, ['items' => [['medicine_id' => $rx->id, 'quantity' => 1]], 'payments' => $this->cash(100)]);

        $this->assertSame($pharmacist->id, $order->pharmacist_id);
    }

    public function test_pos_sale_takes_the_last_strip_and_the_online_order_is_refused(): void
    {
        $cashier = $this->staff('cashier');
        $this->openShift($cashier);
        $med = $this->medicine();
        $this->batch($med, 10, mrp: 1.2); // one strip

        $this->pos->sell($cashier, ['items' => [['medicine_id' => $med->id, 'quantity' => 1]], 'payments' => $this->cash(12)]);

        $this->expectException(InsufficientStockException::class);
        app(OrderService::class)->placeOnline([
            'items' => [['medicine_id' => $med->id, 'quantity' => 1]],
            'delivery_type' => 'pickup',
            'recipient_name' => 'Rafiq',
            'recipient_phone' => '01811111111',
        ]);
    }

    public function test_cashier_return_needs_approval_then_restocks_and_counts_in_the_drawer(): void
    {
        $cashier = $this->staff('cashier');
        $manager = $this->staff('manager');
        $shift = $this->openShift($cashier, 5000);
        $med = $this->medicine();
        $batch = $this->batch($med, 50, mrp: 10);

        $order = $this->pos->sell($cashier, ['items' => [['medicine_id' => $med->id, 'quantity' => 2]], 'payments' => $this->cash(200)]);
        $item = $order->items->first();

        $return = $this->pos->requestReturn($cashier, $order, [['order_item_id' => $item->id, 'quantity' => 5]], 'cash', 'Wrong medicine');
        $this->assertSame('pending', $return->status);
        $this->assertSame(30, $batch->fresh()->quantity);

        // Can't return more than what is left once pending returns are counted.
        try {
            $this->pos->requestReturn($cashier, $order, [['order_item_id' => $item->id, 'quantity' => 16]], 'cash', 'x');
            $this->fail('Expected over-return to fail');
        } catch (BusinessException $e) {
            $this->assertStringContainsString('at most 15', $e->getMessage());
        }

        $request = ApprovalRequest::where('type', 'refund')->firstOrFail();
        app(ApprovalService::class)->approve($request, $manager);

        $this->assertSame('completed', $return->fresh()->status);
        $this->assertEquals(50.00, (float) $return->fresh()->refund_amount);
        $this->assertSame(35, $batch->fresh()->quantity);
        $this->assertSame(5, $item->fresh()->returned_quantity);

        $summary = app(ShiftService::class)->summary($shift);
        $this->assertEquals(5000 + 200 - 50, $summary['expected_cash']);
    }

    public function test_cashier_cannot_approve_own_requests(): void
    {
        $manager = $this->staff('manager');
        $approvals = app(ApprovalService::class);
        $request = $approvals->request('discount', $this->branch->id, $manager, amount: 20);

        $this->expectExceptionMessage('own request');
        $approvals->approve($request, $manager);
    }

    public function test_held_sale_round_trip(): void
    {
        $cashier = $this->staff('cashier');
        $cart = ['items' => [['medicine_id' => 1, 'quantity' => 2]], 'discount_percent' => 0];

        $held = $this->pos->hold($cashier, $cart, 'Salma — getting wallet');
        $this->assertCount(1, $this->pos->held($cashier));

        $this->assertSame($cart, $this->pos->resume($cashier, $held));
        $this->assertCount(0, $this->pos->held($cashier));
    }
}
