<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Prescription;
use App\Services\ApprovalService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OrdersRxApprovalsApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedBasics();
    }

    public function test_pharmacist_reviews_a_standalone_prescription(): void
    {
        $pharmacist = $this->staff('pharmacist');
        $cashier = $this->staff('cashier');
        $rx = Prescription::create(['customer_id' => Customer::factory()->create()->id, 'status' => 'pending', 'contact_name' => 'Walk-in Rina', 'contact_phone' => '01711111111']);

        $this->actingAs($pharmacist)->getJson('/api/admin/prescriptions?standalone=1&search=Rina')
            ->assertOk()->assertJsonPath('data.0.id', $rx->id);

        $this->actingAs($pharmacist)->postJson("/api/admin/prescriptions/{$rx->id}/review", ['decision' => 'rejected'])
            ->assertStatus(422); // a reason is required to reject

        $this->actingAs($pharmacist)->postJson("/api/admin/prescriptions/{$rx->id}/review", ['decision' => 'verified', 'note' => 'OK'])
            ->assertOk()->assertJsonPath('data.status', 'verified')->assertJsonPath('data.verified_by.name', $pharmacist->name);

        $this->actingAs($cashier)->postJson("/api/admin/prescriptions/{$rx->id}/review", ['decision' => 'verified'])
            ->assertForbidden();
    }

    public function test_approvals_filter_by_type_and_show_requester_role(): void
    {
        $manager = $this->staff('manager');
        $cashier = $this->staff('cashier');
        $approvals = app(ApprovalService::class);
        $approvals->request('discount', $this->branch->id, $cashier, amount: 10);
        $approvals->request('discount', $this->branch->id, $cashier, amount: 12);

        $this->actingAs($manager)->getJson('/api/admin/approvals?status=pending&type=discount')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.requested_by.role_label', 'Cashier')
            ->assertJsonPath('pending_counts.discount', 2);

        $id = $this->actingAs($manager)->getJson('/api/admin/approvals?status=pending')->json('data.0.id');
        $this->actingAs($manager)->postJson("/api/admin/approvals/$id/reject", ['note' => 'Too high'])->assertOk();

        $this->actingAs($manager)->getJson('/api/admin/approvals?status=decided')
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.decision_note', 'Too high');
    }
}
