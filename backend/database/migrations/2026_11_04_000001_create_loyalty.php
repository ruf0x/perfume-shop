<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // One gift earned every N perfumes bought (over any number of orders).
        Schema::create('loyalty_rewards', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('items_count');
            // Average sale price of the perfumes that earned it: the value the gift should be about.
            $table->unsignedInteger('average_price');
            $table->timestamp('given_at')->nullable();
            $table->foreignId('gift_variant_id')->nullable()->constrained('product_variants')->nullOnDelete();
            $table->string('gift_name')->nullable();
            // Catalogue price of the gift that was given.
            $table->unsignedInteger('gift_value')->nullable();
            $table->foreignId('gift_order_id')->nullable()->constrained('orders')->nullOnDelete();
            $table->foreignId('given_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['customer_id', 'given_at']);
        });

        // One row per perfume bought (a line of 3 makes 3 rows), at the price it was sold for.
        Schema::create('loyalty_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->string('product_name');
            $table->unsignedInteger('unit_price');
            $table->foreignId('reward_id')->nullable()->constrained('loyalty_rewards')->nullOnDelete();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['customer_id', 'reward_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('loyalty_entries');
        Schema::dropIfExists('loyalty_rewards');
    }
};
