<?php


use App\Models\User;
use Laravel\Passport\Client;
use Laravel\Passport\Passport;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Tests\TestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\Fluent\AssertableJson;

uses(TestCase::class, DatabaseMigrations::class, RefreshDatabase::class);



it('does not fetch resource due to missing api token', function () {
    $response = $this->withHeaders([
        'Accept'       => 'application/json'
    ])->get('/api/zone');
    $response->assertStatus(401);
});

it('fetch zone entries [GET] with json response and check response type', function () {

    TestCase::initDatabase();

    Passport::actingAs(
        User::factory()->make()
    );

    $response = $this->withHeaders([
        'Accept' => 'application/json'
    ])
        ->json('GET', '/api/zone')
        ->assertStatus(200)
        ->assertJsonStructure([
            'success',
            'data' => [
                '*' => [
                    'id',
                    'sub',
                    'type',
                    'ip_or_fqdn',
                    'created_at',
                    'updated_at'
                ]
                ],
            'message'
        ])
        ->assertJson(function (AssertableJson $json) {
            $json->whereType('success', 'boolean')
                 ->whereType('data', 'array')
                 ->whereType('data.0.id', 'integer')
                 ->whereType('data.0.sub', 'string')
                 ->whereType('data.0.type', 'string')
                 ->whereType('data.0.ip_or_fqdn', 'string')
                 ->whereType('data.0.created_at', 'string')
                 ->whereType('data.0.updated_at', 'string')
                 ->whereType('message', 'string');
    });

    TestCase::resetDatabase();
});

it('fetch zone entry [GET] and verify if data array is fine', function () {

    TestCase::initDatabase();

    Passport::actingAs(
        User::factory()->make()
    );

    $response = $this->withHeaders([
        'Accept' => 'application/json'
    ])
        ->json('GET', '/api/zone')
        ->assertStatus(200);

    $jsonData = json_decode($response->content());

    $result = $jsonData->data[0];

    var_dump($result);

    TestCase::resetDatabase();

});