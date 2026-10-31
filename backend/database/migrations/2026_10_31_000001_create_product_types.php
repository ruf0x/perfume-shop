<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Product types ("rayons"): the owner creates Parfums, Cosmétiques, Montres, Lunettes... Each type has its
 * own families/categories, products, packs, stock and brands. The profile says how its products behave:
 *   - perfume:  decants by the ml, olfactory notes, "inspired by", sealed bottles;
 *   - standard: free-form options counted in pieces (or sold by the ml).
 *
 * Existing data moves over: perfumes go to a "Parfums" type, cosmetics to "Cosmétiques".
 * `products.kind` stays as the profile of the product's type (perfume | standard) or `pack`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_types', function (Blueprint $table) {
            $table->id();
            $table->string('name', 60)->unique();
            $table->string('slug', 80)->unique();
            $table->enum('profile', ['perfume', 'standard'])->default('standard');
            $table->boolean('uses_gender')->default(false);
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::table('products', function (Blueprint $table) {
            $table->foreignId('product_type_id')->nullable()->after('kind')->constrained('product_types')->restrictOnDelete();
        });

        Schema::table('perfume_types', function (Blueprint $table) {
            $table->foreignId('product_type_id')->nullable()->after('slug')->constrained('product_types')->restrictOnDelete();
        });

        // Only create the two historical types when there is something to put in them (a fresh database starts empty).
        $now = now();
        $typeFor = function (string $kind, string $name, string $slug, string $profile, bool $gender, int $order) use ($now): ?int {
            $used = DB::table('products')->where('kind', $kind)->exists() || DB::table('perfume_types')->where('kind', $kind)->exists();
            if (! $used) {
                return null;
            }

            return DB::table('product_types')->insertGetId([
                'name' => $name, 'slug' => $slug, 'profile' => $profile, 'uses_gender' => $gender,
                'sort_order' => $order, 'is_active' => true, 'created_at' => $now, 'updated_at' => $now,
            ]);
        };

        $perfumes = $typeFor('perfume', 'Parfums', 'parfums', 'perfume', true, 0);
        $cosmetics = $typeFor('cosmetic', 'Cosmétiques', 'cosmetiques', 'standard', false, 1);

        foreach (['products', 'perfume_types'] as $table) {
            $perfumes && DB::table($table)->where('kind', 'perfume')->update(['product_type_id' => $perfumes]);
            $cosmetics && DB::table($table)->where('kind', 'cosmetic')->update(['product_type_id' => $cosmetics]);
        }

        // Categories no longer carry a kind: they belong to a product type.
        Schema::table('perfume_types', function (Blueprint $table) {
            $table->dropIndex(['kind']);
            $table->dropColumn('kind');
        });

        // products.kind: `cosmetic` becomes the generic `standard` profile.
        DB::statement("ALTER TABLE products MODIFY kind ENUM('perfume','cosmetic','standard','pack') NOT NULL DEFAULT 'perfume'");
        DB::table('products')->where('kind', 'cosmetic')->update(['kind' => 'standard']);
        DB::statement("ALTER TABLE products MODIFY kind ENUM('perfume','standard','pack') NOT NULL DEFAULT 'perfume'");

        // A brand can belong to several types (Armani makes perfumes and watches).
        Schema::create('brand_product_type', function (Blueprint $table) {
            $table->foreignId('brand_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_type_id')->constrained('product_types')->cascadeOnDelete();
            $table->primary(['brand_id', 'product_type_id']);
        });

        DB::statement('INSERT INTO brand_product_type (brand_id, product_type_id) SELECT DISTINCT brand_id, product_type_id FROM products WHERE brand_id IS NOT NULL AND product_type_id IS NOT NULL');
    }

    public function down(): void
    {
        Schema::dropIfExists('brand_product_type');

        Schema::table('perfume_types', function (Blueprint $table) {
            $table->enum('kind', ['perfume', 'cosmetic'])->default('perfume')->after('slug');
            $table->index('kind');
        });
        DB::statement("UPDATE perfume_types SET kind = 'cosmetic' WHERE product_type_id IN (SELECT id FROM product_types WHERE profile = 'standard')");

        DB::statement("ALTER TABLE products MODIFY kind ENUM('perfume','cosmetic','standard','pack') NOT NULL DEFAULT 'perfume'");
        DB::table('products')->where('kind', 'standard')->update(['kind' => 'cosmetic']);
        DB::statement("ALTER TABLE products MODIFY kind ENUM('perfume','cosmetic','pack') NOT NULL DEFAULT 'perfume'");

        Schema::table('perfume_types', function (Blueprint $table) {
            $table->dropConstrainedForeignId('product_type_id');
        });
        Schema::table('products', function (Blueprint $table) {
            $table->dropConstrainedForeignId('product_type_id');
        });

        Schema::dropIfExists('product_types');
    }
};
