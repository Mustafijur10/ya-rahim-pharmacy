<?php

namespace Tests\Feature\Api;

use App\Models\Supplier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class StockV2ApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedBasics();
    }

    public function test_purchase_paid_now_shows_in_supplier_ledger_and_payment_reduces_due(): void
    {
        $owner = $this->staff('owner');
        $med = $this->medicine(['name' => 'Seclo']);
        $supplier = Supplier::create(['name' => 'Square Depot', 'visit_frequency' => 'weekly', 'next_visit_on' => now()->addDay()->toDateString()]);
        $this->actingAs($owner);

        $this->postJson('/api/admin/purchases', [
            'supplier_id' => $supplier->id,
            'invoice_no' => 'INV-1',
            'paid' => 400,
            'payment_method' => 'bank',
            'items' => [['medicine_id' => $med->id, 'batch_no' => 'SQ1', 'expiry_date' => now()->addYear()->toDateString(), 'quantity' => 200, 'unit_cost' => 5, 'mrp' => 6]],
        ])->assertCreated();

        $this->assertEquals(600, (float) $supplier->fresh()->balance);
        $this->assertEquals(5, (float) $med->fresh()->default_cost, 'last price remembered');

        $this->getJson("/api/admin/suppliers/{$supplier->id}/ledger")->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.kind', 'payment')
            ->assertJsonPath('data.0.balance', 600);

        $this->postJson("/api/admin/suppliers/{$supplier->id}/payments", ['amount' => 700, 'method' => 'cash'])->assertStatus(422);
        $this->postJson("/api/admin/suppliers/{$supplier->id}/payments", ['amount' => 250, 'method' => 'cash'])->assertCreated()->assertJsonPath('balance', 350);

        $this->getJson('/api/admin/suppliers')->assertOk()
            ->assertJsonPath('summary.total_due', 350)
            ->assertJsonPath('summary.payments_this_month', 2)
            ->assertJsonPath('summary.next_visit.supplier', 'Square Depot')
            ->assertJsonPath('data.0.purchases_this_year', 1000);
    }

    public function test_medicine_form_fields_photos_and_online_switch(): void
    {
        Storage::fake('public');
        $owner = $this->staff('owner');
        $med = $this->medicine(['name' => 'Fexo']);
        $this->batch($med, 50);
        $this->actingAs($owner);

        $payload = [
            'name' => 'Fexo', 'strength' => '120 mg', 'dosage_form' => 'Tablet', 'unit_name' => 'tablet',
            'rx_required' => false, 'discount_percent' => 5, 'reorder_level' => 20,
            'storage' => 'fridge', 'is_antibiotic' => true, 'sell_online' => false, 'allow_loose_sale' => false,
            'indications' => 'Allergy', 'side_effects' => 'Headache', 'default_rack' => 'B-2', 'vat_percent' => 0,
            'pack_sizes' => [['name' => '1 strip (10 tablets)', 'short_name' => 'strip', 'units' => 10, 'is_default' => true]],
        ];
        $this->putJson("/api/admin/medicines/{$med->id}", $payload)->assertOk()
            ->assertJsonPath('data.is_cold_chain', true)
            ->assertJsonPath('data.is_antibiotic', true);

        $this->post("/api/admin/medicines/{$med->id}/images", ['image' => UploadedFile::fake()->image('fexo.jpg')], ['Accept' => 'application/json'])
            ->assertCreated()->assertJsonCount(1, 'data.images');

        // Not sold online: hidden from the store, still sellable at the counter.
        $this->getJson('/api/store/medicines?search=Fexo')->assertOk()->assertJsonCount(0, 'data');

        $this->postJson('/api/admin/labels/barcodes', ['medicine_ids' => [$med->id]])->assertOk()
            ->assertJsonPath("data.{$med->id}", '2'.str_pad((string) $med->id, 11, '0', STR_PAD_LEFT));
    }

    public function test_inventory_export_is_a_csv(): void
    {
        $owner = $this->staff('owner');
        $med = $this->medicine(['name' => 'Napa']);
        $this->batch($med, 30, no: 'NP1');

        $res = $this->actingAs($owner)->get('/api/admin/inventory/export');
        $res->assertOk();
        $this->assertStringContainsString('NP1', $res->streamedContent());
    }
}
