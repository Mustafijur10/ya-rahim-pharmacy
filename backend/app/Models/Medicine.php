<?php

namespace App\Models;

use Database\Factories\MedicineFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Spatie\Activitylog\LogOptions;
use Spatie\Activitylog\Traits\LogsActivity;

class Medicine extends Model
{
    /** @use HasFactory<MedicineFactory> */
    use HasFactory, LogsActivity, SoftDeletes;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'rx_required' => 'boolean',
            'is_cold_chain' => 'boolean',
            'is_featured' => 'boolean',
            'is_active' => 'boolean',
            'discount_percent' => 'decimal:2',
            'images' => 'array',
            'is_antibiotic' => 'boolean',
            'sell_online' => 'boolean',
            'allow_loose_sale' => 'boolean',
            'vat_percent' => 'decimal:2',
            'default_cost' => 'float',
            'default_mrp' => 'float',
        ];
    }

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()->logUnguarded()->logOnlyDirty();
    }

    public function generic(): BelongsTo
    {
        return $this->belongsTo(Generic::class);
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function packSizes(): HasMany
    {
        return $this->hasMany(PackSize::class)->orderBy('sort_order');
    }

    public function defaultPackSize(): HasOne
    {
        return $this->hasOne(PackSize::class)->where('is_default', true);
    }

    public function batches(): HasMany
    {
        return $this->hasMany(Batch::class);
    }

    /** Sellable batches, oldest expiry first (FEFO). */
    public function sellableBatches(): HasMany
    {
        return $this->batches()
            ->where('status', 'active')
            ->where('quantity', '>', 0)
            ->whereDate('expiry_date', '>', now())
            ->orderBy('expiry_date')
            ->orderBy('id');
    }

    /** Full display name, e.g. Seclo 20 mg Capsule. */
    protected function fullName(): Attribute
    {
        return Attribute::get(fn () => trim(implode(' ', array_filter([$this->name, $this->strength, $this->dosage_form]))));
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    /** Active and switched on for the website ("Sell online"). */
    public function scopeForStore(Builder $query): Builder
    {
        return $query->where('is_active', true)->where('sell_online', true);
    }

    /** SQL for sellable units of this medicine in a branch (not expired, active batches). */
    private static function sellableStockSql(): string
    {
        return "(SELECT COALESCE(SUM(sb.quantity), 0) FROM batches sb
                 WHERE sb.medicine_id = medicines.id AND sb.branch_id = ? AND sb.status = 'active' AND sb.expiry_date > ?)";
    }

    /** Adds a `stock_units` column with sellable stock in the branch. */
    public function scopeWithSellableStock(Builder $query, int $branchId): Builder
    {
        if (empty($query->getQuery()->columns)) {
            $query->select('medicines.*');
        }

        return $query->selectRaw(self::sellableStockSql().' AS stock_units', [$branchId, now()->toDateString()]);
    }

    /** Active medicines below their reorder level, most urgent first. */
    public function scopeLowStock(Builder $query, int $branchId): Builder
    {
        $bindings = [$branchId, now()->toDateString()];

        return $query->active()
            ->where('reorder_level', '>', 0)
            ->whereRaw(self::sellableStockSql().' < medicines.reorder_level', $bindings)
            ->orderByRaw(self::sellableStockSql().' / medicines.reorder_level', $bindings);
    }

    /** Only medicines with sellable stock. */
    public function scopeInStock(Builder $query, int $branchId): Builder
    {
        return $query->whereRaw(self::sellableStockSql().' > 0', [$branchId, now()->toDateString()]);
    }

    /**
     * SQL for the online price of the default pack: next-to-sell batch MRP (or latest MRP when
     * out of stock) × pack units × (1 − discount). Matches PricingService::packPrice.
     *
     * @return array{0: string, 1: array}
     */
    public static function listPriceSql(int $branchId): array
    {
        $today = now()->toDateString();
        $sql = "(COALESCE(
                    (SELECT nb.mrp FROM batches nb WHERE nb.medicine_id = medicines.id AND nb.branch_id = ? AND nb.status = 'active'
                       AND nb.quantity > 0 AND nb.expiry_date > ? ORDER BY nb.expiry_date, nb.id LIMIT 1),
                    (SELECT lb.mrp FROM batches lb WHERE lb.medicine_id = medicines.id AND lb.branch_id = ? ORDER BY lb.id DESC LIMIT 1),
                    0)
                 * COALESCE((SELECT ps.units FROM pack_sizes ps WHERE ps.medicine_id = medicines.id AND ps.is_default = 1 LIMIT 1), 1)
                 * (1 - medicines.discount_percent / 100))";

        return [$sql, [$branchId, $today, $branchId]];
    }

    /** Active medicines with no sellable stock at all. */
    public function scopeOutOfStock(Builder $query, int $branchId): Builder
    {
        return $query->active()->whereRaw(self::sellableStockSql().' = 0', [$branchId, now()->toDateString()]);
    }

    /** Search by brand, generic name or barcode. Matches the start of words, e.g. ome finds Omeprazole. */
    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        $term = trim((string) $term);
        if ($term === '') {
            return $query;
        }
        $like = addcslashes($term, '%_\\').'%';

        return $query->where(function (Builder $q) use ($like) {
            $q->where('name', 'like', $like)
                ->orWhere('barcode', 'like', $like)
                ->orWhereHas('generic', fn (Builder $g) => $g->where('name', 'like', $like));
        });
    }
}
