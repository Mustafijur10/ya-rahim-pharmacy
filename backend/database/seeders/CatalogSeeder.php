<?php

namespace Database\Seeders;

use App\Models\Category;
use App\Models\Company;
use App\Models\Generic;
use App\Models\Medicine;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * Starter catalog for development and demos.
 *
 * IMPORTANT: prices here are SAMPLE values, not real MRPs. Before launch, replace
 * them with the shop's real price list (an Excel import comes with the Inventory module).
 */
class CatalogSeeder extends Seeder
{
    public function run(): void
    {
        $this->seedCategories();
        $this->seedGenerics();
        $this->seedMedicines();
    }

    private function seedCategories(): void
    {
        $top = [
            ['Medicines', 'ওষুধ', 'pill'],
            ['Healthcare', 'স্বাস্থ্যসেবা', 'activity'],
            ['Baby & Mom', 'মা ও শিশু', 'heart'],
            ['Personal care', 'ব্যক্তিগত যত্ন', 'droplet'],
            ['Diabetes care', 'ডায়াবেটিস কেয়ার', 'syringe'],
            ['Medical devices', 'মেডিকেল ডিভাইস', 'thermometer'],
            ['Herbal & Unani', 'হারবাল ও ইউনানি', 'leaf'],
            ['Vitamins', 'ভিটামিন', 'sun'],
        ];
        foreach ($top as $i => [$name, $bn, $icon]) {
            Category::updateOrCreate(['slug' => Str::slug($name)], [
                'name' => $name, 'name_bn' => $bn, 'icon' => $icon, 'sort_order' => $i, 'is_active' => true,
            ]);
        }

        $medicinesId = Category::where('slug', 'medicines')->value('id');
        $sub = [
            ['Fever & pain', 'জ্বর ও ব্যথা'],
            ['Gastric & acidity', 'গ্যাস্ট্রিক'],
            ['Allergy & asthma', 'অ্যালার্জি ও হাঁপানি'],
            ['Antibiotics', 'অ্যান্টিবায়োটিক'],
            ['Heart & blood pressure', 'হৃদরোগ ও রক্তচাপ'],
            ['Cholesterol', 'কোলেস্টেরল'],
        ];
        foreach ($sub as $i => [$name, $bn]) {
            Category::updateOrCreate(['slug' => Str::slug($name)], [
                'parent_id' => $medicinesId, 'name' => $name, 'name_bn' => $bn, 'sort_order' => $i, 'is_active' => true,
            ]);
        }
    }

    private function seedGenerics(): void
    {
        $generics = [
            'Omeprazole' => [
                'therapeutic_class' => 'Proton pump inhibitor',
                'overview' => 'Omeprazole is a proton pump inhibitor that reduces the amount of acid made in the stomach. It is commonly prescribed for acid reflux (GERD), stomach and duodenal ulcers, and as part of treatment for H. pylori infection.',
                'storage' => 'Store below 30°C in a dry place, away from light. Keep out of reach of children.',
            ],
            'Paracetamol' => [
                'therapeutic_class' => 'Analgesic & antipyretic',
                'overview' => 'Paracetamol relieves mild to moderate pain and reduces fever.',
                'storage' => 'Store below 30°C in a dry place.',
            ],
            'Fexofenadine' => [
                'therapeutic_class' => 'Non-sedating antihistamine',
                'overview' => 'Fexofenadine relieves allergy symptoms such as sneezing, runny nose and itchy skin.',
            ],
            'Montelukast' => [
                'therapeutic_class' => 'Leukotriene receptor antagonist',
                'overview' => 'Montelukast helps prevent asthma attacks and relieves seasonal allergy symptoms.',
            ],
            'Metformin' => [
                'therapeutic_class' => 'Oral anti-diabetic (biguanide)',
                'overview' => 'Metformin helps control blood sugar in type 2 diabetes.',
            ],
        ];

        foreach ($generics as $name => $data) {
            Generic::updateOrCreate(['slug' => Str::slug($name)], ['name' => $name] + $data);
        }
    }

