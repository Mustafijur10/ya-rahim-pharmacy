<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Generic;
use App\Models\Prescription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class StoreApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedBasics();
    }

    private function customerUser(string $phone = '01811000001'): array
    {
        $user = User::factory()->create(['phone' => $phone, 'is_staff' => false]);
        $customer = Customer::create(['user_id' => $user->id, 'name' => $user->name, 'phone' => $phone]);

        return [$user, $customer];
    }

    public function test_medicine_list_shows_live_price_and_stock(): void
    {
        $omeprazole = Generic::create(['name' => 'Omeprazole', 'slug' => 'omeprazole']);
        $seclo = $this->medicine(['name' => 'Seclo', 'generic_id' => $omeprazole->id, 'rx_required' => true, 'discount_percent' => 8]);
        $this->batch($seclo, 460, mrp: 6);
        $out = $this->medicine(['name' => 'Losectil', 'generic_id' => $omeprazole->id]);
        $this->batch($out, 0, mrp: 6);

        $res = $this->getJson('/api/store/medicines?search=ome')->assertOk();

        $this->assertSame(2, $res->json('meta.total'));
        $card = collect($res->json('data'))->firstWhere('name', 'Seclo');
        $this->assertEquals(60, $card['price']['mrp']);
        $this->assertEquals(55.2, $card['price']['price']);
        $this->assertTrue($card['rx_required']);
        $this->assertTrue($card['in_stock']);
        $this->assertFalse(collect($res->json('data'))->firstWhere('name', 'Losectil')['in_stock']);
    }

    public function test_product_detail_has_pack_prices_and_alternatives(): void
    {
        $g = Generic::create(['name' => 'Omeprazole', 'slug' => 'omeprazole', 'overview' => 'Reduces stomach acid.']);
        $seclo = $this->medicine(['name' => 'Seclo', 'generic_id' => $g->id]);
        $seclo->packSizes()->create(['name' => 'Full box (10 strips)', 'short_name' => 'box', 'units' => 100, 'extra_discount_percent' => 2]);
        $this->batch($seclo, 460, mrp: 6);
        $alt = $this->medicine(['name' => 'Losectil', 'generic_id' => $g->id]);
        $this->batch($alt, 100, mrp: 6);

        $this->getJson("/api/store/medicines/{$seclo->slug}")
            ->assertOk()
            ->assertJsonPath('data.packs_in_stock', 46)
            ->assertJsonPath('data.info.overview', 'Reduces stomach acid.')
            ->assertJsonCount(2, 'data.pack_sizes')
            ->assertJsonPath('data.pack_sizes.1.price.price', 588)
            ->assertJsonPath('data.alternatives.0.name', 'Losectil');

        $this->getJson('/api/store/medicines/does-not-exist')->assertNotFound();
    }

    public function test_cart_quote_flags_short_stock_and_adds_delivery(): void
    {
        $napa = $this->medicine(['name' => 'Napa']);
        $this->batch($napa, 30, mrp: 1.2);

        $this->postJson('/api/store/cart/quote', [
            'items' => [['medicine_id' => $napa->id, 'quantity' => 5]],
            'delivery_type' => 'standard',
            'delivery_area_id' => $this->area->id,
        ])->assertOk()
            ->assertJsonPath('can_checkout', false)
            ->assertJsonPath('problems.0.available_units', 30)
            ->assertJsonPath('delivery_fee', 50);
    }

    public function test_home_page_payload(): void
    {
        $this->batch($this->medicine(['name' => 'Napa', 'is_featured' => true]), 100);

        $this->getJson('/api/store/home')
            ->assertOk()
            ->assertJsonStructure(['store' => ['name', 'phone'], 'categories', 'most_ordered', 'companies'])
            ->assertJsonPath('most_ordered.0.name', 'Napa');
    }

    public function test_customer_checks_out_with_their_prescription(): void
    {
        Storage::fake('local');
        [$user, $customer] = $this->customerUser();
        $seclo = $this->medicine(['name' => 'Seclo', 'rx_required' => true]);
        $this->batch($seclo, 100, mrp: 6);
        $this->actingAs($user);

        $rxId = $this->postJson('/api/account/prescriptions', ['files' => [UploadedFile::fake()->image('rx.jpg')]])
            ->assertCreated()->json('data.id');

        $code = $this->postJson('/api/account/checkout', [
            'items' => [['medicine_id' => $seclo->id, 'quantity' => 2]],
            'delivery_type' => 'standard',
            'delivery_area_id' => $this->area->id,
            'recipient_name' => 'Rafiq',
            'recipient_phone' => '01811000001',
            'delivery_address' => 'House 1',
            'payment_method' => 'cash',
            'prescription_id' => $rxId,
            'save_address' => true,
        ])->assertCreated()
            ->assertJsonPath('data.status', 'rx_verification')
            ->json('data.code');

        $this->assertSame(1, $customer->addresses()->count());
        $this->getJson('/api/account/orders')->assertOk()->assertJsonPath('data.0.code', $code);
        $this->getJson("/api/account/orders/$code")->assertOk()->assertJsonPath('data.prescription.id', $rxId);

        // The customer can view their own prescription image.
        $pageUrl = $this->getJson('/api/account/prescriptions')->json('data.0.pages.0.url');
        $this->get(parse_url($pageUrl, PHP_URL_PATH))->assertOk();

        $this->postJson("/api/account/orders/$code/cancel")->assertOk()->assertJsonPath('data.status', 'cancelled');
    }

    public function test_customer_cannot_use_or_see_someone_elses_data(): void
    {
        [$userA] = $this->customerUser('01811000001');
        [, $customerB] = $this->customerUser('01811000002');
        $theirRx = Prescription::create(['customer_id' => $customerB->id, 'status' => 'pending']);
        $med = $this->medicine(['rx_required' => true]);
        $this->batch($med, 50);
        $this->actingAs($userA);

        $this->postJson('/api/account/checkout', [
            'items' => [['medicine_id' => $med->id, 'quantity' => 1]],
            'delivery_type' => 'pickup',
            'recipient_name' => 'A',
            'recipient_phone' => '01811000001',
            'payment_method' => 'cash',
            'prescription_id' => $theirRx->id,
        ])->assertNotFound();

        $this->getJson("/api/account/prescriptions/{$theirRx->id}/pages/1")->assertNotFound();
    }

    public function test_staff_cannot_use_customer_account_routes(): void
    {
        $this->actingAs($this->staff('cashier'))->getJson('/api/account/orders')->assertForbidden();
    }
}
