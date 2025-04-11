<?php

use App\Http\Controllers\DomainsController;
use App\Http\Controllers\ProfileController;
use Illuminate\Foundation\Application;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;
use App\Models\Domains;

Route::get('/', function () {
  return Inertia::render('Welcome', [
      'canLogin' => Route::has('login'),
      'canRegister' => Route::has('register'),
      'laravelVersion' => Application::VERSION,
      'phpVersion' => PHP_VERSION,
  ]);
})->name('welcome');

Route::get('/domains/{fqdn?}', function ($fqdn = NULL) {
  if($fqdn != NULL) {
    $item = Domains::where('fqdn', $fqdn)->first();
  }

  $domains = Domains::all()->toArray();
  return Inertia::render('Domains/Domains', [
      'canLogin' => Route::has('login'),
      'canRegister' => Route::has('register'),
      'domains' => $domains,
      'item' => isset($item) ? $item : null
  ]);
})->name('domains');

Route::patch('/domains/{fqdn}', [DomainsController::class, 'update'])->name('domains.update');
Route::delete('/domains/{id}', [DomainsController::class, 'destroy'])->name('domains.delete');

Route::get('/hosting', function () {
  return Inertia::render('Welcome', [
      'canLogin' => Route::has('login'),
      'canRegister' => Route::has('register'),
      'laravelVersion' => Application::VERSION,
      'phpVersion' => PHP_VERSION,
  ]);
})->name('hosting');

Route::get('/settings', function () {
  return Inertia::render('Welcome', [
      'canLogin' => Route::has('login'),
      'canRegister' => Route::has('register'),
      'laravelVersion' => Application::VERSION,
      'phpVersion' => PHP_VERSION,
  ]);
})->name('settings');

Route::get('/dashboard', function () {
    return Inertia::render('Dashboard');
})->middleware(['auth', 'verified'])->name('dashboard');

Route::middleware('auth')->group(function () {
    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');
});

Route::get('/status', [DomainsController::class,'status'])->name('status');

require __DIR__.'/auth.php';
