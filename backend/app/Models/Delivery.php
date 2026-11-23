<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Delivery extends Model
{
    protected $guarded = ['id'];

    /** The code is only shown to the customer, never in rider API responses. */
    protected $hidden = ['otp_code'];

    protected function casts(): array
    {
        return [
            'cash_to_collect' => 'decimal:2',
            'cash_collected' => 'decimal:2',
            'cash_settled_at' => 'datetime',
            'assigned_at' => 'datetime',
            'picked_up_at' => 'datetime',
            'delivered_at' => 'datetime',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function rider(): BelongsTo
    {
        return $this->belongsTo(User::class, 'rider_id');
    }
}
