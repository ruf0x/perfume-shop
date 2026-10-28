<?php

use App\Enums\Gender;
use App\Enums\ProductKind;
use App\Enums\StockMode;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('perfume_types', function (Blueprint $table) {
            $table->id();
            $table->string('name', 60)->unique();
            $table->string('slug', 80)->unique();
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('brands', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100)->unique();
            $table->string('slug', 120)->unique();
            $table->string('logo')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('products', function (Blueprint $table) {
            $table->id();
            $table->enum('kind', array_column(ProductKind::cases(), 'value'))->default(ProductKind::Perfume->value);
            $table->string('name', 150);
            $table->string('slug', 170)->unique();
            $table->foreignId('brand_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('perfume_type_id')->nullable()->constrained()->nullOnDelete();
            $table->enum('gender', array_column(Gender::cases(), 'value'))->nullable();
            $table->string('inspired_by', 150)->nullable();
            $table->string('short_description')->nullable();
            $table->text('description')->nullable();
            $table->string('notes_top')->nullable();
            $table->string('notes_heart')->nullable();
            $table->string('notes_base')->nullable();
            $table->string('main_image')->nullable();
            $table->unsignedInteger('stock_ml')->default(0);
            $table->boolean('is_active')->default(true);
            $table->boolean('is_featured')->default(false);
            $table->integer('sort_order')->default(0);
            $table->timestamps();
            $table->softDeletes();

            $table->index(['kind', 'is_active']);
            $table->fullText(['name', 'inspired_by']);
        });

        Schema::create('product_images', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->string('path');
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('product_variants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->string('label', 60);
            $table->unsignedInteger('ml')->nullable();
            $table->unsignedInteger('price');
            $table->unsignedInteger('compare_at_price')->nullable();
            $table->enum('stock_mode', array_column(StockMode::cases(), 'value'))->default(StockMode::Pool->value);
            $table->unsignedInteger('stock_qty')->default(0);
            $table->string('sku', 50)->nullable()->unique();
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('pack_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pack_variant_id')->constrained('product_variants')->cascadeOnDelete();
            $table->foreignId('component_variant_id')->constrained('product_variants')->restrictOnDelete();
            $table->unsignedInteger('quantity')->default(1);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pack_items');
        Schema::dropIfExists('product_variants');
        Schema::dropIfExists('product_images');
        Schema::dropIfExists('products');
        Schema::dropIfExists('brands');
        Schema::dropIfExists('perfume_types');
    }
};
