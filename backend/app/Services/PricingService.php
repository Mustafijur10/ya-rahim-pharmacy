<?php

namespace App\Services;

use App\Enums\DeliveryType;
use App\Exceptions\BusinessException;
use App\Models\Batch;
use App\Models\Medicine;
use App\Models\PackSize;
use Illuminate\Support\Collection;

/**
 * Read-only prices for the store and cart. Never changes stock.
 * Price per unit comes from the batch that would be sold next (FEFO), so the
 * price a customer sees matches what checkout charges.
 */
class PricingService
{
    public function __construct(private OrderService $orders) {}

    /**
     * Stock and next-batch MRP for many medicines in two queries.
     *
     * @return array<int, array{units: int, unit_mrp: ?float}>
     */
    public function stockInfo(Collection|array $medicineIds, int $branchId): array
    {
        $ids = collect($medicineIds)->unique()->values();
        if ($ids->isEmpty()) {
            return [];
        }

        $sellable = Batch::query()
            ->whereIn('medicine_id', $ids)
            ->where('branch_id', $branchId)
            ->where('status', 'active')
            ->where('quantity', '>', 0)
            ->whereDate('expiry_date', '>', now()->toDateString())
            ->orderBy('expiry_date')
            ->orderBy('id')
            ->get(['medicine_id', 'quantity', 'mrp']);

        // Medicines with no sellable stock still show their latest MRP.
        $fallback = Batch::query()
            ->whereIn('medicine_id', $ids->diff($sellable->pluck('medicine_id')))
            ->where('branch_id', $branchId)
            ->orderByDesc('id')
            ->get(['medicine_id', 'mrp'])
            ->unique('medicine_id')
            ->keyBy('medicine_id');

        $info = [];
        foreach ($ids as $id) {
            $rows = $sellable->where('medicine_id', $id);
            $info[$id] = [
                'units' => (int) $rows->sum('quantity'),
                'unit_mrp' => $rows->isNotEmpty()
                    ? (float) $rows->first()->mrp
                    : (isset($fallback[$id]) ? (float) $fallback[$id]->mrp : null),
            ];
        }

        return $info;
    }

    /** Online price for one pack, given the unit MRP. */
    public function packPrice(Medicine $medicine, ?PackSize $pack, ?float $unitMrp): ?array
    {
        if ($unitMrp === null) {
            return null;
        }
        $units = $pack?->units ?? 1;
        $mrp = round($unitMrp * $units, 2);
        $discountPercent = min(100, (float) $medicine->discount_percent + (float) ($pack?->extra_discount_percent ?? 0));
        $price = round($mrp - round($mrp * $discountPercent / 100, 2), 2);

        return [
            'mrp' => $mrp,
            'price' => $price,
            'discount_percent' => round($discountPercent, 2),
            'saving' => round($mrp - $price, 2),
            'unit_price' => $units > 0 ? round($price / $units, 2) : $price,
        ];
    }

    /**
     * Price a cart without touching stock: per-line prices across FEFO batches,
     * stock problems, delivery fee and totals.
     *
     * @param  list<array{medicine_id:int, quantity:int, pack_size_id?:int|null}>  $lines
     */
    public function quote(array $lines, int $branchId, ?string $deliveryType = null, ?int $areaId = null, ?float $flatDiscountPercent = null): array
    {
        $medicines = Medicine::with(['packSizes', 'generic:id,name'])
            ->whereIn('id', array_column($lines, 'medicine_id'))
            ->get()
            ->keyBy('id');

        $batches = Batch::query()
            ->whereIn('medicine_id', $medicines->keys())
            ->where('branch_id', $branchId)
            ->where('status', 'active')
            ->where('quantity', '>', 0)
            ->whereDate('expiry_date', '>', now()->toDateString())
            ->orderBy('expiry_date')
            ->orderBy('id')
            ->get(['medicine_id', 'quantity', 'mrp'])
            ->groupBy('medicine_id');

        $out = [];
        $subtotal = $discountTotal = 0.0;
        $requiresRx = false;
        $problems = [];

        foreach ($lines as $line) {
            $medicine = $medicines->get($line['medicine_id']);
            if (! $medicine || ! $medicine->is_active) {
                $problems[] = ['medicine_id' => $line['medicine_id'], 'message' => 'No longer available.'];

                continue;
            }
            $pack = ! empty($line['pack_size_id'])
                ? $medicine->packSizes->firstWhere('id', $line['pack_size_id'])
                : ($medicine->packSizes->firstWhere('is_default', true) ?? $medicine->packSizes->first());
            $packs = max(1, (int) $line['quantity']);
            $units = ($pack?->units ?? 1) * $packs;
            // POS: one discount % for the whole sale; online: each medicine's own discount.
            $discountPercent = $flatDiscountPercent ?? min(100, (float) $medicine->discount_percent + (float) ($pack?->extra_discount_percent ?? 0));

            // Walk the batches the way StockService::take would.
            $remaining = $units;
            $mrpTotal = 0.0;
            $discount = 0.0;
            foreach ($batches->get($medicine->id, collect()) as $batch) {
                if ($remaining === 0) {
                    break;
                }
                $qty = min($remaining, $batch->quantity);
                $part = round((float) $batch->mrp * $qty, 2);
                $mrpTotal += $part;
                $discount += round($part * $discountPercent / 100, 2);
                $remaining -= $qty;
            }
            $available = (int) $batches->get($medicine->id, collect())->sum('quantity');

            if ($remaining > 0) {
                $problems[] = [
                    'medicine_id' => $medicine->id,
                    'message' => "Only {$available} {$medicine->unit_name} of {$medicine->full_name} in stock.",
                    'available_units' => $available,
                ];
            }

            $requiresRx = $requiresRx || $medicine->rx_required;
            $subtotal += $mrpTotal;
            $discountTotal += $discount;

            $out[] = [
                'medicine_id' => $medicine->id,
                'slug' => $medicine->slug,
                'name' => $medicine->full_name,
                'generic' => $medicine->generic?->name,
                'pack_size_id' => $pack?->id,
                'pack_name' => $pack?->name,
                'quantity' => $packs,
                'units' => $units,
                'rx_required' => $medicine->rx_required,
                'in_stock' => $remaining === 0,
                'available_units' => $available,
                'mrp_total' => round($mrpTotal, 2),
                'discount' => round($discount, 2),
                'total' => round($mrpTotal - $discount, 2),
            ];
        }

        $deliveryFee = 0.0;
        $deliveryError = null;
        if ($deliveryType) {
            try {
                [, $deliveryFee] = $this->orders->deliveryFee(DeliveryType::from($deliveryType), $areaId);
            } catch (BusinessException $e) {
                $deliveryError = $e->getMessage();
            }
        }

        return [
            'lines' => $out,
            'subtotal' => round($subtotal, 2),
            'discount_total' => round($discountTotal, 2),
            'delivery_fee' => round($deliveryFee, 2),
            'total' => round($subtotal - $discountTotal + $deliveryFee, 2),
            'requires_rx' => $requiresRx,
            'rx_item_count' => collect($out)->where('rx_required', true)->count(),
            'problems' => $problems,
            'delivery_error' => $deliveryError,
            'can_checkout' => $problems === [] && $deliveryError === null && $out !== [],
        ];
    }
}
