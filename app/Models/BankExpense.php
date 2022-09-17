<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Models\BankAccount;

class BankExpense extends Model
{
    use HasFactory;

    public function account() {
        return $this->belongsTo(BankAccount::class, 'bank_accounts_id', 'id', "belongsTo");
    }
}
