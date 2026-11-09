<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // What the shop paid for one sellable unit (a decant size, a piece, a shade...). Null = not entered yet.
        Schema::table('product_variants', function (Blueprint $table) {
            $table->unsignedInteger('cost_price')->nullable()->after('compare_at_price');
        });

        // The cost at the time of the sale, so that a later change never rewrites past profits.
        Schema::table('order_items', function (Blueprint $table) {
            $table->unsignedInteger('unit_cost')->nullable()->after('list_price');
        });
    }

    public function down(): void
    {
        Schema::table('order_items', fn (Blueprint $table) => $table->dropColumn('unit_cost'));
        Schema::table('product_variants', fn (Blueprint $table) => $table->dropColumn('cost_price'));
    }
};
