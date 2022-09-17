<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

class ServerCharge extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'server:cpu';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Get CPU load';

    /**
     * Create a new command instance.
     *
     * @return void
     */
    public function __construct()
    {
        parent::__construct();
    }

    /**
     * Execute the console command.
     *
     * @return int
     */
    public function handle()
    {
        $wmi = new \COM('WinMgmts:\\\\.');
        $cpus = $wmi->InstancesOf('Win32_Processor');
        $cpuload = 0;
        $cpu_count = 0;
        foreach ($cpus as $key => $cpu) {
            $cpuload += $cpu->LoadPercentage;
            $cpu_count++;
        }

        echo $cpuload;
    }
}
