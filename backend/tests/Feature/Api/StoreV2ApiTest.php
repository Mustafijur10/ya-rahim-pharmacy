<?php

namespace Tests\Feature\Api;

use App\Models\Category;
use App\Models\Company;
use App\Models\ContactMessage;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Prescription;
use App\Models\SmsLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** Store design v2: category filters, guest Rx requests, contact form, password login, pay at shop. */
class StoreV2ApiTest extends TestCase
{
    use RefreshDatabase;

    private array $spa = ['Referer' => 'http://localhost:3000', 'Accept' => 'application/json'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedBasics();
    }

    public function test_category_filters_facets_and_price_sort(): void
    {
        $healthcare = Category::create(['name' => 'Healthcare', 'slug' => 'healthcare', 'is_active' => true]);
        $bp = Category::create(['name' => 'BP monitors', 'slug' => 'bp-monitors', 'parent_id' => $healthcare->id, 'is_active' => true]);
        $thermo = Category::create(['name' => 'Thermometers', 'slug' => 'thermometers', 'parent_id' => $healthcare->id, 'is_active' => true]);
        $omron = Company::create(['name' => 'Omron', 'slug' => 'omron', 'is_active' => true]);
        $beurer = Company::create(['name' => 'Beurer', 'slug' => 'beurer', 'is_active' => true]);

        $a = $this->medicine(['name' => 'HEM-7120', 'category_id' => $bp->id, 'company_id' => $omron->id], 1);
        $this->batch($a, 5, mrp: 4500);
        $b = $this->medicine(['name' => 'BM 28', 'category_id' => $bp->id, 'company_id' => $beurer->id, 'discount_percent' => 10], 1);
        $this->batch($b, 2, mrp: 3000);
        $c = $this->medicine(['name' => 'Thermo', 'category_id' => $thermo->id, 'company_id' => $omron->id], 1);
        $this->batch($c, 0, mrp: 450);

        $res = $this->getJson('/api/store/medicines?category=healthcare&sort=price_asc')->assertOk();
        $this->assertSame(['Thermo', 'BM 28', 'HEM-7120'], array_column($res->json('data'), 'name'));
        $this->assertSame(3, $res->json('facets.total'));
        $this->assertSame(2, $res->json('facets.in_stock'));
        $this->assertSame(1, $res->json('facets.on_discount'));
        $this->assertEqualsCanonicalizing(['bp-monitors' => 2, 'thermometers' => 1], collect($res->json('facets.types'))->pluck('count', 'slug')->all());

        $this->getJson('/api/store/medicines?category=healthcare&types=bp-monitors&brands=omron')
            ->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.name', 'HEM-7120');
        $this->getJson('/api/store/medicines?category=healthcare&in_stock=1&max_price=3000')
            ->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.name', 'BM 28'); // 3000 − 10% = 2700
        $this->getJson('/api/store/medicines?category=healthcare&on_discount=1')->assertOk()->assertJsonPath('meta.total', 1);
    }

    public function test_guest_sends_a_prescription_request(): void
    {
        Storage::fake('local');

        $this->postJson('/api/store/prescription-requests', [
            'name' => 'Salma Begum',
            'phone' => '01811000004',
            'delivery_type' => 'pickup',
            'note' => 'Monthly BP medicine',
            'files' => [UploadedFile::fake()->image('rx.jpg')],
        ])->assertCreated();

        $rx = Prescription::with('customer')->firstOrFail();
        $this->assertSame('01811000004', $rx->contact_phone);
        $this->assertSame('pickup', $rx->delivery_type);
        $this->assertSame('Salma Begum', $rx->customer->name);
        $this->assertTrue(SmsLog::where('purpose', 'rx_request')->exists());

        // Bots that fill the hidden field are refused.
        $this->postJson('/api/store/prescription-requests', [
            'name' => 'Bot', 'phone' => '01811000005', 'website' => 'spam', 'files' => [UploadedFile::fake()->image('x.jpg')],
        ])->assertUnprocessable();
    }

