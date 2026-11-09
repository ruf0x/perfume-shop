<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Each bottle opened for decanting (a 100 ml flacon, a 50 ml flacon) is followed on its own: what was decanted from
 * it, what was lost, what is left. The decant pool stays the total (products.stock_ml); these rows say which bottle
 * the ml came from. ml that were received in bulk and not put in a bottle are the difference.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('open_bottles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('variant_id')->nullable()->constrained('product_variants')->nullOnDelete();
            $table->string('label', 60);
            $table->unsignedInteger('capacity_ml');
            $table->unsignedInteger('remaining_ml');
            $table->unsignedInteger('decanted_ml')->default(0);
            $table->unsignedInteger('lost_ml')->default(0);
            $table->integer('adjusted_ml')->default(0);
            $table->timestamp('opened_at')->nullable();
            $table->timestamps();

            $table->index(['product_id', 'remaining_ml']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('open_bottles');
    }
};
