<?php

namespace App\Server;

use Error;
use Illuminate\Support\Facades\Auth;

class MakeCommand {

    public function __construct() {
        if(!Auth::check()) {
            return new Error("You must be authenticated", 401);
        }
    }

    public function call($command) {

    }
}
