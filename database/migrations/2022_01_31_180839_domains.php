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
            $table->integer('zones_id')->unsigned()->nullable()->default(NULL);
            $table->string('ns1')->default();
            $table->string('ns2')->default();
            $table->boolean('default')->default(0);
            $table->timestamps();
        });

        Schema::create('zones', function(Blueprint $table) {
            $table->increments('id');
            $table->integer('domains_id')->unsigned();
            $table->text('sub');
            $table->text('type');
            $table->text('ip_or_fqdn');
            $table->timestamps();
        });

        Schema::table('domains', function(Blueprint $table) {
            $table->foreign('zones_id')->references('id')->on('zones');
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
