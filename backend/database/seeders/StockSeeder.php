<?php

namespace Database\Seeders;

use App\Enums\StockMovementType;
use App\Models\Batch;
use App\Models\Branch;
use App\Models\Medicine;
use App\Models\Purchase;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * Opening stock: one purchase per supplier, one or two batches per medicine.
 * Includes the cases shown in the design (expired, expiring soon, low stock)
 * so the Inventory and Expiry screens have something to show.
 */
class StockSeeder extends Seeder
{
    /** @var array<int, float> medicine id => sample MRP per base unit (filled by CatalogSeeder) */
    public static array $sampleUnitMrp = [];

    public function run(): void
    {
        mt_srand(42);

        $branch = Branch::where('code', 'MAIN')->firstOrFail();
        $keeperId = User::role('store_keeper')->value('id');
        $racks = ['A-1', 'A-2', 'A-3', 'B-1', 'B-2', 'B-4', 'C-1', 'C-2', 'D-2', 'E-1'];

        // Special cases from the design, keyed by medicine slug:
        // [packs in stock, expiry date, rack]
        $special = [
            'napa-500-mg-tablet' => [8, '2028-07-31', 'A-1'],
            'seclo-20-mg-capsule' => [46, '2027-03-31', 'A-3'],
            'monas-10-mg-tablet' => [3, '2028-04-30', 'B-4'],
            'comet-500-mg-tablet' => [5, '2027-12-31', 'D-2'],
            'fexo-120-mg-tablet' => [38, '2028-05-31', 'B-2'],
            'moxacil-500-mg-capsule' => [6, now()->subDays(12)->toDateString(), 'C-2'],
            'lantus-solostar-100-iuml-pen' => [3, now()->addDays(12)->toDateString(), 'Fridge'],
            'triocim-200-mg-capsule' => [14, now()->addDays(60)->toDateString(), 'C-1'],
            'orsaline-n-sachet' => [60, now()->addDays(80)->toDateString(), 'E-1'],
        ];

        $medicines = Medicine::with(['company', 'defaultPackSize'])->get();

        foreach ($medicines->groupBy('company_id') as $companyMedicines) {
            $company = $companyMedicines->first()->company;
            $supplier = Supplier::firstOrCreate(
                ['name' => $company->name.' Distribution'],
                ['company_id' => $company->id, 'phone' => '[Supplier phone]', 'is_active' => true],
            );

            $purchase = Purchase::create([
                'code' => 'PUR-'.Str::upper(Str::random(6)),
                'branch_id' => $branch->id,
                'supplier_id' => $supplier->id,
                'invoice_no' => 'OPENING',
                'purchased_at' => now()->subDays(20)->toDateString(),
                'status' => 'received',
                'note' => 'Opening stock (sample data)',
                'created_by' => $keeperId,
            ]);

            $total = 0;
            foreach ($companyMedicines as $medicine) {
                $unitsPerPack = $medicine->defaultPackSize?->units ?? 1;
                $unitMrp = self::$sampleUnitMrp[$medicine->id] ?? 10;

                $lots = isset($special[$medicine->slug])
                    ? [$special[$medicine->slug]]
                    : $this->randomLots($racks);

                foreach ($lots as $n => [$packs, $expiry, $rack]) {
                    $qty = $packs * $unitsPerPack;
                    $unitCost = round($unitMrp * 0.86, 4);
                    $batchNo = Str::upper(Str::substr(preg_replace('/[^a-z]/i', '', $medicine->name), 0, 2))
                        .Carbon::parse($expiry)->format('ym').($n + 1);

                    $batch = Batch::create([
                        'branch_id' => $branch->id,
                        'medicine_id' => $medicine->id,
                        'supplier_id' => $supplier->id,
                        'batch_no' => $batchNo,
                        'manufactured_at' => Carbon::parse($expiry)->subYears(2)->toDateString(),
                        'expiry_date' => $expiry,
                        'cost_price' => $unitCost,
                        'mrp' => $unitMrp,
                        'initial_quantity' => $qty,
                        'quantity' => $qty,
                        'rack' => $rack,
                        'status' => 'active',
                    ]);

                    $lineTotal = round($unitCost * $qty, 2);
                    $purchase->items()->create([
                        'medicine_id' => $medicine->id,
                        'batch_id' => $batch->id,
                        'batch_no' => $batchNo,
                        'expiry_date' => $expiry,
                        'quantity' => $qty,
                        'unit_cost' => $unitCost,
                        'mrp' => $unitMrp,
                        'line_total' => $lineTotal,
                    ]);
                    $total += $lineTotal;

                    StockMovement::create([
                        'branch_id' => $branch->id,
                        'batch_id' => $batch->id,
                        'medicine_id' => $medicine->id,
                        'type' => StockMovementType::Purchase,
                        'quantity' => $qty,
                        'balance_after' => $qty,
                        'reference_type' => $purchase->getMorphClass(),
                        'reference_id' => $purchase->id,
                        'user_id' => $keeperId,
                        'note' => 'Opening stock',
                    ]);
                }
            }

            $purchase->update(['subtotal' => $total, 'total' => $total, 'paid' => $total]);
        }
    }

    /** One or two batches with safe (green) expiry dates. */
    private function randomLots(array $racks): array
    {
        $lots = [];
        $count = mt_rand(1, 2);
        for ($i = 0; $i < $count; $i++) {
            $lots[] = [
                mt_rand(10, 60),
                now()->addMonths(mt_rand(6, 30))->endOfMonth()->toDateString(),
                $racks[array_rand($racks)],
            ];
        }

        return $lots;
    }
}
