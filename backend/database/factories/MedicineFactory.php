<?php

namespace Database\Factories;

use App\Models\Medicine;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Medicine>
 */
class MedicineFactory extends Factory
{
    public function definition(): array
    {
        $name = ucfirst(fake()->unique()->lexify('????ex'));
        $strength = fake()->randomElement(['5 mg', '10 mg', '20 mg', '250 mg', '500 mg']);

        return [
            'name' => $name,
            'strength' => $strength,
            'dosage_form' => fake()->randomElement(['Tablet', 'Capsule']),
            'slug' => Str::slug("$name $strength").'-'.Str::lower(Str::random(4)),
            'unit_name' => 'tab',
            'rx_required' => fake()->boolean(40),
            'discount_percent' => 5,
            'reorder_level' => 50,
            'is_active' => true,
        ];
    }

    public function rx(): static
    {
        return $this->state(fn () => ['rx_required' => true]);
    }

    public function otc(): static
    {
        return $this->state(fn () => ['rx_required' => false]);
    }
}
