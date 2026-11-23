<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PackSize extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['is_default' => 'boolean', 'extra_discount_percent' => 'decimal:2', 'units' => 'integer'];
    }

    public function medicine(): BelongsTo
    {
        return $this->belongsTo(Medicine::class);
    }
}
