<?php

namespace Tests\Feature\Api;

use App\Support\Features;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/** Super admin "Modules & features", staff name picker and PIN login. */
class ModulesApiTest extends TestCase
{
    use RefreshDatabase;

    private array $spa = ['Referer' => 'http://localhost:3000', 'Accept' => 'application/json'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedBasics();
    }

    public function test_only_the_super_admin_manages_modules(): void
    {
        $this->actingAs($this->staff('manager'))->getJson('/api/admin/modules')->assertForbidden();

        $owner = $this->staff('owner');
        $owner->update(['pin' => '2468']);
        $this->actingAs($owner)->getJson('/api/admin/modules')
            ->assertOk()
            ->assertJsonPath('groups.0.key', 'store_sales');

        // Wrong PIN refuses the change.
        $this->putJson('/api/admin/modules', ['features' => ['blood_donors' => false], 'pin' => '0000'])->assertUnprocessable();

        $this->putJson('/api/admin/modules', ['features' => ['emergency_directory' => false], 'pin' => '2468'])->assertOk();
        $this->assertFalse(Features::enabled('emergency_directory'));
        $this->assertFalse(Features::enabled('blood_donors'), 'Blood donors needs the emergency directory');
        $this->assertSame('Emergency directory turned off', Activity::where('log_name', 'modules')->latest('id')->value('description'));

        // Core features can't be turned off.
        $this->putJson('/api/admin/modules', ['features' => ['pos' => false]])->assertUnprocessable();
    }

    public function test_features_are_sent_to_the_apps(): void
    {
        Features::update(['customer_credit' => false]);

        $this->getJson('/api/store/settings')->assertOk()->assertJsonPath('store.features.customer_credit', false);
        $this->actingAs($this->staff('cashier'))->getJson('/api/auth/me')->assertOk()->assertJsonPath('features.pos', true);
    }

    public function test_counter_name_picker_and_pin_login(): void
    {
        $cashier = $this->staff('cashier');
        $cashier->update(['name' => 'Rakib Hossain', 'pin' => '1357']);
        $this->staff('rider')->update(['pin' => '1111']);

        $list = $this->getJson('/api/auth/staff/directory')->assertOk()->json('data');
        $this->assertContains('Rakib', array_column($list, 'name'));
        $this->assertNotContains('Delivery rider', array_column($list, 'role_label'), 'Riders use the phone app');
        $this->assertArrayNotHasKey('phone', $list[0], 'No phone numbers on the public picker');

        $this->withHeaders($this->spa)->postJson('/api/auth/staff/login', ['user_id' => $cashier->id, 'pin' => '0000'])->assertUnprocessable();
        $this->withHeaders($this->spa)->postJson('/api/auth/staff/login', ['user_id' => $cashier->id, 'pin' => '1357'])
            ->assertOk()->assertJsonPath('user.id', $cashier->id)->assertJsonStructure(['features']);
    }

    public function test_feature_middleware_hides_routes(): void
    {
        Route::middleware(['api', 'feature:health_blog'])->get('/api/_test/blog', fn () => 'ok');

        $this->getJson('/api/_test/blog')->assertNotFound()->assertJsonPath('code', 'feature_off');
        Features::update(['health_blog' => true]);
        $this->getJson('/api/_test/blog')->assertOk();
    }
}
