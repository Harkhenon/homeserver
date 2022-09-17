<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class Bank extends Migration
{
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('bank_account_types', function (Blueprint $table) {
            $table->increments('id');
            $table->text('name');
            $table->timestamps();
        });

        Schema::create('bank_accounts', function(Blueprint $table) {
            $table->increments('id');
            $table->text('name');
            $table->integer('bank_account_type_id')->unsigned();
            $table->foreign('bank_account_type_id')->references('id')->on('bank_account_types');
            $table->timestamps();
        });

        Schema::create('bank_incomings', function(Blueprint $table) {
            $table->increments('id');
            $table->float('amount');
            $table->text('name');
            $table->text('comment')->nullable();
            $table->integer('bank_account_id')->unsigned();
            $table->foreign('bank_account_id')->references('id')->on('bank_accounts');
            $table->timestamps();
        });

        Schema::create('bank_expenses', function(Blueprint $table) {
            $table->increments('id');
            $table->float('amount');
            $table->text('name');
            $table->text('comment')->nullable();
            $table->integer('bank_account_id')->unsigned();
            $table->foreign('bank_account_id')->references('id')->on('bank_accounts');
            $table->timestamps();
        });

        Schema::create('bank_regular_fees', function(Blueprint $table) {
            $table->increments('id');
            $table->float('amount');
            $table->text('name');
            $table->text('comment')->nullable();
            $table->integer('bank_account_id')->unsigned();
            $table->foreign('bank_account_id')->references('id')->on('bank_accounts');
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
        Schema::dropIfExists('bank_incomings');
        Schema::dropIfExists('bank_expenses');
        Schema::dropIfExists('bank_regular_fees');
        Schema::dropIfExists('bank_accounts');
        Schema::dropIfExists('bank_account_type');
    }
}
