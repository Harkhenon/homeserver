<?php

namespace Database\Factories;

use App\Models\BankRegularFee;
use Illuminate\Database\Eloquent\Factories\Factory;

class BankRegularFeeFactory extends Factory
{
    /**
     * The name of the factory's corresponding model.
     *
     * @var string
     */
    protected $model = BankRegularFee::class;

    /**
     * Define the model's default state.
     *
     * @return array
     */
    public function definition()
    {
        return [
            'amount' => $this->faker->randomFloat(2, 0, 1000),
            'name'    => $this->faker->word(),
            'comment' => $this->faker->sentence(),
            'bank_account_id' => $this->faker->numberBetween(1, 10),
        ];
    }
}