    /**
     * Columns: brand, strength, form, generic, company, category slug, Rx?, unit,
     *          units per pack, pack name, pack MRP (sample), discount %, packs per box (or null), cold chain?
     */
    private function medicines(): array
    {
        return [
            // Fever & pain
            ['Napa', '500 mg', 'Tablet', 'Paracetamol', 'Beximco', 'fever-pain', false, 'tab', 10, 'strip', 12, 8, 50, false],
            ['Napa Extra', '500 mg+65 mg', 'Tablet', 'Paracetamol + Caffeine', 'Beximco', 'fever-pain', false, 'tab', 10, 'strip', 25, 5, 24, false],
            ['Napa', '120 mg/5 ml', 'Suspension', 'Paracetamol', 'Beximco', 'fever-pain', false, 'bottle', 1, 'bottle', 35, 5, null, false],
            ['Ace', '500 mg', 'Tablet', 'Paracetamol', 'Square', 'fever-pain', false, 'tab', 10, 'strip', 12, 5, 50, false],
            ['Rolac', '10 mg', 'Tablet', 'Ketorolac', 'Renata', 'fever-pain', true, 'tab', 10, 'strip', 120, 5, 5, false],

            // Gastric & acidity
            ['Seclo', '20 mg', 'Capsule', 'Omeprazole', 'Square', 'gastric-acidity', true, 'cap', 10, 'strip', 60, 8, 10, false],
            ['Losectil', '20 mg', 'Capsule', 'Omeprazole', 'Eskayef', 'gastric-acidity', true, 'cap', 10, 'strip', 60, 8, 10, false],
            ['Proceptin', '20 mg', 'Capsule', 'Omeprazole', 'General Pharmaceuticals', 'gastric-acidity', true, 'cap', 10, 'strip', 55, 8, 10, false],
            ['Xeldrin', '20 mg', 'Capsule', 'Omeprazole', 'Drug International', 'gastric-acidity', true, 'cap', 10, 'strip', 55, 8, 10, false],
            ['Sergel', '20 mg', 'Capsule', 'Esomeprazole', 'Healthcare Pharmaceuticals', 'gastric-acidity', true, 'cap', 10, 'strip', 70, 5, 10, false],
            ['Maxpro', '20 mg', 'Tablet', 'Esomeprazole', 'Renata', 'gastric-acidity', true, 'tab', 10, 'strip', 70, 5, 10, false],
            ['Pantonix', '20 mg', 'Tablet', 'Pantoprazole', 'Incepta', 'gastric-acidity', true, 'tab', 10, 'strip', 70, 5, 10, false],

            // Allergy & asthma
            ['Fexo', '120 mg', 'Tablet', 'Fexofenadine', 'Square', 'allergy-asthma', false, 'tab', 10, 'strip', 90, 7, 5, false],
            ['Fenadin', '120 mg', 'Tablet', 'Fexofenadine', 'Renata', 'allergy-asthma', false, 'tab', 10, 'strip', 90, 5, 5, false],
            ['Alatrol', '10 mg', 'Tablet', 'Cetirizine', 'Square', 'allergy-asthma', false, 'tab', 10, 'strip', 30, 5, 10, false],
            ['Monas', '10 mg', 'Tablet', 'Montelukast', 'ACME', 'allergy-asthma', true, 'tab', 10, 'strip', 175, 8, 3, false],
            ['Montair', '10 mg', 'Tablet', 'Montelukast', 'Incepta', 'allergy-asthma', true, 'tab', 10, 'strip', 160, 5, 3, false],

            // Antibiotics
            ['Moxacil', '500 mg', 'Capsule', 'Amoxicillin', 'Square', 'antibiotics', true, 'cap', 10, 'strip', 70, 5, 10, false],
            ['Triocim', '200 mg', 'Capsule', 'Cefixime', 'Beximco', 'antibiotics', true, 'cap', 10, 'strip', 350, 5, 5, false],
            ['Cef-3', '200 mg', 'Capsule', 'Cefixime', 'Square', 'antibiotics', true, 'cap', 10, 'strip', 350, 5, 5, false],
            ['Azithrocin', '500 mg', 'Tablet', 'Azithromycin', 'Beximco', 'antibiotics', true, 'tab', 3, 'strip', 135, 5, 10, false],
            ['Zimax', '500 mg', 'Tablet', 'Azithromycin', 'Square', 'antibiotics', true, 'tab', 3, 'strip', 135, 5, 10, false],
            ['Filmet', '400 mg', 'Tablet', 'Metronidazole', 'Beximco', 'antibiotics', true, 'tab', 10, 'strip', 20, 5, 20, false],

            // Heart & blood pressure
            ['Camlodin', '5 mg', 'Tablet', 'Amlodipine', 'Square', 'heart-blood-pressure', true, 'tab', 10, 'strip', 60, 5, 10, false],
            ['Amdocal', '5 mg', 'Tablet', 'Amlodipine', 'Beximco', 'heart-blood-pressure', true, 'tab', 10, 'strip', 60, 5, 10, false],
            ['Osartil', '50 mg', 'Tablet', 'Losartan Potassium', 'Incepta', 'heart-blood-pressure', true, 'tab', 10, 'strip', 80, 5, 10, false],
            ['Angilock', '50 mg', 'Tablet', 'Losartan Potassium', 'Square', 'heart-blood-pressure', true, 'tab', 10, 'strip', 80, 5, 10, false],
            ['Ecosprin', '75 mg', 'Tablet', 'Aspirin', 'ACI', 'heart-blood-pressure', false, 'tab', 10, 'strip', 8, 5, 30, false],

            // Cholesterol
            ['Atova', '10 mg', 'Tablet', 'Atorvastatin', 'Beximco', 'cholesterol', true, 'tab', 10, 'strip', 100, 5, 3, false],
            ['Rosuva', '10 mg', 'Tablet', 'Rosuvastatin', 'Square', 'cholesterol', true, 'tab', 10, 'strip', 180, 5, 3, false],

            // Diabetes care
            ['Comet', '500 mg', 'Tablet', 'Metformin', 'Square', 'diabetes-care', true, 'tab', 10, 'strip', 45, 5, 10, false],
            ['Lantus SoloStar', '100 IU/ml', 'Pen', 'Insulin Glargine', 'Sanofi', 'diabetes-care', true, 'pen', 1, 'pen', 1250, 3, null, true],
            ['Accu-Chek Active test strips', '50 strips', null, null, 'Roche', 'diabetes-care', false, 'box', 1, 'box', 1600, 5, null, false],

            // Vitamins
            ['Ceevit', '250 mg', 'Chewable Tablet', 'Vitamin C', 'Square', 'vitamins', false, 'tab', 10, 'strip', 20, 5, 20, false],
            ['Calbo-D', '500 mg+200 IU', 'Tablet', 'Calcium + Vitamin D3', 'Square', 'vitamins', false, 'tab', 10, 'strip', 100, 5, 3, false],
            ['Aristovit-B', null, 'Tablet', 'Vitamin B Complex', 'Aristopharma', 'vitamins', false, 'tab', 10, 'strip', 40, 5, 10, false],
            ['Neuro-B', null, 'Tablet', 'Vitamin B1 + B6 + B12', 'Square', 'vitamins', false, 'tab', 10, 'strip', 100, 5, 3, false],

            // Healthcare
            ['Orsaline-N', null, 'Sachet', 'Oral Rehydration Salts', 'SMC', 'healthcare', false, 'pc', 1, 'sachet', 6, 0, 20, false],
            ['Savlon Antiseptic Liquid', '100 ml', null, null, 'ACI', 'healthcare', false, 'bottle', 1, 'bottle', 70, 5, null, false],

            // Baby & Mom
            ["Johnson's Baby Lotion", '100 ml', null, null, 'Johnson & Johnson', 'baby-mom', false, 'pc', 1, 'pc', 350, 5, null, false],
            ['Baby Wipes', '80 pcs', null, null, 'Square Toiletries', 'baby-mom', false, 'pack', 1, 'pack', 180, 5, null, false],

            // Personal care
            ['Sensodyne Toothpaste', '70 g', null, null, 'Haleon', 'personal-care', false, 'pc', 1, 'pc', 290, 5, null, false],
            ['Dettol Soap', '75 g', null, null, 'Reckitt', 'personal-care', false, 'pc', 1, 'pc', 65, 0, null, false],

            // Medical devices
            ['Omron Digital Thermometer MC-246', null, null, null, 'Omron', 'medical-devices', false, 'pc', 1, 'pc', 450, 5, null, false],
            ['Omron BP Monitor HEM-7120', null, null, null, 'Omron', 'medical-devices', false, 'pc', 1, 'pc', 4500, 5, null, false],

            // Herbal & Unani
            ['Safi', '200 ml', 'Syrup', null, 'Hamdard', 'herbal-unani', false, 'bottle', 1, 'bottle', 220, 5, null, false],
            ['Isabgul Husk', '100 g', null, null, 'Hamdard', 'herbal-unani', false, 'pack', 1, 'pack', 160, 5, null, false],
        ];
    }

