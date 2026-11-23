<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('categories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('parent_id')->nullable()->constrained('categories')->nullOnDelete();
            $table->string('name');
            $table->string('name_bn')->nullable();
            $table->string('slug')->unique();
            $table->string('icon', 50)->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('companies', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('logo')->nullable();
            $table->boolean('is_featured')->default(false);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // Generic (molecule) info is shared by every brand of it.
        Schema::create('generics', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->string('slug')->unique();
            $table->string('therapeutic_class')->nullable();
            $table->text('overview')->nullable();
            $table->text('indications')->nullable();
            $table->text('side_effects')->nullable();
            $table->text('precautions')->nullable();
            $table->text('storage')->nullable();
            $table->timestamps();
        });

        Schema::create('medicines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('generic_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('company_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('category_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name')->comment('Brand name, e.g. Seclo');
            $table->string('strength', 50)->nullable()->comment('e.g. 20 mg');
            $table->string('dosage_form', 50)->nullable()->comment('Tablet, Capsule, Syrup…');
            $table->string('slug')->unique();
            $table->string('barcode', 64)->nullable()->index();
            $table->string('unit_name', 20)->default('pc')->comment('Smallest unit sold: tab, cap, bottle, pc');
            $table->boolean('rx_required')->default(false)->index();
            $table->boolean('is_cold_chain')->default(false);
            $table->decimal('discount_percent', 5, 2)->default(0)->comment('Default discount off MRP');
            $table->unsignedInteger('reorder_level')->default(0)->comment('In base units');
            $table->text('description')->nullable();
            $table->json('images')->nullable();
            $table->boolean('is_featured')->default(false);
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('sold_count')->default(0)->comment('For "most ordered"');
            $table->timestamps();
            $table->softDeletes();

            $table->index(['category_id', 'is_active']);
            $table->fullText(['name']);
        });

        // How a medicine is sold: 1 strip = 10 units, 1 box = 100 units, etc.
        Schema::create('pack_sizes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('medicine_id')->constrained()->cascadeOnDelete();
            $table->string('name')->comment('e.g. 1 strip (10 caps)');
            $table->string('short_name', 30)->comment('e.g. strip');
            $table->unsignedInteger('units')->default(1);
            $table->decimal('extra_discount_percent', 5, 2)->default(0);
            $table->boolean('is_default')->default(false);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pack_sizes');
        Schema::dropIfExists('medicines');
        Schema::dropIfExists('generics');
        Schema::dropIfExists('companies');
        Schema::dropIfExists('categories');
    }
};
