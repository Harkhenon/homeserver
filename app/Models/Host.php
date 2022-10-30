<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Models\Plan;

class Host extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     *
     * @var string[]
     */
    protected $fillable = [
        'fqdn',
        'node_port',
        'php_user',
        'ftp_enabled',
        'ssh_enabled',
        'root_dir',
        'disk_space',
        'plans_id'
    ];

    protected $with = ['plan'];

    public function plan() {
        return $this->belongsTo(Plan::class);
    }
}
