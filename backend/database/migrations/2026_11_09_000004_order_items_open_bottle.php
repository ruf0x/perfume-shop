<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** A decant line sold at the caisse can name the opened bottle it is poured from (null = the newest one). */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('order_items', function (Blueprint $table) {
            $table->foreignId('open_bottle_id')->nullable()->after('variant_id')->constrained('open_bottles')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('order_items', function (Blueprint $table) {
            $table->dropForeign(['open_bottle_id']);
            $table->dropColumn('open_bottle_id');
        });
    }
};
