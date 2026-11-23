<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;
use Spatie\Permission\Traits\HasRoles;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, HasRoles, LogsActivity, Notifiable, SoftDeletes;

    protected $fillable = [
        'branch_id', 'name', 'phone', 'email', 'password', 'pin', 'is_staff', 'status',
        'registration_no', 'staff_note', 'shift', 'locale', 'last_active_at',
        'phone_verified_at', 'email_verified_at',
    ];

    protected $hidden = ['password', 'pin', 'remember_token'];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'phone_verified_at' => 'datetime',
            'last_active_at' => 'datetime',
            'password' => 'hashed',
            'pin' => 'hashed',
            'is_staff' => 'boolean',
        ];
    }

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['name', 'phone', 'email', 'status', 'branch_id', 'is_staff'])
            ->logOnlyDirty();
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function customer(): HasOne
    {
        return $this->hasOne(Customer::class);
    }

    public function shifts(): HasMany
    {
        return $this->hasMany(Shift::class);
    }

    public function openShift(): HasOne
    {
        // The "open" filter must sit inside the aggregate: latestOfMany() would first pick the
        // newest shift of any status, hiding an open shift when a later-dated closed one exists.
        return $this->hasOne(Shift::class)->ofMany(['opened_at' => 'max', 'id' => 'max'], fn ($q) => $q->where('status', 'open'));
    }

    public function deliveries(): HasMany
    {
        return $this->hasMany(Delivery::class, 'rider_id');
    }

    public function scopeStaff(Builder $query): Builder
    {
        return $query->where('is_staff', true);
    }

    /**
     * Permission-grid check, e.g. hasModuleAccess('pos') or hasModuleAccess('orders', 'full', 'view').
     * Levels: full, view, approval, own. Defaults to full.
     */
    public function hasModuleAccess(string $module, string ...$levels): bool
    {
        $levels = $levels ?: ['full'];

        return $this->hasAnyPermission(array_map(fn ($level) => "$module.$level", $levels));
    }

    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    public function initials(): string
    {
        return collect(explode(' ', $this->name))
            ->filter()
            ->take(2)
            ->map(fn ($part) => mb_strtoupper(mb_substr($part, 0, 1)))
            ->implode('');
    }
}
