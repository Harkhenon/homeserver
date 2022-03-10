<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Models\Domains;

class Zones extends Model
{
    use HasFactory;

    public function domain() {
        return $this->hasOne(Domain::class);
    }
}
