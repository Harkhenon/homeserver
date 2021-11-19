<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Models\BankAccount;

class BankAccountType extends Model
{
    use HasFactory;

    public function account() {
        return $this->hasMany(BankAccount::class);
    }
}
