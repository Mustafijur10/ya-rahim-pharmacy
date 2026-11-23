<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Prescription;
use App\Services\ApprovalService;
use App\Services\OrderService;
use App\Services\PosService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DashboardsApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedBasics();
    }

    public function test_owner_cashier_and_pharmacist_dashboards(): void
    {
        $cashier = $this->staff('cashier');
        $pharmacist = $this->staff('pharmacist');
        $owner = $this->staff('owner');
        $napa = $this->medicine(['name' => 'Napa']);
        $this->batch($napa, 500, mrp: 1.2);
        $seclo = $this->medicine(['name' => 'Seclo', 'rx_required' => true]);
        $this->batch($seclo, 100, mrp: 6);
        // Rx medicine (never sold at the counter here); the online order takes 10 of these 20 first (FEFO).
        $this->batch($seclo, 20, '+20 days', mrp: 6, no: 'SOON1');

        // Counter: one cash sale, one bKash sale, one held cart.
        $this->openShift($cashier, 1000);
        $pos = app(PosService::class);
        $pos->sell($cashier, ['items' => [['medicine_id' => $napa->id, 'quantity' => 5]], 'payments' => [['method' => 'cash', 'amount' => 60]]]);
        $pos->sell($cashier, ['items' => [['medicine_id' => $napa->id, 'quantity' => 1]], 'payments' => [['method' => 'bkash', 'amount' => 12, 'transaction_id' => 'B1']]]);
        $pos->hold($cashier, ['items' => [['medicine_id' => $napa->id, 'quantity' => 1]]]);
        app(ApprovalService::class)->request('rx_release', $this->branch->id, $cashier, data: ['medicines' => ['Seclo']]);

        // Online: one Rx order waiting for the pharmacist.
        $c = Customer::factory()->create();
        app(OrderService::class)->placeOnline([
            'items' => [['medicine_id' => $seclo->id, 'quantity' => 1], ['medicine_id' => $napa->id, 'quantity' => 1]],
            'delivery_type' => 'pickup', 'recipient_name' => $c->name, 'recipient_phone' => $c->phone,
            'prescription_id' => Prescription::create(['customer_id' => $c->id, 'status' => 'pending'])->id,
        ], $c);

        $this->actingAs($owner)->getJson('/api/admin/dashboard')->assertOk()
            ->assertJsonPath('kpis.sales_today_shop', 72)
            ->assertJsonPath('kpis.shop_orders_today', 2)
            ->assertJsonPath('kpis.rx_waiting', 1)
            ->assertJsonPath('kpis.expiring_90', 1)
            ->assertJsonPath('kpis.expiring_90_cost', 8)
            ->assertJsonPath('expiring.0.batch_no', 'SOON1')
            ->assertJsonPath('target.sold', 144) // shop 72 + the online order
            ->assertJsonCount(1, 'categories')
            ->assertJsonStructure(['hourly' => [['hour', 'shop', 'online']], 'top_medicines' => [['id', 'name', 'packs', 'pack']], 'target' => ['month', 'sold', 'target', 'days_left']]);

        $this->actingAs($cashier)->getJson('/api/admin/dashboard/counter')->assertOk()
            ->assertJsonPath('kpis.sales_today', 72)
            ->assertJsonPath('kpis.receipts_today', 2)
            ->assertJsonPath('kpis.cash_today', 60)
            ->assertJsonPath('kpis.digital_today', 12)
            ->assertJsonPath('kpis.held_sales', 1)
            ->assertJsonPath('drawer.expected_cash', 1060)
            ->assertJsonPath('requests.0.type', 'rx_release');

        $this->actingAs($pharmacist)->getJson('/api/admin/dashboard/pharmacist')->assertOk()
            ->assertJsonPath('kpis.rx_waiting', 1)
            ->assertJsonPath('kpis.expiring_30', 1)
            ->assertJsonPath('counter_requests.0.type', 'rx_release')
            ->assertJsonPath('rx_queue.0.items_count', 2)
            ->assertJsonPath('rx_queue.0.rx_items_count', 1);
    }
}
