<?php

namespace Database\Seeders;

use App\Enums\Role as RoleEnum;
use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Creates one permission per module and level (e.g. "orders.full", "rx.view")
 * and gives each role exactly the level from config('pharmacy.default_matrix').
 */
class RolesAndPermissionsSeeder extends Seeder
{
    private const LEVELS = ['F' => 'full', 'V' => 'view', 'A' => 'approval', 'O' => 'own'];

    public function run(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $modules = array_keys(config('pharmacy.modules'));
        foreach ($modules as $module) {
            foreach (self::LEVELS as $level) {
                Permission::findOrCreate("$module.$level", 'web');
            }
        }

        $roleOrder = config('pharmacy.role_order');
        $matrix = config('pharmacy.default_matrix');

        foreach ($roleOrder as $index => $roleName) {
            $role = Role::findOrCreate($roleName, 'web');

            $permissions = [];
            foreach ($matrix as $module => $row) {
                $code = $row[$index] ?? 'N';
                if (isset(self::LEVELS[$code])) {
                    $permissions[] = "$module.".self::LEVELS[$code];
                }
            }
            $role->syncPermissions($permissions);
        }

        // Guard against the enum and config drifting apart.
        foreach (RoleEnum::cases() as $case) {
            Role::findOrCreate($case->value, 'web');
        }

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
}
