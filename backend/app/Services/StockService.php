<?php

namespace App\Services;

use App\Enums\StockMovementType;
use App\Exceptions\BusinessException;
use App\Exceptions\InsufficientStockException;
use App\Models\Batch;
use App\Models\Medicine;
use App\Models\StockAdjustment;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * The only place stock quantities change.
 *
 * - Sales take from the batch that expires first (FEFO) and never from expired batches.
 * - Batch rows are locked (SELECT … FOR UPDATE) for the whole transaction, so a POS sale
 *   and an online order cannot both take the last strip.
 * - Every change writes a stock_movement row with the balance after it.
 */
class StockService
{
    /**
     * Take units of a medicine from stock, oldest expiry first.
     *
     * @return list<array{batch: Batch, quantity: int}> what was taken from which batch
     *
     * @throws InsufficientStockException nothing is changed when stock is short
     */
    public function take(
        int $medicineId,
        int $branchId,
        int $units,
        StockMovementType $type = StockMovementType::Sale,
        ?Model $reference = null,
        ?int $userId = null,
    ): array {
        if ($units < 1) {
            throw new BusinessException('Quantity must be at least 1.');
        }

        return DB::transaction(function () use ($medicineId, $branchId, $units, $type, $reference, $userId) {
            $batches = Batch::query()
                ->where('medicine_id', $medicineId)
                ->where('branch_id', $branchId)
                ->where('status', 'active')
                ->where('quantity', '>', 0)
                ->whereDate('expiry_date', '>', now()->toDateString())
                ->orderBy('expiry_date')
                ->orderBy('id')
                ->lockForUpdate()
                ->get();

            $available = (int) $batches->sum('quantity');
            if ($available < $units) {
                $name = Medicine::withTrashed()->find($medicineId)?->full_name ?? "medicine #$medicineId";
                throw new InsufficientStockException($name, $available, $units, $medicineId);
            }

            $taken = [];
            $remaining = $units;
            foreach ($batches as $batch) {
                if ($remaining === 0) {
                    break;
                }
                $qty = min($remaining, $batch->quantity);
                $batch->quantity -= $qty;
                $batch->save();
                $this->record($batch, -$qty, $type, $reference, $userId);

                $taken[] = ['batch' => $batch, 'quantity' => $qty];
                $remaining -= $qty;
            }

            return $taken;
        });
    }

    /** Put units back into a specific batch (returns, cancellations, purchases). */
    public function put(
        Batch $batch,
        int $units,
        StockMovementType $type,
        ?Model $reference = null,
        ?int $userId = null,
        ?string $note = null,
    ): Batch {
        if ($units < 1) {
            throw new BusinessException('Quantity must be at least 1.');
        }

        return DB::transaction(function () use ($batch, $units, $type, $reference, $userId, $note) {
            $locked = Batch::whereKey($batch->id)->lockForUpdate()->firstOrFail();
            $locked->quantity += $units;
            $locked->save();
            $this->record($locked, $units, $type, $reference, $userId, $note);

            return $locked;
        });
    }

    /** Total sellable units (not expired, active) of a medicine in a branch. */
    public function available(int $medicineId, int $branchId): int
    {
        return (int) Batch::query()
            ->where('medicine_id', $medicineId)
            ->where('branch_id', $branchId)
            ->where('status', 'active')
            ->whereDate('expiry_date', '>', now()->toDateString())
            ->sum('quantity');
    }

    /**
     * Ask for a stock correction. Users with full stock-adjustment rights apply it at once;
     * users with "approval" rights create a request a manager must approve.
     */
    public function requestAdjustment(User $user, Batch $batch, int $quantity, string $reason, ?string $note = null): StockAdjustment
    {
        if ($quantity === 0) {
            throw new BusinessException('Adjustment quantity cannot be zero.');
        }
        if (! $user->hasModuleAccess('stock_adjustment', 'full', 'approval')) {
            throw new BusinessException('You do not have permission to adjust stock.', 'forbidden', 403);
        }

        return DB::transaction(function () use ($user, $batch, $quantity, $reason, $note) {
            $adjustment = StockAdjustment::create([
                'branch_id' => $batch->branch_id,
                'batch_id' => $batch->id,
                'quantity' => $quantity,
                'reason' => $reason,
                'note' => $note,
                'status' => 'pending',
                'requested_by' => $user->id,
            ]);

            if ($user->hasModuleAccess('stock_adjustment', 'full')) {
                return $this->applyAdjustment($adjustment, $user);
            }

            app(ApprovalService::class)->request(
                type: 'stock_adjustment',
                branchId: $batch->branch_id,
                requester: $user,
                approvable: $adjustment,
                amount: null,
                data: ['batch_no' => $batch->batch_no, 'quantity' => $quantity],
                reason: $reason.($note ? ": $note" : ''),
            );

            return $adjustment;
        });
    }

    public function applyAdjustment(StockAdjustment $adjustment, User $approver): StockAdjustment
    {
        if ($adjustment->status !== 'pending') {
            throw new BusinessException('This adjustment has already been decided.');
        }

        return DB::transaction(function () use ($adjustment, $approver) {
            $batch = Batch::whereKey($adjustment->batch_id)->lockForUpdate()->firstOrFail();
            $qty = $adjustment->quantity;

            if ($qty < 0 && $batch->quantity < abs($qty)) {
                throw new BusinessException("Batch {$batch->batch_no} only has {$batch->quantity} units; cannot remove ".abs($qty).'.');
            }

            $type = match (true) {
                $qty > 0 => StockMovementType::AdjustmentIn,
                $adjustment->reason === 'expired' => StockMovementType::Expired,
                $adjustment->reason === 'supplier_return' => StockMovementType::SupplierReturn,
                default => StockMovementType::AdjustmentOut,
            };

            $batch->quantity += $qty;
            $batch->save();
            $this->record($batch, $qty, $type, $adjustment, $approver->id, $adjustment->reason);

            $adjustment->update(['status' => 'approved', 'approved_by' => $approver->id, 'approved_at' => now()]);

            activity('stock')->performedOn($adjustment)->causedBy($approver)
                ->withProperties(['batch' => $batch->batch_no, 'quantity' => $qty, 'reason' => $adjustment->reason])
                ->log('Stock adjusted');

            return $adjustment->refresh();
        });
    }

    private function record(Batch $batch, int $signedQty, StockMovementType $type, ?Model $reference, ?int $userId, ?string $note = null): void
    {
        StockMovement::create([
            'branch_id' => $batch->branch_id,
            'batch_id' => $batch->id,
            'medicine_id' => $batch->medicine_id,
            'type' => $type,
            'quantity' => $signedQty,
            'balance_after' => $batch->quantity,
            'reference_type' => $reference?->getMorphClass(),
            'reference_id' => $reference?->getKey(),
            'user_id' => $userId,
            'note' => $note,
        ]);
    }
}
