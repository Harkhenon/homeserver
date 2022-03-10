<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

class DomainsFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array
     */
    public function definition()
    {
        return [
            'fqdn' => $this->faker->domainName(),
            'zone_id' => $this->faker->numberBetween(1, 3),
            'ns1' => 'ns1.isodev.ovh',
            'ns2' => 'ns2.isodev.ovh',
        ];
    }
}
