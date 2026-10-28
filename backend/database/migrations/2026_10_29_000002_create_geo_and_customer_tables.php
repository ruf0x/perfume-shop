<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // id is the official wilaya code (1..58), not auto-incremented.
        Schema::create('wilayas', function (Blueprint $table) {
            $table->unsignedSmallInteger('id')->primary();
            $table->char('code', 2)->unique();
            $table->string('name', 80);
            $table->string('name_ar', 80)->nullable();
            $table->unsignedInteger('home_fee')->default(0);
            $table->unsignedInteger('desk_fee')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('communes', function (Blueprint $table) {
            $table->id();
            $table->unsignedSmallInteger('wilaya_id');
            $table->foreign('wilaya_id')->references('id')->on('wilayas')->cascadeOnDelete();
            $table->string('name', 100);
            $table->string('name_ar', 100)->nullable();
            $table->string('postal_code', 10)->nullable();
            $table->timestamps();
        });

        Schema::create('customers', function (Blueprint $table) {
            $table->id();
            $table->string('phone', 15)->unique();
            $table->string('first_name', 80);
            $table->string('last_name', 80);
            $table->unsignedSmallInteger('wilaya_id')->nullable();
            $table->foreign('wilaya_id')->references('id')->on('wilayas')->nullOnDelete();
            $table->foreignId('commune_id')->nullable()->constrained()->nullOnDelete();
            $table->string('address')->nullable();
            $table->unsignedInteger('orders_count')->default(0);
            $table->unsignedInteger('delivered_count')->default(0);
            $table->unsignedInteger('cancelled_count')->default(0);
            $table->unsignedInteger('returned_count')->default(0);
            $table->boolean('is_blacklisted')->default(false);
            $table->text('note')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customers');
        Schema::dropIfExists('communes');
        Schema::dropIfExists('wilayas');
    }
};
