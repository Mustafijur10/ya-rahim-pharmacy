<?php

namespace Tests\Feature\Services;

use App\Exceptions\BusinessException;
use App\Services\PosService;
use App\Services\ShiftService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ShiftServiceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedBasics();
    }

    public function test_expected_cash_and_difference_at_close(): void
    {
        $cashier = $this->staff('cashier');
        $shift = $this->openShift($cashier, 5000);
        $med = $this->medicine();
        $this->batch($med, 100, mrp: 10);
        $pos = app(PosService::class);

        $pos->sell($cashier, ['items' => [['medicine_id' => $med->id, 'quantity' => 3]], 'payments' => [['method' => 'cash', 'amount' => 300, 'received_amount' => 500]]]);
        $pos->sell($cashier, ['items' => [['medicine_id' => $med->id, 'quantity' => 1]], 'payments' => [['method' => 'bkash', 'amount' => 100, 'transaction_id' => 'BK1']]]);

        $summary = app(ShiftService::class)->summary($shift);
        $this->assertEquals(300, $summary['cash_sales']);           // change given back is not counted
        $this->assertEquals(5300, $summary['expected_cash']);
        $this->assertEquals(100, $summary['by_method']['bkash']['total']);
        $this->assertSame(2, $summary['receipts']);

        $closed = app(ShiftService::class)->close($shift, $cashier, 5280, 'Short by 20');
        $this->assertSame('closed', $closed->status);
        $this->assertEquals(-20.00, (float) $closed->difference);
    }

    public function test_only_one_open_shift_per_person(): void
    {
        $cashier = $this->staff('cashier');
        $this->openShift($cashier);

        $this->expectException(BusinessException::class);
        $this->openShift($cashier);
    }

    public function test_store_keeper_cannot_open_a_counter_shift(): void
    {
        $this->expectException(BusinessException::class);
        $this->openShift($this->staff('store_keeper'));
    }
}
