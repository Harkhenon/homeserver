<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

/*
|--------------------------------------------------------------------------
| Console Routes
|--------------------------------------------------------------------------
|
| This file is where you may define all of your Closure based console
| commands. Each Closure is bound to a command instance allowing a
| simple approach to interacting with each command's IO methods.
|
*/

Artisan::command('clear:all:caches', function () {
    Artisan::call('view:clear');
    Artisan::call('route:clear');
    Artisan::call('config:clear');
    Artisan::call('cache:clear');
    Artisan::call('clear-compiled');
})->purpose('Clear all caches');

Artisan::command('db:reset', function () {
    Artisan::call('migrate:fresh');
    Artisan::call('db:seed');
    Artisan::call('passport:install --force');
    Artisan::call('clear:all:caches');
})->purpose('Reset DB and run migrations and DB seed, then clear all caches');

Artisan::command('homeserver:install:dev', function () {
    Artisan::call('migrate:fresh');
    Artisan::call('db:seed');
    Artisan::call('passport:install --force');
    Artisan::call('clear:all:caches');
})->purpose('Install Homeserver database and launch it! (dev)');

Artisan::command('homeserver:install:prod', function () {
    Artisan::call('migrate');
    Artisan::call('db:seed');
    Artisan::call('passport:install --force');
    Artisan::call('clear:all:caches');
})->purpose('Install Homeserver database and launch it!');
