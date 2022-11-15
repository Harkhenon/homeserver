<?php

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
|
| Here is where you can register web routes for your application. These
| routes are loaded by the RouteServiceProvider within a group which
| contains the "web" middleware group. Now create something great!
|
*/

if(env('APP_ENV') === 'production') {
    Route::view('/{path?}', 'home')
    ->where('path', '.*')
    ->name('react');
} else {
    Route::view('/{path?}', 'homedev')
    ->where('path', '.*')
    ->name('react');
}


