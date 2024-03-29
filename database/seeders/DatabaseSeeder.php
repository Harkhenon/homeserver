<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     *
     * @return void
     */
    public function run()
    {
        \App\Models\User::factory(1)->create();
        // \App\Models\BankAccountType::factory()->create(['name' => 'livreta']);
        // \App\Models\BankAccountType::factory()->create(['name' => 'ccp']);
        // \App\Models\BankAccountType::factory()->create(['name' => 'assurancevie']);
        // \App\Models\BankAccount::factory(10)->create();
        // \App\Models\BankIncoming::factory(200)->create();
        // \App\Models\BankExpense::factory(200)->create();
        // \App\Models\BankRegularFee::factory(40)->create();
        \App\Models\Zones::factory()->create();
        \App\Models\Domains::factory()->create(['fqdn' => 'isodev.ovh']);
        //\App\Models\Packages::factory(5)->create();
        \App\Models\Plan::factory()->create();
    }
}
