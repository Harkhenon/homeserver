<?php

namespace App\Http\Controllers\API;

use Illuminate\Http\Request;

class ServerController extends BaseController
{
    public function getLoadJson(Request $request) {

        exec("lsb_release -d", $os);
        exec("df --output=pcent / | grep -v Use", $disk);
        exec("free | grep Mem | awk '{print $3/$2 * 100.0}'", $ram);
        exec("cat /proc/stat | grep ^cpu[^0-9] | tail -1| awk '{print ($5*100)/($2+$3+$4+$5+$6+$7+$8+$9+$10)}'|awk '{print 100-$1}'", $cpu);
        
        $os = explode(":", $os[0]);
        
        $disk = preg_replace("/([0-9][0-9]?[0-9]?)%/", "$1", trim($disk[0]));

        $json = [
            "cpuUsage" => $cpu[0],
            "ramUsage" => $ram[0],
            "diskUsage" => $disk,
            "os" => trim($os[1])
        ];

        return response()->json($json, 200, [], JSON_PRETTY_PRINT);
    }

    public function getServerConfigInformations() {
        exec("hostname -f", $hostname);
        exec("hostname -s", $shortHostname);
        exec("hostname -i", $hostnameIp);

        $json = [
            "hostname" => $hostname,
            "shortHostname" => $shortHostname,
            "hostnameIp" => $hostnameIp
        ];

        return response()->json($json, 200, [], JSON_PRETTY_PRINT);
    }
}
