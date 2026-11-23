<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Every stock change, so any batch's quantity can be explained line by line.
        Schema::create('stock_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained();
            $table->foreignId('batch_id')->constrained();
            $table->foreignId('medicine_id')->constrained();
            $table->string('type', 30)->comment('purchase | sale | sale_return | cancel | adjustment_in | adjustment_out | expired | supplier_return');
            $table->integer('quantity')->comment('Signed: + in, − out (base units)');
            $table->unsignedInteger('balance_after');
            $table->nullableMorphs('reference');
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('note')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['medicine_id', 'created_at']);
            $table->index(['batch_id', 'created_at']);
        });

        // Cashier asks, manager approves: big discounts, refunds, stock fixes, Rx release.
        Schema::create('approval_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained();
            $table->string('type', 30)->comment('discount | refund | stock_adjustment | rx_release');
            $table->nullableMorphs('approvable');
            $table->foreignId('requested_by')->constrained('users');
            $table->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('status', 20)->default('pending')->comment('pending | approved | rejected');
            $table->decimal('amount', 14, 2)->nullable();
            $table->json('data')->nullable();
            $table->string('reason')->nullable();
            $table->string('decision_note')->nullable();
            $table->timestamp('decided_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'type']);
        });

        Schema::create('refill_subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->foreignId('prescription_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('address_id')->nullable()->constrained()->nullOnDelete();
            $table->string('delivery_type', 20)->default('standard')->comment('standard | express | pickup');
            $table->unsignedSmallInteger('interval_days')->default(30);
            $table->unsignedTinyInteger('remind_days_before')->default(3);
            $table->date('next_refill_on');
            $table->timestamp('last_reminded_at')->nullable();
            $table->string('status', 20)->default('active')->comment('active | paused | cancelled');
            $table->timestamps();

            $table->index(['status', 'next_refill_on']);
        });

        Schema::create('refill_subscription_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('refill_subscription_id')->constrained()->cascadeOnDelete();
            $table->foreignId('medicine_id')->constrained();
            $table->foreignId('pack_size_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedSmallInteger('packs')->default(1);
            $table->timestamps();
        });

        // Fridge log for cold-chain medicines (insulin etc.).
        Schema::create('temperature_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained();
            $table->foreignId('user_id')->constrained();
            $table->string('location', 30)->default('Fridge');
            $table->decimal('temperature', 4, 1);
            $table->string('note')->nullable();
            $table->timestamp('recorded_at');
            $table->timestamps();
        });

        Schema::create('settings', function (Blueprint $table) {
            $table->string('key')->primary();
            $table->json('value')->nullable();
            $table->timestamps();
        });

        Schema::create('notifications', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('type');
            $table->morphs('notifiable');
            $table->text('data');
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
        });

        Schema::create('sms_logs', function (Blueprint $table) {
            $table->id();
            $table->string('phone', 20)->index();
            $table->text('message');
            $table->string('purpose', 40)->nullable();
            $table->string('status', 20)->default('queued')->comment('queued | sent | failed');
            $table->string('provider_ref')->nullable();
            $table->text('error')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sms_logs');
        Schema::dropIfExists('notifications');
        Schema::dropIfExists('settings');
        Schema::dropIfExists('temperature_logs');
        Schema::dropIfExists('refill_subscription_items');
        Schema::dropIfExists('refill_subscriptions');
        Schema::dropIfExists('approval_requests');
        Schema::dropIfExists('stock_movements');
    }
};
