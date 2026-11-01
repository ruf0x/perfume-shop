<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The empty bottles the shop pours decants into (10 ml, 20 ml...): how many are left, per size.
        Schema::create('bottle_sizes', function (Blueprint $table) {
            $table->id();
            $table->unsignedSmallInteger('ml')->unique();
            $table->integer('qty')->default(0);
            $table->timestamps();
        });

        // Every change of that stock (the source of truth, like stock_movements). `total_cost` is what an entry cost.
        Schema::create('bottle_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bottle_size_id')->constrained()->restrictOnDelete();
            $table->string('type', 30);
            $table->integer('qty_change');
            $table->unsignedInteger('total_cost')->nullable();
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->string('order_reference', 20)->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('note')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['bottle_size_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bottle_movements');
        Schema::dropIfExists('bottle_sizes');
    }
};
