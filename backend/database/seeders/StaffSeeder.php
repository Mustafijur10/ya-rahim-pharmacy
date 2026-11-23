<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Staff from the design. DEVELOPMENT ONLY: every account uses
 * password "password" and PIN "1234". Change them before going live.
 */
class StaffSeeder extends Seeder
{
    public function run(): void
    {
        $branchId = Branch::where('code', 'MAIN')->value('id');

        $staff = [
            ['Tanvir Ahmed', 'owner', '01700000001', 'owner@yarahim.test', null, null, 'flexible'],
            ['Nusrat Sultana', 'manager', '01700000002', 'manager@yarahim.test', null, null, 'day'],
            ['Farhan Rahman', 'pharmacist', '01700000003', 'pharmacist@yarahim.test', '[Reg. no.]', null, 'day'],
            ['Mahmuda Khatun', 'pharmacist', '01700000004', 'pharmacist2@yarahim.test', '[Reg. no.]', null, 'evening'],
            ['Rakib Hossain', 'cashier', '01700000005', 'cashier@yarahim.test', null, 'Counter 1', 'day'],
            ['Shakil Islam', 'store_keeper', '01700000006', 'store@yarahim.test', null, null, 'day'],
            ['Jamal Uddin', 'rider', '01700000007', 'rider@yarahim.test', null, 'Bike', 'day'],
        ];

        foreach ($staff as [$name, $role, $phone, $email, $regNo, $note, $shift]) {
            $user = User::updateOrCreate(['phone' => $phone], [
                'branch_id' => $branchId,
                'name' => $name,
                'email' => $email,
                'password' => 'password',
                'pin' => '1234',
                'is_staff' => true,
                'status' => 'active',
                'registration_no' => $regNo,
                'staff_note' => $note,
                'shift' => $shift,
                'phone_verified_at' => now(),
            ]);
            $user->syncRoles([$role]);
        }
    }
}