    private function seedMedicines(): void
    {
        $categories = Category::pluck('id', 'slug');
        $featured = ['Napa', 'Seclo', 'Fexo', 'Monas', 'Comet', 'Ceevit', 'Alatrol', 'Maxpro'];
        $sold = 1000;

        foreach ($this->medicines() as [$brand, $strength, $form, $genericName, $companyName, $categorySlug, $rx, $unit, $units, $packShort, $packMrp, $discount, $boxPacks, $cold]) {
            $generic = $genericName
                ? Generic::firstOrCreate(['slug' => Str::slug($genericName)], ['name' => $genericName])
                : null;
            $company = Company::firstOrCreate(['slug' => Str::slug($companyName)], ['name' => $companyName, 'is_active' => true]);

            $slug = Str::slug(implode(' ', array_filter([$brand, $strength, $form])));

            $medicine = Medicine::updateOrCreate(['slug' => $slug], [
                'generic_id' => $generic?->id,
                'company_id' => $company->id,
                'category_id' => $categories[$categorySlug] ?? null,
                'name' => $brand,
                'strength' => $strength,
                'dosage_form' => $form,
                'unit_name' => $unit,
                'rx_required' => $rx,
                'is_cold_chain' => $cold,
                'discount_percent' => $discount,
                'reorder_level' => $units * ($units > 1 ? 20 : 5),
                'is_featured' => in_array($brand, $featured, true) && $form !== 'Suspension',
                'is_active' => true,
                'sold_count' => $sold,
                // Sample per-unit MRP, used by StockSeeder when it creates batches.
                'description' => null,
            ]);
            $sold -= 15;

            $medicine->packSizes()->delete();
            $unitLabel = $unit === 'cap' ? 'caps' : ($unit === 'tab' ? 'tabs' : $unit);
            $medicine->packSizes()->create([
                'name' => $units > 1 ? "1 $packShort ($units $unitLabel)" : "1 $packShort",
                'short_name' => $packShort,
                'units' => $units,
                'is_default' => true,
                'sort_order' => 0,
            ]);
            if ($boxPacks) {
                $medicine->packSizes()->create([
                    'name' => "Full box ($boxPacks {$packShort}s)",
                    'short_name' => 'box',
                    'units' => $units * $boxPacks,
                    'extra_discount_percent' => 2,
                    'is_default' => false,
                    'sort_order' => 1,
                ]);
            }

            // Remember the sample pack MRP for the stock seeder.
            StockSeeder::$sampleUnitMrp[$medicine->id] = round($packMrp / $units, 4);
        }

        Company::whereIn('slug', ['square', 'beximco', 'incepta', 'renata', 'acme', 'eskayef', 'healthcare-pharmaceuticals', 'aristopharma', 'drug-international', 'aci'])
            ->update(['is_featured' => true]);
    }
}
