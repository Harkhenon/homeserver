<?php

namespace Database\Factories;

use App\Models\BankAccountType;
use Illuminate\Database\Eloquent\Factories\Factory;

class BankAccountTypeFactory extends Factory
{
    /**
     * The name of the factory's corresponding model.
     *
     * @var string
     */
    protected $model = BankAccountType::class;

    /**
     * Define the model's default state.
     *
     * @return array
     */
    public function definition()
    {
        return [
            'name' => $this->faker->word(),
        ];
    }
}
