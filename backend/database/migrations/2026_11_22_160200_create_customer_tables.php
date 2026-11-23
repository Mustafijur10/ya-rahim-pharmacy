<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('delivery_areas', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained();
            $table->string('name');
            $table->string('name_bn')->nullable();
            $table->decimal('standard_fee', 10, 2)->default(0);
            $table->decimal('express_fee', 10, 2)->nullable();
            $table->boolean('express_available')->default(false);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        // Shop and online customers. Walk-in sales have no customer row.
        Schema::create('customers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->unique()->constrained()->nullOnDelete();
            $table->string('name');
            $table->string('phone', 20)->nullable()->unique();
            $table->string('email')->nullable();
            $table->date('date_of_birth')->nullable();
            $table->text('notes')->nullable()->comment('Staff notes, e.g. allergies');
            $table->decimal('total_spent', 14, 2)->default(0);
            $table->unsignedInteger('orders_count')->default(0);
            $table->timestamp('last_purchase_at')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('addresses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->foreignId('delivery_area_id')->nullable()->constrained()->nullOnDelete();
            $table->string('label', 30)->nullable()->comment('Home, Office…');
            $table->string('recipient_name');
            $table->string('phone', 20);
            $table->string('address_line');
            $table->string('landmark')->nullable();
            $table->boolean('is_default')->default(false);
            $table->timestamps();
        });

        Schema::create('prescriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('doctor_name')->nullable();
            $table->date('prescribed_at')->nullable();
            $table->string('status', 20)->default('pending')->comment('pending | verified | rejected | expired');
            $table->boolean('save_for_refill')->default(false);
            $table->text('pharmacist_note')->nullable()->comment('Sent to the customer by SMS');
            $table->string('reject_reason')->nullable();
            $table->foreignId('verified_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('verified_at')->nullable();
            $table->timestamps();
        });

        Schema::create('prescription_pages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('prescription_id')->constrained()->cascadeOnDelete();
            $table->string('disk', 20)->default('local');
            $table->string('path');
            $table->string('original_name')->nullable();
            $table->string('mime', 50);
            $table->unsignedInteger('size');
            $table->unsignedTinyInteger('sort_order')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('prescription_pages');
        Schema::dropIfExists('prescriptions');
        Schema::dropIfExists('addresses');
        Schema::dropIfExists('customers');
        Schema::dropIfExists('delivery_areas');
    }
};
