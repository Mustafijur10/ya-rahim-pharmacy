<?php

namespace Database\Factories;

use App\Models\Customer;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Customer>
 */
class CustomerFactory extends Factory
{
    public function definition(): array
    {
        return [
            'name' => fake()->name(),
            'phone' => '01'.fake()->numberBetween(3, 9).fake()->unique()->numerify('########'),
            'email' => fake()->optional(0.3)->safeEmail(),
        ];
    }
}
