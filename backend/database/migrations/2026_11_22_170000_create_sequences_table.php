<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // Gap-free, race-safe counters for human-readable codes (ON-1042, POS-3318, RET-1001…).
    public function up(): void
    {
        Schema::create('sequences', function (Blueprint $table) {
            $table->string('name', 50)->primary();
            $table->unsignedBigInteger('value');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sequences');
    }
};
