<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RefillSubscriptionItem extends Model
{
    protected $guarded = ['id'];

    public function subscription(): BelongsTo
    {
        return $this->belongsTo(RefillSubscription::class, 'refill_subscription_id');
    }

    public function medicine(): BelongsTo
    {
        return $this->belongsTo(Medicine::class);
    }

    public function packSize(): BelongsTo
    {
        return $this->belongsTo(PackSize::class);
    }
}
