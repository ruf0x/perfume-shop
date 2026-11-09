<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A movement can be corrected (edited or cancelled) by hand. Nothing is erased: a cancelled movement keeps its
 * row (`cancelled_at`) and its reversal is a new movement. `open_bottle_id` says which opened bottle a loss came from.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_movements', function (Blueprint $table) {
            $table->foreignId('open_bottle_id')->nullable()->after('order_id')->constrained('open_bottles')->nullOnDelete();
            $table->timestamp('cancelled_at')->nullable()->after('note');
        });
    }

    public function down(): void
    {
        Schema::table('stock_movements', function (Blueprint $table) {
            $table->dropForeign(['open_bottle_id']);
            $table->dropColumn(['open_bottle_id', 'cancelled_at']);
        });
    }
};
