<?php

namespace Tests\Feature\Services;

use App\Exceptions\InsufficientStockException;
use App\Models\Batch;
use App\Services\StockService;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * The "last strip" race: a POS sale and an online order hit the same batch at once.
 * Uses a second real MySQL connection, so this test commits data (DatabaseTruncation
 * cleans up afterwards) instead of running inside one wrapping transaction.
 */
class StockLockingTest extends TestCase
{
    use DatabaseTruncation;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedBasics();

        config(['database.connections.mysql_other' => config('database.connections.mysql')]);
    }

    protected function tearDown(): void
    {
        DB::connection('mysql_other')->rollBack();
        DB::disconnect('mysql_other');

        // This test commits real rows; wipe them so later RefreshDatabase tests start clean.
        $this->truncateTablesForAllConnections();

        parent::tearDown();
    }

    public function test_a_locked_batch_cannot_be_sold_twice(): void
    {
        $med = $this->medicine(['name' => 'Seclo']);
        $batch = $this->batch($med, 10); // exactly one strip left

        // "POS counter" (other connection) starts selling the last strip and holds the row lock.
        $pos = DB::connection('mysql_other');
        $pos->beginTransaction();
        $pos->select('SELECT quantity FROM batches WHERE id = ? FOR UPDATE', [$batch->id]);

        // "Online order" (default connection) tries at the same moment: it must wait, not read stale stock.
        DB::statement('SET SESSION innodb_lock_wait_timeout = 1');
        try {
            app(StockService::class)->take($med->id, $this->branch->id, 10);
            $this->fail('The online order should have waited for the POS lock.');
        } catch (QueryException $e) {
            $this->assertStringContainsString('Lock wait timeout', $e->getMessage());
        }

        // POS finishes the sale and commits.
        $pos->update('UPDATE batches SET quantity = 0 WHERE id = ?', [$batch->id]);
        $pos->commit();

        // Now the online order sees the real stock and is refused.
        $this->expectException(InsufficientStockException::class);
        app(StockService::class)->take($med->id, $this->branch->id, 10);
    }

    public function test_after_the_lock_is_released_the_second_sale_uses_the_new_quantity(): void
    {
        $med = $this->medicine();
        $batch = $this->batch($med, 30);

        $pos = DB::connection('mysql_other');
        $pos->beginTransaction();
        $pos->select('SELECT quantity FROM batches WHERE id = ? FOR UPDATE', [$batch->id]);
        $pos->update('UPDATE batches SET quantity = quantity - 10 WHERE id = ?', [$batch->id]);
        $pos->commit();

        app(StockService::class)->take($med->id, $this->branch->id, 20);

        $this->assertSame(0, Batch::find($batch->id)->quantity);
    }
}
