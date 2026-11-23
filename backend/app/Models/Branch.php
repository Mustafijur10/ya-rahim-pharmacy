<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Branch extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean', 'latitude' => 'decimal:7', 'longitude' => 'decimal:7'];
    }

    /** The shop the website sells from (first active branch). */
    public static function default(): self
    {
        return once(fn () => static::where('is_active', true)->orderBy('id')->firstOrFail());
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function batches(): HasMany
    {
        return $this->hasMany(Batch::class);
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class);
    }

    public function deliveryAreas(): HasMany
    {
        return $this->hasMany(DeliveryArea::class);
    }
}
