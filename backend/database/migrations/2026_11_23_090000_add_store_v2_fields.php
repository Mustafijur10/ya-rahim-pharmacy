<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Store design v2: register form (delivery area, monthly reminders), "Pay at the shop",
 * guest prescription requests and the contact form.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->foreignId('delivery_area_id')->nullable()->after('email')->constrained()->nullOnDelete();
            $table->boolean('sms_reminders')->default(false)->after('delivery_area_id')->comment('Monthly refill reminders opt-in');
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->string('payment_preference', 20)->nullable()->after('payment_status')
                ->comment('cod | pay_at_shop | bkash | nagad | card');
            $table->timestamp('hold_until')->nullable()->after('payment_preference')->comment('Pay-at-shop pickups are kept aside until then');
        });

        Schema::table('prescriptions', function (Blueprint $table) {
            $table->string('contact_name')->nullable()->after('customer_id');
            $table->string('contact_phone', 20)->nullable()->after('contact_name');
            $table->string('delivery_type', 20)->nullable()->after('save_for_refill')->comment('Guest request: delivery or pickup preference');
            $table->text('customer_note')->nullable()->after('delivery_type');
        });

        Schema::create('contact_messages', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('phone', 20);
            $table->string('email')->nullable();
            $table->string('topic', 40);
            $table->string('order_code', 30)->nullable();
            $table->text('message');
            $table->string('status', 20)->default('new')->comment('new | answered | closed');
            $table->foreignId('handled_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('ip', 45)->nullable();
            $table->timestamps();

            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('contact_messages');
        Schema::table('prescriptions', fn (Blueprint $t) => $t->dropColumn(['contact_name', 'contact_phone', 'delivery_type', 'customer_note']));
        Schema::table('orders', fn (Blueprint $t) => $t->dropColumn(['payment_preference', 'hold_until']));
        Schema::table('customers', function (Blueprint $t) {
            $t->dropConstrainedForeignId('delivery_area_id');
            $t->dropColumn('sms_reminders');
        });
    }
};
