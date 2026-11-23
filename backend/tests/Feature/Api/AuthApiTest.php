<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\SmsLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthApiTest extends TestCase
{
    use RefreshDatabase;

    /** Sanctum treats requests from the Next.js origin as cookie-session requests. */
    private array $spa = ['Referer' => 'http://localhost:3000', 'Accept' => 'application/json'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedBasics();
    }

    private function otpFromSms(string $phone): string
    {
        $message = SmsLog::where('phone', $phone)->where('purpose', 'otp')->latest('id')->value('message');
        preg_match('/code is (\d{6})/', (string) $message, $m);

        return $m[1];
    }

    public function test_staff_signs_in_with_password_and_gets_permissions(): void
    {
        $owner = $this->staff('owner');
        $owner->update(['password' => 'secret-pass']);

        $this->withHeaders($this->spa)
            ->postJson('/api/auth/staff/login', ['login' => $owner->email, 'password' => 'secret-pass'])
            ->assertOk()
            ->assertJsonPath('user.role', 'owner')
            ->assertJsonPath('user.role_label', 'Super admin')
            ->assertJsonFragment(['settings.full']);

        $this->withHeaders($this->spa)->getJson('/api/auth/me')->assertOk()->assertJsonPath('user.id', $owner->id);
    }

    public function test_cashier_signs_in_with_phone_and_pin(): void
    {
        $cashier = $this->staff('cashier');
        $cashier->update(['pin' => '4321']);

        $this->withHeaders($this->spa)
            ->postJson('/api/auth/staff/login', ['login' => $cashier->phone, 'pin' => '4321'])
            ->assertOk()
            ->assertJsonPath('user.role', 'cashier');
    }

    public function test_wrong_password_and_inactive_accounts_are_refused(): void
    {
        $staff = $this->staff('manager');
        $staff->update(['password' => 'right-pass']);

        $this->withHeaders($this->spa)->postJson('/api/auth/staff/login', ['login' => $staff->email, 'password' => 'wrong'])
            ->assertUnprocessable()->assertJsonValidationErrors('login');

        $staff->update(['status' => 'inactive']);
        $this->withHeaders($this->spa)->postJson('/api/auth/staff/login', ['login' => $staff->email, 'password' => 'right-pass'])
            ->assertUnprocessable();
    }

    public function test_customer_signs_in_with_sms_code_and_account_is_linked(): void
    {
        $existing = Customer::create(['name' => 'Salma Begum', 'phone' => '01811000004']);

        $this->withHeaders($this->spa)->postJson('/api/auth/otp/request', ['phone' => '+880 1811-000004'])
            ->assertOk()->assertJsonPath('phone', '01811000004');

        // Asking again within a minute is refused.
        $this->withHeaders($this->spa)->postJson('/api/auth/otp/request', ['phone' => '01811000004'])->assertStatus(429);

        $this->withHeaders($this->spa)->postJson('/api/auth/otp/verify', ['phone' => '01811000004', 'code' => '000000'])
            ->assertUnprocessable()->assertJsonPath('code', 'otp_wrong');

        $this->withHeaders($this->spa)
            ->postJson('/api/auth/otp/verify', ['phone' => '01811000004', 'code' => $this->otpFromSms('01811000004')])
            ->assertOk()
            ->assertJsonPath('user.is_staff', false)
            ->assertJsonPath('user.customer.id', $existing->id);

        $this->assertNotNull($existing->fresh()->user_id);
        $this->withHeaders($this->spa)->getJson('/api/account/profile')->assertOk()->assertJsonPath('data.name', 'Salma Begum');
    }

    public function test_a_staff_phone_cannot_sign_in_through_the_customer_code(): void
    {
        $cashier = $this->staff('cashier');

        $this->withHeaders($this->spa)->postJson('/api/auth/otp/request', ['phone' => $cashier->phone])->assertOk();
        $this->withHeaders($this->spa)
            ->postJson('/api/auth/otp/verify', ['phone' => $cashier->phone, 'code' => $this->otpFromSms($cashier->phone)])
            ->assertForbidden()
            ->assertJsonPath('code', 'staff_account');

        $this->assertGuest('web');
    }

    public function test_invalid_phone_is_rejected(): void
    {
        $this->withHeaders($this->spa)->postJson('/api/auth/otp/request', ['phone' => '12345'])
            ->assertUnprocessable()->assertJsonPath('code', 'invalid_phone');
    }

    public function test_logout(): void
    {
        $this->actingAs($this->staff('owner'));
        $this->withHeaders($this->spa)->postJson('/api/auth/logout')->assertOk();
        $this->assertGuest('web');
    }

    public function test_guests_get_401(): void
    {
        $this->getJson('/api/auth/me')->assertUnauthorized();
        $this->getJson('/api/admin/dashboard')->assertUnauthorized();
        $this->getJson('/api/account/orders')->assertUnauthorized();
        $this->assertSame(0, User::where('is_staff', false)->count());
    }
}
