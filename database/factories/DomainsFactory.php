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
            'zones_id' => 1,
            'default' => 1,
            'ns1' => 'ns1.isodev.ovh',
            'ns2' => 'ns2.isodev.ovh',
        ];
    }
}
