<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The owner put this order aside until a delivery of stock arrives.
        Schema::table('orders', function (Blueprint $table) {
            $table->boolean('awaiting_stock')->default(false)->after('admin_note');
        });
    }

    public function down(): void
    {
        Schema::table('orders', fn (Blueprint $table) => $table->dropColumn('awaiting_stock'));
    }
};
