<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Models\Zones;
use App\Models\Host;

class Domains extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     *
     * @var string[]
     */
    protected $fillable = [
        'fqdn',
        'ns1',
        'ns2',
    ];

    protected $with = ['zones', 'host'];

    public function zones() {
        return $this->hasMany(Zones::class);
    }

    public function host() {
        return $this->hasOne(Host::class);
    }
}