    public function test_contact_form(): void
    {
        $this->postJson('/api/store/contact', [
            'name' => 'Rafiq', 'phone' => '+8801811000001', 'topic' => 'order', 'order_code' => 'ON-1042', 'message' => 'Where is my order?', 'agree' => true,
        ])->assertCreated();
        $this->assertSame('01811000001', ContactMessage::firstOrFail()->phone);

        $this->postJson('/api/store/contact', ['name' => 'X', 'phone' => '01811000001', 'topic' => 'other', 'message' => 'Hello there'])
            ->assertUnprocessable()->assertJsonValidationErrors('agree');
    }

    public function test_customer_sets_a_password_and_signs_in_with_it(): void
    {
        $user = User::factory()->create(['phone' => '01811000001', 'is_staff' => false, 'password' => null]);
        Customer::create(['user_id' => $user->id, 'name' => $user->name, 'phone' => '01811000001']);

        $this->actingAs($user)->putJson('/api/account/password', ['password' => 'new-pass-123', 'password_confirmation' => 'new-pass-123'])->assertOk();
        $this->getJson('/api/account/profile')->assertJsonPath('data.has_password', true);
        // Changing it later needs the current one.
        $this->putJson('/api/account/password', ['password' => 'other-pass-1', 'password_confirmation' => 'other-pass-1'])->assertUnprocessable();

        auth()->guard('web')->logout();
        $this->withHeaders($this->spa)->postJson('/api/auth/customer/login', ['phone' => '1811000001', 'password' => 'wrong'])->assertUnprocessable();
        $this->withHeaders($this->spa)->postJson('/api/auth/customer/login', ['phone' => '01811000001', 'password' => 'new-pass-123'])
            ->assertOk()->assertJsonPath('user.id', $user->id);
    }

    public function test_staff_cannot_use_the_customer_password_login(): void
    {
        $cashier = $this->staff('cashier');
        $cashier->update(['password' => 'password123']);

        $this->withHeaders($this->spa)->postJson('/api/auth/customer/login', ['phone' => $cashier->phone, 'password' => 'password123'])->assertUnprocessable();
    }

    public function test_register_fields_are_saved_on_verify(): void
    {
        $this->withHeaders($this->spa)->postJson('/api/auth/otp/request', ['phone' => '01811000009'])->assertOk();
        preg_match('/code is (\d{6})/', SmsLog::where('purpose', 'otp')->latest('id')->value('message'), $m);

        $this->withHeaders($this->spa)->postJson('/api/auth/otp/verify', [
            'phone' => '01811000009', 'code' => $m[1], 'name' => 'Mitu Akter', 'email' => 'mitu@example.com',
            'delivery_area_id' => $this->area->id, 'sms_reminders' => true,
        ])->assertOk();

        $customer = Customer::where('phone', '01811000009')->firstOrFail();
        $this->assertSame('Mitu Akter', $customer->name);
        $this->assertSame($this->area->id, $customer->delivery_area_id);
        $this->assertTrue($customer->sms_reminders);
    }

    public function test_pay_at_shop_is_pickup_only_and_holds_24_hours(): void
    {
        $user = User::factory()->create(['is_staff' => false]);
        Customer::create(['user_id' => $user->id, 'name' => $user->name, 'phone' => $user->phone]);
        $med = $this->medicine();
        $this->batch($med, 50, mrp: 2);
        $this->actingAs($user);
        $base = ['items' => [['medicine_id' => $med->id, 'quantity' => 1]], 'recipient_name' => 'A', 'recipient_phone' => $user->phone, 'payment_method' => 'pay_at_shop'];

        $this->postJson('/api/account/checkout', $base + ['delivery_type' => 'standard', 'delivery_area_id' => $this->area->id, 'delivery_address' => 'House 1'])
            ->assertUnprocessable()->assertJsonPath('code', 'pay_at_shop_pickup_only');

        $this->postJson('/api/account/checkout', $base + ['delivery_type' => 'pickup'])->assertCreated();
        $order = Order::firstOrFail();
        $this->assertSame('pay_at_shop', $order->payment_preference);
        $this->assertTrue($order->hold_until->between(now()->addHours(23), now()->addHours(25)));
        $this->assertSame(0, $order->payments()->count());
    }
}
