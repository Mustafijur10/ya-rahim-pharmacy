<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            RolesAndPermissionsSeeder::class,
            ShopSeeder::class,
            StaffSeeder::class,
            CatalogSeeder::class,
            StockSeeder::class,
            CustomerSeeder::class,
        ]);

        // Demo sales and online orders for development (skipped in production).
        if (! app()->isProduction()) {
            $this->call(DemoSalesSeeder::class);
        }
    }
}
