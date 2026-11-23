<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\DeliveryArea;
use App\Models\Setting;
use Illuminate\Database\Seeder;

/**
 * The shop itself. Values in [brackets] are placeholders the owner
 * must replace in Settings before going live.
 */
class ShopSeeder extends Seeder
{
    public function run(): void
    {
        $branch = Branch::updateOrCreate(['code' => 'MAIN'], [
            'name' => 'Main shop',
            'phone' => '[01XXX-XXXXXX]',
            'address' => '[Shop address, area, city]',
            'opening_hours' => '[Open hours], 7 days',
            'drug_licence_no' => '[Drug licence number]',
            'trade_licence_no' => '[Trade licence number]',
            'is_active' => true,
        ]);

        // Placeholder delivery areas and fees: edit in Settings → Delivery areas.
        $areas = [
            ['name' => '[Delivery area 1]', 'standard_fee' => 40, 'express_fee' => 80, 'express_available' => true],
            ['name' => '[Delivery area 2]', 'standard_fee' => 50, 'express_fee' => 100, 'express_available' => true],
            ['name' => '[Delivery area 3]', 'standard_fee' => 60, 'express_fee' => null, 'express_available' => false],
        ];
        foreach ($areas as $i => $area) {
            DeliveryArea::updateOrCreate(
                ['branch_id' => $branch->id, 'name' => $area['name']],
                $area + ['sort_order' => $i, 'is_active' => true],
            );
        }

        $settings = [
            'store.name' => 'Ya Rahim Pharmacy',
            'store.phone' => '[01XXX-XXXXXX]',
            'store.email' => null,
            'store.address' => '[Shop address, area, city]',
            'store.opening_hours' => '[Open hours], 7 days',
            'store.drug_licence_no' => '[Drug licence number]',
            'store.trade_licence_no' => '[Trade licence number]',
            'store.map_url' => null,
            'store.whatsapp' => '[01XXX-XXXXXX]',
            'store.area' => '[Area, City]',
            'store.hours_sat_thu' => '[open] – [close]',
            'store.hours_friday' => '[open] – [close]',
            'store.delivery_hours' => '[start] – [end]',
            'store.tin_bin' => '[TIN/BIN number]',
            'store.since_year' => null,
            'delivery.same_day_cutoff' => '18:00',
            'delivery.pickup_ready_minutes' => 30,
            'delivery.express_hours' => 2,
            'pos.max_cashier_discount_percent' => config('pharmacy.max_cashier_discount_percent'),
            'sales.monthly_target' => 1200000,
            'pos.receipt_footer' => 'Thank you. Medicines once sold are returnable only as per our return policy.',
            'payments.methods' => ['cash', 'bkash', 'nagad', 'card'],
            'refill.remind_days_before' => 3,
        ];
        foreach ($settings as $key => $value) {
            Setting::put($key, $value);
        }
    }
}
