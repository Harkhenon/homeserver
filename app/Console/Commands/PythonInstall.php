<?php

namespace App\Console\Commands;
use Illuminate\Console\Command;

class PythonInstall extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'python:install';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Installs python venv for Homeserver according to OS';

    /**
     * Execute the console command.
     */
    public function handle()
    {
      $this->line("Installing Python venv...");

      $path = base_path()."/app/Server/Python";

      @mkdir($path);

      $os = strtolower(PHP_OS);

      if(preg_match("/win[nt]?/", $os) === 1) {
        $path = $path."/windows/";
        $command = 'python';
;      } else {
        $path = $path."/linux/";
        $command = 'python3';
      }

      @mkdir($path);

      exec($command.' -m venv '.$path, $output, $return_code);

      if ($return_code === 0) {
        $this->info("Python venv successfuly installed\n");
      } else {
        $this->warn("Problem while installing Python venv\n");
        exit();
      }

      $this->line("Upgrading pip...");

      exec($path."Scripts/activate && ".$command." -m pip install --upgrade pip", $output, $return_code);

      if ($return_code === 0) {
        $this->info("pip has been upgraded\n");
      } else {
        $this->warn("Problem while upgrading pip\n");
        exit();
      }

      $this->line('Installing pip packages (Asyncio)');

      exec($path."Scripts/activate && ".$command." -m pip install asyncio", $output, $return_code);

      if ($return_code === 0) {
        $this->info("Packages successfuly installed\n");
      } else {
        $this->warn("Problem while installing Packages\n");
        exit();
      }
    }
}
