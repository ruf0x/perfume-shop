<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Two product types can each have an "Accessoires" or a "Homme" category: names and slugs are unique per type. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('perfume_types', function (Blueprint $table) {
            $table->dropUnique(['name']);
            $table->dropUnique(['slug']);
            $table->unique(['product_type_id', 'name']);
            $table->unique(['product_type_id', 'slug']);
        });
    }

    public function down(): void
    {
        Schema::table('perfume_types', function (Blueprint $table) {
            // The foreign key leans on the composite indexes: give it its own index before dropping them.
            $table->index('product_type_id', 'perfume_types_product_type_id_index');
        });

        Schema::table('perfume_types', function (Blueprint $table) {
            $table->dropUnique(['product_type_id', 'name']);
            $table->dropUnique(['product_type_id', 'slug']);
            $table->unique('name');
            $table->unique('slug');
        });
    }
};
