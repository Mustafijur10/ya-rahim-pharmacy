<?php

namespace App\Models;

use App\Enums\DeliveryType;
use App\Enums\OrderChannel;
use App\Enums\OrderStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

class Order extends Model
{
    use LogsActivity, SoftDeletes;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'channel' => OrderChannel::class,
            'status' => OrderStatus::class,
            'delivery_type' => DeliveryType::class,
            'subtotal' => 'decimal:2',
            'discount_total' => 'decimal:2',
            'delivery_fee' => 'decimal:2',
            'total' => 'decimal:2',
            'paid_amount' => 'decimal:2',
            'requires_rx' => 'boolean',
            'placed_at' => 'datetime',
            'verified_at' => 'datetime',
            'completed_at' => 'datetime',
            'cancelled_at' => 'datetime',
            'hold_until' => 'datetime',
        ];
    }

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['status', 'discount_total', 'total', 'payment_status', 'cancel_reason'])
            ->logOnlyDirty();
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    public function statusHistory(): HasMany
    {
        return $this->hasMany(OrderStatusHistory::class)->orderBy('created_at');
    }

    public function prescription(): BelongsTo
    {
        return $this->belongsTo(Prescription::class);
    }

    public function delivery(): HasOne
    {
        return $this->hasOne(Delivery::class);
    }

    public function deliveryArea(): BelongsTo
    {
        return $this->belongsTo(DeliveryArea::class);
    }

    public function cashier(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cashier_id');
    }

    public function pharmacist(): BelongsTo
    {
        return $this->belongsTo(User::class, 'pharmacist_id');
    }

    public function shift(): BelongsTo
    {
        return $this->belongsTo(Shift::class);
    }

    public function returns(): HasMany
    {
        return $this->hasMany(SaleReturn::class);
    }

    public function balanceDue(): float
    {
        return max(0, (float) $this->total - (float) $this->paid_amount);
    }

    public function scopeStatus(Builder $query, OrderStatus|string $status): Builder
    {
        return $query->where('status', $status instanceof OrderStatus ? $status->value : $status);
    }

    public function scopeOnline(Builder $query): Builder
    {
        return $query->whereIn('channel', [OrderChannel::Online->value, OrderChannel::Phone->value]);
    }
}
