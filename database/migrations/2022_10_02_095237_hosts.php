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
            $table->integer('domains_id')->unsigned()->nullable()->default(NULL);
            $table->integer('node_port')->nullable();
            $table->string('php_user')->default('homeserver')->nullable();
            $table->boolean('ftp_enabled')->default(1);
            $table->boolean('ssh_enabled')->default(0);
            $table->integer('disk_space')->default(0);
            $table->integer('plan_id')->unsigned()->nullable()->default(NULL);
            $table->string('root_dir')->nullable()->unique();
            $table->timestamps();
        });

        Schema::table('hosts', function(Blueprint $table) {
            $table->foreign('plan_id')->references('id')->on('plans');
            $table->foreign('domains_id')->references('id')->on('domains');
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
