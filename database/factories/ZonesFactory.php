<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

class ZonesFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array
     */
    public function definition()
    {
        return [
            'domains_id' => 1,
            'sub' => "",
            'type' => "",
            'ip_or_fqdn' => "",
        ];
    }
}
