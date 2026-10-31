<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Cosmetics (nail kits, shower gel, make-up, deodorants...) live in the same catalogue as perfumes.
 *  - products.kind gets a third value, `cosmetic`;
 *  - the "famille" table also holds the cosmetic categories, told apart by its new `kind` column.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE products MODIFY kind ENUM('perfume','cosmetic','pack') NOT NULL DEFAULT 'perfume'");

        Schema::table('perfume_types', function (Blueprint $table) {
            $table->enum('kind', ['perfume', 'cosmetic'])->default('perfume')->after('slug');
            $table->index('kind');
        });
    }

    public function down(): void
    {
        DB::table('products')->where('kind', 'cosmetic')->delete();
        DB::table('perfume_types')->where('kind', 'cosmetic')->delete();

        Schema::table('perfume_types', function (Blueprint $table) {
            $table->dropIndex(['kind']);
            $table->dropColumn('kind');
        });

        DB::statement("ALTER TABLE products MODIFY kind ENUM('perfume','pack') NOT NULL DEFAULT 'perfume'");
    }
};
