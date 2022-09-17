<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Models\BankAccountType,
    App\Models\BankExpense,
    App\Models\BankIncoming,
    App\Models\BankRegularFee;

class BankAccount extends Model
{
    use HasFactory;

    public function type() {
        return $this->belongsTo(BankAccountType::class, 'bank_account_type_id');
    }

    public function expenses() {
        return $this->hasMany(BankExpense::class);
    }

    public function incomings() {
        return $this->hasMany(BankIncoming::class);
    }

    public function regularFees() {
        return $this->hasMany(BankRegularFee::class);
    }
}
