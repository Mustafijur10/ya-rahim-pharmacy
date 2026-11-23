<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('suppliers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->string('contact_person')->nullable();
            $table->string('phone', 20)->nullable();
            $table->string('email')->nullable();
            $table->string('address')->nullable();
            $table->decimal('balance', 14, 2)->default(0)->comment('Amount we owe the supplier');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // One row per batch on the shelf. Quantity is in base units (tab/cap/pc).
        Schema::create('batches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained();
            $table->foreignId('medicine_id')->constrained();
            $table->foreignId('supplier_id')->nullable()->constrained()->nullOnDelete();
            $table->string('batch_no', 50);
            $table->date('manufactured_at')->nullable();
            $table->date('expiry_date');
            $table->decimal('cost_price', 12, 4)->comment('Per base unit');
            $table->decimal('mrp', 12, 4)->comment('Per base unit');
            $table->unsignedInteger('initial_quantity');
            $table->unsignedInteger('quantity')->comment('On hand, base units');
            $table->string('rack', 30)->nullable();
            $table->string('status', 20)->default('active')->comment('active | returned | written_off');
            $table->timestamps();

            $table->unique(['branch_id', 'medicine_id', 'batch_no']);
            // FEFO lookups: oldest expiry first for a medicine in a branch.
            $table->index(['medicine_id', 'branch_id', 'status', 'expiry_date'], 'batches_fefo_index');
            $table->index('expiry_date');
        });

        Schema::create('purchases', function (Blueprint $table) {
            $table->id();
            $table->string('code', 30)->unique();
            $table->foreignId('branch_id')->constrained();
            $table->foreignId('supplier_id')->constrained();
            $table->string('invoice_no', 50)->nullable();
            $table->date('purchased_at');
            $table->decimal('subtotal', 14, 2)->default(0);
            $table->decimal('discount', 14, 2)->default(0);
            $table->decimal('total', 14, 2)->default(0);
            $table->decimal('paid', 14, 2)->default(0);
            $table->string('status', 20)->default('received')->comment('draft | received | cancelled');
            $table->text('note')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('purchase_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('purchase_id')->constrained()->cascadeOnDelete();
            $table->foreignId('medicine_id')->constrained();
            $table->foreignId('batch_id')->nullable()->constrained()->nullOnDelete();
            $table->string('batch_no', 50);
            $table->date('expiry_date');
            $table->unsignedInteger('quantity')->comment('Base units');
            $table->unsignedInteger('free_quantity')->default(0);
            $table->decimal('unit_cost', 12, 4);
            $table->decimal('mrp', 12, 4);
            $table->decimal('line_total', 14, 2);
            $table->timestamps();
        });

        Schema::create('stock_adjustments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained();
            $table->foreignId('batch_id')->constrained();
            $table->integer('quantity')->comment('+ adds, − removes (base units)');
            $table->string('reason', 30)->comment('damaged | expired | count_correction | lost | supplier_return | other');
            $table->text('note')->nullable();
            $table->string('status', 20)->default('pending')->comment('pending | approved | rejected');
            $table->foreignId('requested_by')->constrained('users');
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_adjustments');
        Schema::dropIfExists('purchase_items');
        Schema::dropIfExists('purchases');
        Schema::dropIfExists('batches');
        Schema::dropIfExists('suppliers');
    }
};
