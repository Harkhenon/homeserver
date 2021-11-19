<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application. These
| routes are loaded by the RouteServiceProvider within a group which
| is assigned the "api" middleware group. Enjoy building your API!
|
*/

Route::middleware('auth:sanctum')->get('/user', function (Request $request) {
    return $request->user();
});

Route::post('/user/login', [\App\Http\Controllers\UserController::class, 'login'])->name('user.login');
Route::get('/bank/accounts', [\App\Http\Controllers\BankController::class, 'index'])->name('bank.accounts');
Route::get('/bank/account/{id}', [\App\Http\Controllers\BankController::class, 'getCurrentAccount'])->name('bank.current_account');
Route::post('/bank/account', [\App\Http\Controllers\BankController::class, 'createAccount'])->name('bank.create_account');
Route::patch('/bank/account/{id}', [\App\Http\Controllers\BankController::class, 'updateAccount'])->name('bank.update_account');
Route::delete('/bank/account/{id}', [\App\Http\Controllers\BankController::class, 'deleteAccount'])->name('bank.delete_account');
Route::post('/bank/account/operation', [\App\Http\Controllers\BankController::class, 'createOperation'])->name('bank.create_operation');
Route::patch('/bank/account/operation/{id}', [\App\Http\Controllers\BankController::class, 'updateOperation'])->name('bank.update_operation');
Route::delete('/bank/account/operation/{id}', [\App\Http\Controllers\BankController::class, 'deleteOperation'])->name('bank.delete_operation');