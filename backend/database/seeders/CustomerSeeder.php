<?php

namespace Database\Seeders;

use App\Models\Customer;
use App\Models\DeliveryArea;
use Illuminate\Database\Seeder;

/** Sample customers (names from the design) plus random ones. Development only. */
class CustomerSeeder extends Seeder
{
    public function run(): void
    {
        $areaId = DeliveryArea::value('id');

        $named = [
            'Rafiq Hasan', 'Nusrat Jahan', 'Kamal Uddin', 'Salma Begum', 'Mitu Akter',
            'Habib Rahman', 'Farhana Islam', 'Arif Hossain',
        ];

        foreach ($named as $i => $name) {
            $customer = Customer::updateOrCreate(
                ['phone' => sprintf('0181000000%d', $i + 1)],
                ['name' => $name],
            );

            $customer->addresses()->firstOrCreate(['label' => 'Home'], [
                'delivery_area_id' => $areaId,
                'recipient_name' => $name,
                'phone' => $customer->phone,
                'address_line' => '[House, road, area]',
                'landmark' => '[Landmark]',
                'is_default' => true,
            ]);
        }

        if (Customer::count() < 30) {
            Customer::factory()->count(22)->create();
        }
    }
}
