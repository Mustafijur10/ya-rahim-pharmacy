<?php

namespace Tests;

use App\Models\Batch;
use App\Models\Branch;
use App\Models\DeliveryArea;
use App\Models\Medicine;
use App\Models\Shift;
use App\Models\User;
use App\Services\ShiftService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Str;

abstract class TestCase extends BaseTestCase
{
    protected Branch $branch;

    protected DeliveryArea $area;

    /** Roles, one branch and one delivery area. Call from setUp() in tests that need them. */
    protected function seedBasics(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->branch = Branch::create(['name' => 'Main shop', 'code' => 'MAIN', 'is_active' => true]);
        $this->area = DeliveryArea::create([
            'branch_id' => $this->branch->id,
            'name' => 'Test area',
            'standard_fee' => 50,
            'express_fee' => 100,
            'express_available' => true,
            'is_active' => true,
        ]);
    }

    protected function staff(string $role): User
    {
        return User::factory()->staff()->create(['branch_id' => $this->branch->id])->assignRole($role);
    }

    /** A medicine sold in packs of $unitsPerPack (default: strip of 10). */
    protected function medicine(array $attributes = [], int $unitsPerPack = 10): Medicine
    {
        $name = $attributes['name'] ?? 'Med'.Str::random(5);
        $medicine = Medicine::create($attributes + [
            'name' => $name,
            'strength' => '10 mg',
            'dosage_form' => 'Tablet',
            'slug' => Str::slug($name).'-'.Str::lower(Str::random(6)),
            'unit_name' => 'tab',
            'rx_required' => false,
            'discount_percent' => 0,
            'is_active' => true,
        ]);
        $medicine->packSizes()->create([
            'name' => "1 strip ($unitsPerPack tabs)",
            'short_name' => 'strip',
            'units' => $unitsPerPack,
            'is_default' => true,
        ]);

        return $medicine->load('packSizes');
    }

    protected function batch(Medicine $medicine, int $units, string $expiry = '+1 year', float $mrp = 1.0, float $cost = 0.8, string $no = ''): Batch
    {
        return Batch::create([
            'branch_id' => $this->branch->id,
            'medicine_id' => $medicine->id,
            'batch_no' => $no ?: 'B'.Str::upper(Str::random(6)),
            'expiry_date' => now()->modify($expiry)->toDateString(),
            'cost_price' => $cost,
            'mrp' => $mrp,
            'initial_quantity' => $units,
            'quantity' => $units,
            'status' => 'active',
        ]);
    }

    protected function openShift(User $user, float $cash = 1000): Shift
    {
        return app(ShiftService::class)->open($user, $cash);
    }
}
