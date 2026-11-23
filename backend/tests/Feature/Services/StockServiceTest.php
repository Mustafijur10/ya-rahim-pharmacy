<?php

namespace Tests\Feature\Services;

use App\Enums\StockMovementType;
use App\Exceptions\BusinessException;
use App\Exceptions\InsufficientStockException;
use App\Models\ApprovalRequest;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Services\ApprovalService;
use App\Services\PurchaseService;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockServiceTest extends TestCase
{
    use RefreshDatabase;

    private StockService $stock;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedBasics();
        $this->stock = app(StockService::class);
    }

    public function test_takes_from_the_batch_that_expires_first(): void
    {
        $med = $this->medicine();
        $later = $this->batch($med, 50, '+2 years');
        $sooner = $this->batch($med, 50, '+3 months');

        $taken = $this->stock->take($med->id, $this->branch->id, 20);

        $this->assertCount(1, $taken);
        $this->assertSame($sooner->id, $taken[0]['batch']->id);
        $this->assertSame(30, $sooner->fresh()->quantity);
        $this->assertSame(50, $later->fresh()->quantity);
    }

    public function test_spans_batches_when_the_first_runs_out(): void
    {
        $med = $this->medicine();
        $sooner = $this->batch($med, 10, '+2 months');
        $later = $this->batch($med, 50, '+1 year');

        $taken = $this->stock->take($med->id, $this->branch->id, 25);

        $this->assertSame([10, 15], array_column($taken, 'quantity'));
        $this->assertSame(0, $sooner->fresh()->quantity);
        $this->assertSame(35, $later->fresh()->quantity);
    }

    public function test_never_sells_expired_stock(): void
    {
        $med = $this->medicine();
        $this->batch($med, 100, '-1 day');
        $good = $this->batch($med, 5, '+6 months');

        $this->assertSame(5, $this->stock->available($med->id, $this->branch->id));

        $this->expectException(InsufficientStockException::class);
        $this->stock->take($med->id, $this->branch->id, 6);
    }

    public function test_short_stock_changes_nothing(): void
    {
        $med = $this->medicine();
        $a = $this->batch($med, 3, '+2 months');
        $b = $this->batch($med, 3, '+3 months');

        try {
            $this->stock->take($med->id, $this->branch->id, 10);
            $this->fail('Expected InsufficientStockException');
        } catch (InsufficientStockException $e) {
            $this->assertSame(6, $e->context['available']);
        }

        $this->assertSame(3, $a->fresh()->quantity);
        $this->assertSame(3, $b->fresh()->quantity);
        $this->assertSame(0, StockMovement::count());
    }

    public function test_every_change_is_recorded_with_the_balance_after(): void
    {
        $med = $this->medicine();
        $batch = $this->batch($med, 40);

        $this->stock->take($med->id, $this->branch->id, 15);
        $this->stock->put($batch->fresh(), 5, StockMovementType::SaleReturn);

        $movements = StockMovement::orderBy('id')->get();
        $this->assertSame([-15, 5], $movements->pluck('quantity')->all());
        $this->assertSame([25, 30], $movements->pluck('balance_after')->all());
        $this->assertSame(30, $batch->fresh()->quantity);
    }

    public function test_store_keeper_adjusts_stock_directly(): void
    {
        $keeper = $this->staff('store_keeper');
        $batch = $this->batch($this->medicine(), 20);

        $adj = $this->stock->requestAdjustment($keeper, $batch, -2, 'damaged', 'Strip torn');

        $this->assertSame('approved', $adj->status);
        $this->assertSame(18, $batch->fresh()->quantity);
        $this->assertSame(StockMovementType::AdjustmentOut, StockMovement::latest('id')->first()->type);
    }

    public function test_pharmacist_adjustment_waits_for_owner_approval(): void
    {
        $pharmacist = $this->staff('pharmacist');
        $owner = $this->staff('owner');
        $batch = $this->batch($this->medicine(), 20);

        $adj = $this->stock->requestAdjustment($pharmacist, $batch, -5, 'count_correction');
        $this->assertSame('pending', $adj->status);
        $this->assertSame(20, $batch->fresh()->quantity);

        $request = ApprovalRequest::where('type', 'stock_adjustment')->firstOrFail();
        app(ApprovalService::class)->approve($request, $owner);

        $this->assertSame('approved', $adj->fresh()->status);
        $this->assertSame(15, $batch->fresh()->quantity);
    }

    public function test_cashier_cannot_adjust_stock(): void
    {
        $this->expectException(BusinessException::class);
        $this->stock->requestAdjustment($this->staff('cashier'), $this->batch($this->medicine(), 5), -1, 'lost');
    }

    public function test_purchase_creates_batches_and_supplier_balance(): void
    {
        $keeper = $this->staff('store_keeper');
        $med = $this->medicine();
        $supplier = Supplier::create(['name' => 'Square Distribution']);

        $purchase = app(PurchaseService::class)->receive($keeper, [
            'supplier_id' => $supplier->id,
            'invoice_no' => 'INV-1',
            'paid' => 500,
            'items' => [
                ['medicine_id' => $med->id, 'batch_no' => 'SQ1', 'expiry_date' => now()->addYear()->toDateString(), 'quantity' => 200, 'free_quantity' => 20, 'unit_cost' => 5.2, 'mrp' => 6],
            ],
        ]);

        $this->assertEquals(1040.00, (float) $purchase->total);
        $this->assertSame(220, $this->stock->available($med->id, $this->branch->id));
        $this->assertEquals(540.00, (float) $supplier->fresh()->balance);
        $this->assertStringStartsWith('PUR-', $purchase->code);
    }

    public function test_purchase_rejects_expired_goods(): void
    {
        $this->expectExceptionMessage('already expired');
        app(PurchaseService::class)->receive($this->staff('store_keeper'), [
            'supplier_id' => Supplier::create(['name' => 'X'])->id,
            'items' => [['medicine_id' => $this->medicine()->id, 'batch_no' => 'OLD', 'expiry_date' => now()->subDay()->toDateString(), 'quantity' => 10, 'unit_cost' => 1, 'mrp' => 2]],
        ]);
    }
}
