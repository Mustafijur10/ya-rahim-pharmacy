<?php

namespace Tests\Feature\Api;

use App\Models\ApprovalRequest;
use App\Models\Customer;
use App\Models\Delivery;
use App\Models\Prescription;
use App\Models\User;
use App\Services\OrderService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedBasics();
    }

    /** Each role reaches only its own screens (the "Staff & roles" grid). */
    public function test_permission_grid_is_enforced_on_routes(): void
    {
        $expect = [
            'owner' => ['/api/admin/dashboard' => 200, '/api/admin/staff' => 200, '/api/admin/settings' => 200, '/api/admin/pos/held' => 200],
            'manager' => ['/api/admin/dashboard' => 200, '/api/admin/staff' => 200, '/api/admin/settings' => 403, '/api/admin/purchases' => 200],
            'pharmacist' => ['/api/admin/dashboard' => 200, '/api/admin/dashboard/pharmacist' => 200, '/api/admin/staff' => 403, '/api/admin/purchases' => 403],
            'cashier' => ['/api/admin/dashboard' => 403, '/api/admin/dashboard/counter' => 200, '/api/admin/inventory' => 200, '/api/admin/staff' => 403, '/api/admin/purchases' => 403, '/api/admin/prescriptions' => 403],
            'store_keeper' => ['/api/admin/inventory' => 200, '/api/admin/purchases' => 200, '/api/admin/pos/held' => 403, '/api/admin/orders' => 403],
            'rider' => ['/api/admin/dashboard' => 403, '/api/admin/orders' => 403, '/api/rider/today' => 200],
        ];

        foreach ($expect as $role => $routes) {
            $this->actingAs($this->staff($role));
            foreach ($routes as $url => $status) {
                $this->getJson($url)->assertStatus($status);
            }
        }

        $this->actingAs($this->staff('cashier'))->getJson('/api/rider/today')->assertForbidden();
    }

    public function test_customers_cannot_reach_admin(): void
    {
        $customer = User::factory()->create(['is_staff' => false]);
        $this->actingAs($customer)->getJson('/api/admin/inventory')->assertForbidden();
    }

    public function test_cashier_counter_flow_through_the_api(): void
    {
        $cashier = $this->staff('cashier');
        $manager = $this->staff('manager');
        $seclo = $this->medicine(['name' => 'Seclo']);
        $this->batch($seclo, 200, mrp: 6, no: 'SQ2408');
        $this->actingAs($cashier);

        $this->postJson('/api/admin/pos/sales', ['items' => [['medicine_id' => $seclo->id, 'quantity' => 1]], 'payments' => [['method' => 'cash', 'amount' => 60]]])
            ->assertUnprocessable()->assertJsonPath('code', 'shift_closed');

        $shiftId = $this->postJson('/api/admin/shifts', ['opening_cash' => 5000])->assertCreated()->json('data.id');

        $this->getJson('/api/admin/pos/search?q=sec')
            ->assertOk()
            ->assertJsonPath('data.0.next_batch.batch_no', 'SQ2408')
            ->assertJsonPath('data.0.pack_sizes.0.mrp', 60);

        $customerId = $this->postJson('/api/admin/pos/customers', ['name' => 'Salma Begum', 'phone' => '01811000004'])->assertCreated()->json('data.id');

        // 10% needs approval…
        $sale = [
            'items' => [['medicine_id' => $seclo->id, 'quantity' => 2]],
            'customer_id' => $customerId,
            'discount_percent' => 10,
            'payments' => [['method' => 'cash', 'amount' => 108, 'received_amount' => 200]],
        ];
        $this->postJson('/api/admin/pos/sales', $sale)->assertForbidden()->assertJsonPath('context.approval_type', 'discount');
        $approvalId = $this->postJson('/api/admin/approvals', ['type' => 'discount', 'amount' => 10, 'reason' => 'Regular'])->assertCreated()->json('data.id');

        // …a cashier can't approve it, the manager can.
        $this->postJson("/api/admin/approvals/$approvalId/approve")->assertForbidden();
        $this->actingAs($manager)->getJson('/api/admin/approvals?status=pending')->assertOk()->assertJsonPath('data.0.id', $approvalId);
        $this->postJson("/api/admin/approvals/$approvalId/approve")->assertOk()->assertJsonPath('data.status', 'approved');

        $this->actingAs($cashier);
        $order = $this->postJson('/api/admin/pos/sales', $sale + ['discount_approval_id' => $approvalId])
            ->assertCreated()
            ->assertJsonPath('data.total', 108)
            ->assertJsonPath('data.payments.0.change_amount', 92)
            ->assertJsonPath('data.items.0.batch.batch_no', 'SQ2408')
            ->json('data');

        $this->getJson("/api/admin/pos/receipts/{$order['id']}")->assertOk()->assertJsonPath('data.code', $order['code']);
        $this->getJson('/api/admin/dashboard/counter')->assertOk()->assertJsonPath('drawer.expected_cash', 5108)->assertJsonCount(1, 'receipts');

        // Cashier asks for a refund; it waits for the manager.
        $this->postJson("/api/admin/orders/{$order['id']}/returns", [
            'items' => [['order_item_id' => $order['items'][0]['id'], 'quantity' => 10]],
            'refund_method' => 'cash',
            'reason' => 'Doctor changed medicine',
        ])->assertCreated()->assertJsonPath('data.status', 'pending');
        $refund = ApprovalRequest::where('type', 'refund')->firstOrFail();
        $this->actingAs($manager)->postJson("/api/admin/approvals/{$refund->id}/approve")->assertOk();

        $this->actingAs($cashier);
        $this->getJson('/api/admin/shifts/current')->assertOk()->assertJsonPath('data.summary.expected_cash', 5054);
        $this->postJson("/api/admin/shifts/$shiftId/close", ['counted_cash' => 5054])->assertOk()->assertJsonPath('data.difference', '0.00');
    }

    public function test_online_order_desk_rx_verification_and_rider_delivery(): void
    {
        $pharmacist = $this->staff('pharmacist');
        $manager = $this->staff('manager');
        $rider = $this->staff('rider');
        $seclo = $this->medicine(['name' => 'Seclo', 'rx_required' => true]);
        $this->batch($seclo, 100, mrp: 6);
        $customer = Customer::factory()->create(['phone' => '01811000001']);
        $rx = Prescription::create(['customer_id' => $customer->id, 'status' => 'pending']);
        $order = app(OrderService::class)->placeOnline([
            'items' => [['medicine_id' => $seclo->id, 'quantity' => 1]],
            'delivery_type' => 'standard',
            'delivery_area_id' => $this->area->id,
            'recipient_name' => $customer->name,
            'recipient_phone' => $customer->phone,
            'delivery_address' => 'House 12',
            'prescription_id' => $rx->id,
        ], $customer);

        $this->actingAs($manager)->getJson('/api/admin/orders/stats')->assertOk()->assertJsonPath('rx_verification', 1);
        $this->getJson('/api/admin/orders?status=rx_verification')->assertOk()->assertJsonPath('data.0.code', $order->code);

        // Manager has only "view" on prescriptions: can't verify.
        $this->postJson("/api/admin/orders/{$order->id}/verify-rx")->assertForbidden();

        $this->actingAs($pharmacist)
            ->postJson("/api/admin/orders/{$order->id}/verify-rx", ['note' => 'Prescription verified.'])
            ->assertOk()->assertJsonPath('data.status', 'packing');

        $this->actingAs($manager)->getJson('/api/admin/riders')->assertOk()->assertJsonPath('data.0.id', $rider->id);
        $this->postJson("/api/admin/orders/{$order->id}/assign-rider", ['rider_id' => $rider->id])
            ->assertOk()->assertJsonMissingPath('data.otp_code');

        $delivery = Delivery::firstOrFail();
        $this->actingAs($rider);
        $this->getJson('/api/rider/today')->assertOk()->assertJsonPath('current.id', $delivery->id)->assertJsonMissingPath('current.otp_code');
        $this->postJson("/api/rider/deliveries/{$delivery->id}/pickup")->assertOk()->assertJsonPath('data.status', 'picked_up');
        $this->postJson("/api/rider/deliveries/{$delivery->id}/complete", ['code' => '0000', 'cash_collected' => 105])
            ->assertUnprocessable()->assertJsonPath('code', 'wrong_code');
        $total = (float) $order->fresh()->total;
        $done = $this->postJson("/api/rider/deliveries/{$delivery->id}/complete", ['code' => $delivery->otp_code, 'cash_collected' => $total])
            ->assertOk()->assertJsonPath('data.status', 'delivered');
        $this->assertEquals($total, $done->json('cash_held'));

        // Another rider can't touch it.
        $this->actingAs($this->staff('rider'))->getJson("/api/rider/deliveries/{$delivery->id}")->assertNotFound();

        $this->assertEquals($total, $this->actingAs($manager)->postJson("/api/admin/riders/{$rider->id}/settle")->assertOk()->json('settled'));
        $this->getJson("/api/admin/orders/{$order->id}")->assertOk()->assertJsonPath('data.status', 'delivered')->assertJsonCount(5, 'data.history');
    }

    public function test_dashboard_inventory_and_staff_screens(): void
    {
        $owner = $this->staff('owner');
        $med = $this->medicine(['name' => 'Moxacil', 'reorder_level' => 200]);
        $this->batch($med, 60, '-5 days');
        $this->batch($med, 30, '+20 days');
        $this->actingAs($owner);

        $this->getJson('/api/admin/dashboard')->assertOk()
            ->assertJsonCount(7, 'chart')
            ->assertJsonPath('kpis.low_stock', 1)
            ->assertJsonStructure(['kpis' => ['sales_today', 'gross_profit_today']]);

        $this->getJson('/api/admin/inventory/summary')->assertOk()
            ->assertJsonPath('tabs.expired', 1)
            ->assertJsonPath('tabs.expiring', 1);
        $this->getJson('/api/admin/inventory?tab=expired')->assertOk()->assertJsonPath('data.0.expiry_level', 'red');

        $batchId = $this->getJson('/api/admin/inventory?tab=expired')->json('data.0.id');
        $this->postJson('/api/admin/inventory/adjustments', ['batch_id' => $batchId, 'quantity' => -60, 'reason' => 'expired'])
            ->assertCreated()->assertJsonPath('applied', true);

        // Roles grid: change cashier's customers access; owner is locked.
        $this->getJson('/api/admin/roles')->assertOk()->assertJsonPath('roles.0.name', 'owner');
        $this->putJson('/api/admin/roles/cashier', ['permissions' => ['pos' => 'full', 'customers' => 'full']])->assertOk();
        $this->assertTrue($this->staff('cashier')->hasModuleAccess('customers', 'full'));
        $this->putJson('/api/admin/roles/owner', ['permissions' => ['pos' => 'view']])->assertForbidden();

        // Add a staff member, then the activity log shows it.
        $this->postJson('/api/admin/staff', [
            'name' => 'New Cashier', 'phone' => '01700000099', 'role' => 'cashier', 'password' => 'password123', 'pin' => '1234',
        ])->assertCreated()->assertJsonPath('data.role', 'cashier');
        $this->putJson("/api/admin/staff/{$owner->id}", ['name' => $owner->name, 'phone' => $owner->phone, 'role' => 'manager'])
            ->assertForbidden();
        $this->getJson('/api/admin/activity?log=staff')->assertOk()->assertJsonPath('data.0.description', 'Staff added');

        // Settings
        $settings = $this->putJson('/api/admin/settings', ['settings' => ['store.name' => 'Ya Rahim Pharmacy', 'store.phone' => '01712345678', 'pos.max_cashier_discount_percent' => 7]])
            ->assertOk()->json('settings');
        $this->assertSame('01712345678', $settings['store.phone']);
        $this->assertEquals(7, $settings['pos.max_cashier_discount_percent']);

        $this->putJson('/api/admin/settings', ['settings' => ['store.name' => '', 'store.map_url' => 'not a url']])
            ->assertUnprocessable();
    }

    public function test_store_keeper_receives_a_purchase(): void
    {
        $keeper = $this->staff('store_keeper');
        $med = $this->medicine();
        $this->actingAs($keeper);

        $supplierId = $this->postJson('/api/admin/suppliers', ['name' => 'Square Distribution'])->assertCreated()->json('data.id');
        $this->postJson('/api/admin/purchases', [
            'supplier_id' => $supplierId,
            'items' => [['medicine_id' => $med->id, 'batch_no' => 'NEW1', 'expiry_date' => now()->addYear()->toDateString(), 'quantity' => 100, 'unit_cost' => 1, 'mrp' => 1.2]],
        ])->assertCreated()->assertJsonPath('data.total', '100.00');

        $this->getJson('/api/admin/inventory?search=NEW1')->assertOk()->assertJsonPath('data.0.quantity', 100);
    }
}
