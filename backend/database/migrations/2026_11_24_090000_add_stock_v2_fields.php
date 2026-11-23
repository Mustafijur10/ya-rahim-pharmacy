<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Step 7e: fields from the medicine form, supplier visits & ledger, purchase payment method. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('medicines', function (Blueprint $table) {
            $table->text('indications')->nullable()->after('description');
            $table->text('side_effects')->nullable()->after('indications');
            $table->string('storage', 20)->default('room')->after('is_cold_chain')->comment('room | fridge | cool_dry');
            $table->boolean('is_antibiotic')->default(false)->after('rx_required');
            $table->boolean('sell_online')->default(true)->after('is_active');
            $table->boolean('allow_loose_sale')->default(true)->after('sell_online');
            $table->string('default_rack', 30)->nullable()->after('barcode');
            $table->decimal('vat_percent', 5, 2)->default(0)->after('discount_percent')->comment('0 = included in MRP');
            $table->decimal('default_cost', 10, 4)->nullable()->after('vat_percent')->comment('Per unit; pre-fills purchase entry');
            $table->decimal('default_mrp', 10, 4)->nullable()->after('default_cost')->comment('Per unit; pre-fills purchase entry');
        });

        Schema::table('suppliers', function (Blueprint $table) {
            $table->string('visit_frequency', 20)->nullable()->after('address')->comment('weekly | fortnightly | monthly | on_call');
            $table->date('next_visit_on')->nullable()->after('visit_frequency');
        });

        Schema::create('supplier_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_id')->constrained()->cascadeOnDelete();
            $table->foreignId('branch_id')->constrained();
            $table->foreignId('purchase_id')->nullable()->constrained()->nullOnDelete();
            $table->decimal('amount', 12, 2);
            $table->string('method', 20)->comment('cash | bank | bkash | cheque');
            $table->string('reference', 100)->nullable();
            $table->string('note')->nullable();
            $table->date('paid_on');
            $table->foreignId('created_by')->constrained('users');
            $table->timestamps();
            $table->index(['supplier_id', 'paid_on']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('supplier_payments');
        Schema::table('suppliers', fn (Blueprint $t) => $t->dropColumn(['visit_frequency', 'next_visit_on']));
        Schema::table('medicines', fn (Blueprint $t) => $t->dropColumn(['indications', 'side_effects', 'storage', 'is_antibiotic', 'sell_online', 'allow_loose_sale', 'default_rack', 'vat_percent', 'default_cost', 'default_mrp']));
    }
};
