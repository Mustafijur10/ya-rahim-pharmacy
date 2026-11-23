<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Batch extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'expiry_date' => 'date',
            'manufactured_at' => 'date',
            'cost_price' => 'decimal:4',
            'mrp' => 'decimal:4',
            'quantity' => 'integer',
            'initial_quantity' => 'integer',
        ];
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function medicine(): BelongsTo
    {
        return $this->belongsTo(Medicine::class);
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function movements(): HasMany
    {
        return $this->hasMany(StockMovement::class);
    }

    /** red = expired or under 30 days, amber = under 90 days, green = safe. */
    public function expiryLevel(): string
    {
        $days = now()->startOfDay()->diffInDays($this->expiry_date, false);

        return match (true) {
            $days < 30 => 'red',
            $days < 90 => 'amber',
            default => 'green',
        };
    }

    public function isExpired(): bool
    {
        return $this->expiry_date->lte(now()->startOfDay());
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', 'active');
    }

    public function scopeExpiringWithin(Builder $query, int $days): Builder
    {
        return $query->active()->where('quantity', '>', 0)->whereDate('expiry_date', '<=', now()->addDays($days));
    }
}
