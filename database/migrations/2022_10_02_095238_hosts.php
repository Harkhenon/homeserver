<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class Hosts extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('hosts', function(Blueprint $table) {
            $table->increments('id');
            $table->string('domain')->unique();
            $table->string('ns1');
            $table->string('ns2')->nullable();
            $table->boolean('default')->default(0);
            $table->text('zone')->nullable();
            $table->integer('node_port')->nullable();
            $table->string('php_user')->default('homeserver')->nullable();
            $table->boolean('ftp_enabled')->default(1);
            $table->boolean('ssh_enabled')->default(0);
            $table->integer('disk_space')->default(0);
            $table->string('root_dir')->nullable()->unique();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::dropIfExists('hosts');
    }
}
