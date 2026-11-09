<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** A brand belongs to the families (categories) its products are in, not only to the product type. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('brand_perfume_type', function (Blueprint $table) {
            $table->foreignId('brand_id')->constrained()->cascadeOnDelete();
            $table->foreignId('perfume_type_id')->constrained('perfume_types')->cascadeOnDelete();
            $table->primary(['brand_id', 'perfume_type_id']);
        });

        DB::statement('INSERT INTO brand_perfume_type (brand_id, perfume_type_id) SELECT DISTINCT brand_id, perfume_type_id FROM products WHERE brand_id IS NOT NULL AND perfume_type_id IS NOT NULL');
    }

    public function down(): void
    {
        Schema::dropIfExists('brand_perfume_type');
    }
};
