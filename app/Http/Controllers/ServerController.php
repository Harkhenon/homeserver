<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class ServerController extends Controller
{
    public function getLoadJson(Request $request) {

        $serverLoad = file_get_contents("C:/laragon/www/homeserver-daemon/machine");

        return response()->json(
            json_decode($serverLoad),
            200,
            [],
            JSON_PRETTY_PRINT
        );
    }
}
