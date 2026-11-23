<?php

namespace App\Services;

use App\Enums\StockMovementType;
use App\Exceptions\BusinessException;
use App\Models\Batch;
use App\Models\Purchase;
use App\Models\Supplier;
use App\Models\User;
use App\Support\Sequence;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class PurchaseService
{
    public function __construct(private StockService $stock) {}

    /**
     * Receive goods from a supplier: creates/increases batches and records stock movements.
     *
     * $data: supplier_id, invoice_no?, purchased_at?, discount?, paid?, note?,
     *        items: list of {medicine_id, batch_no, expiry_date, quantity (units), free_quantity?, unit_cost, mrp, rack?}
     */
    public function receive(User $user, array $data): Purchase
    {
        if (! $user->hasModuleAccess('purchases', 'full')) {
            throw new BusinessException('You do not have permission to enter purchases.', 'forbidden', 403);
        }
        if (empty($data['items'])) {
            throw new BusinessException('Add at least one item.');
        }
        $supplier = Supplier::findOrFail($data['supplier_id']);

        return DB::transaction(function () use ($user, $data, $supplier) {
            $purchase = Purchase::create([
                'code' => Sequence::code('PUR', 'purchase'),
                'branch_id' => $user->branch_id,
                'supplier_id' => $supplier->id,
                'invoice_no' => $data['invoice_no'] ?? null,
                'purchased_at' => $data['purchased_at'] ?? now()->toDateString(),
                'status' => 'received',
                'note' => $data['note'] ?? null,
                'created_by' => $user->id,
            ]);

            $subtotal = 0;
            foreach ($data['items'] as $line) {
                $expiry = Carbon::parse($line['expiry_date'])->startOfDay();
                if ($expiry->lte(now()->startOfDay())) {
                    throw new BusinessException("Batch {$line['batch_no']} is already expired.");
                }
                $qty = (int) $line['quantity'];
                $free = (int) ($line['free_quantity'] ?? 0);
                if ($qty < 1 || $free < 0) {
                    throw new BusinessException('Quantities must be positive.');
                }
                if ((float) $line['mrp'] < (float) $line['unit_cost']) {
                    throw new BusinessException("MRP is below cost for batch {$line['batch_no']}.");
                }

                $batch = Batch::where('branch_id', $user->branch_id)
                    ->where('medicine_id', $line['medicine_id'])
                    ->where('batch_no', $line['batch_no'])
                    ->lockForUpdate()
                    ->first();

                if ($batch && ! $batch->expiry_date->isSameDay($expiry)) {
                    throw new BusinessException("Batch {$line['batch_no']} already exists with a different expiry date.");
                }

                if (! $batch) {
                    $batch = Batch::create([
                        'branch_id' => $user->branch_id,
                        'medicine_id' => $line['medicine_id'],
                        'supplier_id' => $supplier->id,
                        'batch_no' => $line['batch_no'],
                        'expiry_date' => $expiry->toDateString(),
                        'cost_price' => $line['unit_cost'],
                        'mrp' => $line['mrp'],
                        'initial_quantity' => 0,
                        'quantity' => 0,
                        'rack' => $line['rack'] ?? null,
                        'status' => 'active',
                    ]);
                }

                $this->stock->put($batch, $qty + $free, StockMovementType::Purchase, $purchase, $user->id);
                $batch->increment('initial_quantity', $qty + $free);

                $lineTotal = round((float) $line['unit_cost'] * $qty, 2);
                $purchase->items()->create([
                    'medicine_id' => $line['medicine_id'],
                    'batch_id' => $batch->id,
                    'batch_no' => $line['batch_no'],
                    'expiry_date' => $expiry->toDateString(),
                    'quantity' => $qty,
                    'free_quantity' => $free,
                    'unit_cost' => $line['unit_cost'],
                    'mrp' => $line['mrp'],
                    'line_total' => $lineTotal,
                ]);
                $subtotal += $lineTotal;
            }

            $discount = round((float) ($data['discount'] ?? 0), 2);
            $total = round($subtotal - $discount, 2);
            $paid = round((float) ($data['paid'] ?? 0), 2);
            if ($total < 0 || $paid < 0 || $paid > $total) {
                throw new BusinessException('Check the discount and paid amounts.');
            }

            $purchase->update(['subtotal' => round($subtotal, 2), 'discount' => $discount, 'total' => $total, 'paid' => $paid]);
            Supplier::whereKey($supplier->id)->increment('balance', round($total - $paid, 2));

            return $purchase->load('items');
        });
    }
}
