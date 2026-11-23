<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shifts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained();
            $table->foreignId('user_id')->constrained();
            $table->string('counter_name', 30)->default('Counter 1');
            $table->timestamp('opened_at');
            $table->timestamp('closed_at')->nullable();
            $table->decimal('opening_cash', 12, 2)->default(0);
            $table->decimal('expected_cash', 12, 2)->nullable();
            $table->decimal('counted_cash', 12, 2)->nullable();
            $table->decimal('difference', 12, 2)->nullable();
            $table->string('status', 10)->default('open')->comment('open | closed');
            $table->text('note')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'status']);
        });

        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->string('code', 30)->unique()->comment('ON-1042 (online) / POS-3318 (shop)');
            $table->foreignId('branch_id')->constrained();
            $table->string('channel', 10)->comment('shop | online | phone');
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->string('status', 30)->comment('new | rx_verification | packing | ready_for_pickup | out_for_delivery | delivered | completed | cancelled');
            $table->string('delivery_type', 20)->default('counter')->comment('counter | pickup | standard | express');

            // Delivery address snapshot (kept even if the customer edits their address later)
            $table->foreignId('delivery_area_id')->nullable()->constrained()->nullOnDelete();
            $table->string('recipient_name')->nullable();
            $table->string('recipient_phone', 20)->nullable();
            $table->string('delivery_address')->nullable();
            $table->string('delivery_landmark')->nullable();

            $table->decimal('subtotal', 14, 2)->default(0)->comment('At MRP');
            $table->decimal('discount_total', 14, 2)->default(0);
            $table->decimal('delivery_fee', 10, 2)->default(0);
            $table->decimal('total', 14, 2)->default(0);
            $table->decimal('paid_amount', 14, 2)->default(0);
            $table->string('payment_status', 20)->default('unpaid')->comment('unpaid | partial | paid | refunded');
            $table->string('promo_code', 30)->nullable();

            $table->boolean('requires_rx')->default(false);
            $table->foreignId('prescription_id')->nullable()->constrained()->nullOnDelete();

            $table->foreignId('cashier_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('shift_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('pharmacist_id')->nullable()->constrained('users')->nullOnDelete();

            $table->text('customer_note')->nullable();
            $table->text('staff_note')->nullable();
            $table->string('cancel_reason')->nullable();

            $table->timestamp('placed_at')->nullable();
            $table->timestamp('verified_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['status', 'created_at']);
            $table->index(['channel', 'created_at']);
            $table->index(['branch_id', 'created_at']);
        });

        // One row per batch sold. A line that spans two batches becomes two rows.
        Schema::create('order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('medicine_id')->constrained();
            $table->foreignId('batch_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('pack_size_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name')->comment('Snapshot, e.g. Seclo 20 mg Capsule');
            $table->unsignedInteger('quantity')->comment('Base units');
            $table->string('quantity_label')->nullable()->comment('e.g. 2 strips');
            $table->decimal('unit_mrp', 12, 4);
            $table->decimal('unit_cost', 12, 4)->default(0)->comment('For profit reports');
            $table->decimal('discount', 12, 2)->default(0);
            $table->decimal('line_total', 14, 2);
            $table->boolean('rx_required')->default(false);
            $table->string('rx_status', 20)->nullable()->comment('pending | approved | rejected');
            $table->unsignedInteger('returned_quantity')->default(0);
            $table->timestamps();
        });

        Schema::create('order_status_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->string('from_status', 30)->nullable();
            $table->string('to_status', 30);
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('note')->nullable();
            $table->timestamp('created_at')->useCurrent();
        });

        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->string('method', 20)->comment('cash | bkash | nagad | card | sslcommerz');
            $table->decimal('amount', 14, 2);
            $table->decimal('received_amount', 14, 2)->nullable()->comment('Cash handed over');
            $table->decimal('change_amount', 14, 2)->nullable();
            $table->string('transaction_id')->nullable()->index();
            $table->json('gateway_payload')->nullable();
            $table->string('status', 20)->default('success')->comment('pending | success | failed | refunded');
            $table->foreignId('received_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('shift_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();

            $table->index(['method', 'paid_at']);
        });

        Schema::create('sale_returns', function (Blueprint $table) {
            $table->id();
            $table->string('code', 30)->unique();
            $table->foreignId('order_id')->constrained();
            $table->foreignId('branch_id')->constrained();
            $table->decimal('refund_amount', 14, 2);
            $table->string('refund_method', 20)->comment('cash | bkash | nagad | card | store_credit');
            $table->string('reason');
            $table->string('status', 20)->default('pending')->comment('pending | approved | rejected | completed');
            $table->foreignId('requested_by')->constrained('users');
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('shift_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('sale_return_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sale_return_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_item_id')->constrained();
            $table->foreignId('batch_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedInteger('quantity');
            $table->decimal('amount', 14, 2);
            $table->boolean('restock')->default(true);
            $table->timestamps();
        });

        Schema::create('held_sales', function (Blueprint $table) {
            $table->id();
            $table->foreignId('branch_id')->constrained();
            $table->foreignId('user_id')->constrained();
            $table->foreignId('shift_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->string('label')->nullable();
            $table->json('cart');
            $table->timestamps();
        });

        Schema::create('deliveries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->unique()->constrained()->cascadeOnDelete();
            $table->foreignId('rider_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('courier_name')->nullable()->comment('When a courier partner is used');
            $table->string('status', 20)->default('assigned')->comment('assigned | picked_up | delivered | failed | returned');
            $table->string('otp_code', 6)->comment('Customer reads it to the rider');
            $table->decimal('cash_to_collect', 14, 2)->default(0);
            $table->decimal('cash_collected', 14, 2)->default(0);
            $table->timestamp('cash_settled_at')->nullable();
            $table->foreignId('settled_to')->nullable()->constrained('users')->nullOnDelete();
            $table->string('failed_reason')->nullable();
            $table->timestamp('assigned_at')->nullable();
            $table->timestamp('picked_up_at')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamps();

            $table->index(['rider_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('deliveries');
        Schema::dropIfExists('held_sales');
        Schema::dropIfExists('sale_return_items');
        Schema::dropIfExists('sale_returns');
        Schema::dropIfExists('payments');
        Schema::dropIfExists('order_status_histories');
        Schema::dropIfExists('order_items');
        Schema::dropIfExists('orders');
        Schema::dropIfExists('shifts');
    }
};
