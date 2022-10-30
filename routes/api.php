<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

use App\Http\Controllers\API\BankAccountController;
use App\Http\Controllers\API\UserController;
use App\Http\Controllers\API\ServerController;
use App\Http\Controllers\API\RegisterController;
use App\Http\Controllers\API\DomainsController;
use App\Http\Controllers\API\ZoneController;
use App\Http\Controllers\API\HostController;

use App\Models\Domains;
use App\Models\Zones;

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

Route::get('/create-personal-token', function () {

    $user = new App\Models\User();

    $token = $user->createToken('Harkhenon')->accessToken;
    echo $token;
    
    });

// Route::post('/user/login', [\App\Http\Controllers\UserController::class, 'login'])->name('user.login');
// Route::get('/bank/accounts/types', [\App\Http\Controllers\BankController::class, 'getAccountTypes'])->name('bank.account_type');
// Route::get('/bank/accounts', [\App\Http\Controllers\BankController::class, 'index'])->name('bank.accounts');
// Route::post('/bank/account', [\App\Http\Controllers\BankController::class, 'createAccount'])->name('bank.create_account');
// Route::get('/bank/account/{id}', [\App\Http\Controllers\BankController::class, 'getCurrentAccount'])->name('bank.current_account');
// Route::patch('/bank/account/{id}', [\App\Http\Controllers\BankController::class, 'updateAccount'])->name('bank.update_account');
// Route::delete('/bank/account/{id}', [\App\Http\Controllers\BankController::class, 'deleteAccount'])->name('bank.delete_account');
// Route::post('/bank/account/operation', [\App\Http\Controllers\BankController::class, 'createOperation'])->name('bank.create_operation');
// Route::patch('/bank/account/operation/{id}', [\App\Http\Controllers\BankController::class, 'updateOperation'])->name('bank.update_operation');
// Route::delete('/bank/account/operation/{id}', [\App\Http\Controllers\BankController::class, 'deleteOperation'])->name('bank.delete_operation');

Route::middleware('auth:api')->group( function () {
    Route::get('check', [RegisterController::class, 'check']);
    Route::get('/server/informations', [ServerController::class, "getLoadJson"])->name('server.load.json');
    Route::get('/server/config', [ServerController::class, 'getServerConfigInformations'])->name('server.configInformations');
    Route::resource('bank_accounts', BankAccountController::class);
    Route::resource('user', UserController::class);
    Route::resource('domains', DomainsController::class);
    Route::resource('zone', ZoneController::class);
});
Route::resource('host', HostController::class);
// Route::get('/default-domain', [DomainsController::class, 'getDefaultDomain'])->name('domain.getDefaultDomain');
// Route::post('register', [RegisterController::class, 'register']);

Route::post('login', [RegisterController::class, 'login']);