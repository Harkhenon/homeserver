<?php

namespace App\Http\Controllers\API;

use Illuminate\Http\Request;

class ServerController extends BaseController
{
  
    public function getServerConfigInformations() {
        exec("hostname -f", $hostname);
        exec("hostname -s", $shortHostname);
        exec("hostname -i", $hostnameIp);

        
        $config["hostname"] = $hostname;
        $config["shortHostname"] = $shortHostname;
        $config["hostnameIp"] = $hostnameIp;
        

        return $config;
    }

    // Get CPU usage with top linux command for all cores and return an array
    public function getCPUUsageLinux() {
        $top = shell_exec('top -b -n1');
        $top = (string)trim($top);
        $top = explode("\n", $top);
        $top = array_filter($top);
        $top = array_merge($top);
        $cpu = [];
        // Get only CPU line
        foreach ($top as $line) {
            if (preg_match('/^%Cpu/', $line)) {
                $line = preg_replace('/\s+/', ' ', $line);
                $line = explode(" ", $line);
                $cpu['user'] = $line[1];
                $cpu['nice'] = $line[3];
                $cpu['sys'] = $line[5];
                $cpu['idle'] = $line[7];
            }
        }
        return $cpu;
    }

    public function getRAMUsageLinux() {
        $free = shell_exec('free');
        $free = (string)trim($free);
        $free_arr = explode("\n", $free);
        $mem = explode(" ", $free_arr[1]);
        $mem = array_filter($mem);
        $mem = array_merge($mem);
        $ram = [];
        // Convert next line from megabytes to gigaoctets  
        $ram['total'] = round($mem[1] / 1024 / 1024, 2, PHP_ROUND_HALF_UP);
        $ram['used'] = round($mem[2] / 1024 / 1024, 2, PHP_ROUND_HALF_UP);
        $ram['free'] = $ram['total'] - $ram['used'];
        return $ram;
    }

    public function getDiskUsageLinux() {
        $df = shell_exec('df -h');
        $df = (string)trim($df);
        $df = explode("\n", $df);
        $df = array_filter($df);
        $df = array_merge($df);
        $disk = [];
        // Get only / mounted_on
        foreach ($df as $line) {
            $line = preg_replace('/\s+/', ' ', $line);
            $line = explode(" ", $line);
            if ($line[5] === "/") {
                $disk[] = [
                    "filesystem" => $line[0],
                    "size" => $line[1],
                    "used" => $line[2],
                    "available" => $line[3],
                    "percent" => $line[4],
                    "mounted_on" => $line[5]
                ];
            }
        }
        return $disk;
    }

    // Get OS with version and kernel
    public function getOSInformations() {
        $os = $this->getOSInformationsLinux();
        return response()->json($os, 200, [], JSON_PRETTY_PRINT);
    }

    public function getOSInformationsLinux() {
        $os = [];
        $os['os'] = php_uname('s');
        $os['version'] = php_uname('r');
        $os['kernel'] = php_uname('v');
        $os['host'] = php_uname('n');
        $os['distro'] = preg_replace('/PRETTY_NAME="(.+)"/','$1', exec('cat /etc/*-release | grep PRETTY_NAME'));
        return $os;
    }

    // Compile precedent informations into a JSON object

    public function getServerInformations() {
        $os = strtoupper(substr(PHP_OS, 0, 3));

        $cpu = $this->getCPUUsageLinux();
        $ram = $this->getRAMUsageLinux();
        $disk = $this->getDiskUsageLinux();
        $os = $this->getOSInformationsLinux();
        $config = $this->getServerConfigInformations();
        
        $json = [
            "config" => $config,
            "cpu" => $cpu,
            "ram" => $ram,
            "disk" => $disk,
            "os" => $os
        ];
        return response()->json($json, 200, [], JSON_PRETTY_PRINT);
    }

}
