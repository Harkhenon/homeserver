<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class Domains extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('domains', function(Blueprint $table) {
            $table->increments('id');
            $table->string('fqdn')->unique();
            $table->integer('zone_id')->unsigned()->nullable()->default(NULL);
            $table->string('ns1')->default();
            $table->string('ns2')->default();
            $table->boolean('default')->default(0);
            $table->timestamps();
        });

        Schema::create('zones', function(Blueprint $table) {
            $table->increments('id');
            $table->integer('domain_id')->unsigned();
            $table->text('zone');
            $table->timestamps();
        });

        Schema::table('domains', function(Blueprint $table) {
            $table->foreign('zone_id')->references('id')->on('zones');
        });

        Schema::table('zones', function(Blueprint $table) {
            $table->foreign('domain_id')->references('id')->on('domains');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::dropIfExists('domains');
        Schema::dropIfExists('zones');
    }
}
