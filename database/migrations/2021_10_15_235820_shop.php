<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class Shop extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('shop_lists', function(Blueprint $table) {
            $table->increments('id');
            $table->text('title');
            $table->text('comment');
            $table->timestamps();
        });

        Schema::create('shop_items', function (Blueprint $table) {
            $table->increments('id');
            $table->text('name');
            $table->integer('amount');
            $table->integer('list_id')->unsigned();
            $table->foreign('list_id')->references('id')->on('shop_lists');
            $table->timestamps();
        });

        Schema::create('shop_shops', function (Blueprint $table) {
            $table->increments('id');
            $table->text('name');
            $table->integer('item_id')->unsigned();
            $table->foreign('item_id')->references('id')->on('shop_items');
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
        Schema::dropIfExists('shop.lists');
        Schema::dropIfExists('shop.items');
        Schema::dropIfExists('shop.shops');
    }
}
