<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OrderItem extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
            'returned_quantity' => 'integer',
            'unit_mrp' => 'decimal:4',
            'unit_cost' => 'decimal:4',
            'discount' => 'decimal:2',
            'line_total' => 'decimal:2',
            'rx_required' => 'boolean',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function medicine(): BelongsTo
    {
        return $this->belongsTo(Medicine::class);
    }

    public function batch(): BelongsTo
    {
        return $this->belongsTo(Batch::class);
    }

    public function packSize(): BelongsTo
    {
        return $this->belongsTo(PackSize::class);
    }
}
