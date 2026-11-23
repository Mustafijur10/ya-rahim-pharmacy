<?php

namespace App\Services;

use App\Exceptions\BusinessException;
use App\Models\ApprovalRequest;
use App\Models\SaleReturn;
use App\Models\StockAdjustment;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * "Cashier asks, manager approves" requests:
 *  - discount     : POS discount above the cashier limit
 *  - refund       : a return/refund requested by a cashier
 *  - stock_adjustment : stock fix requested by someone with approval-level rights
 *  - rx_release   : cashier selling an Rx medicine; a pharmacist releases it
 */
class ApprovalService
{
    /** Who may approve each type (module => level "full"). */
    private const APPROVER_MODULE = [
        'discount' => 'discount_override',
        'refund' => 'returns',
        'stock_adjustment' => 'stock_adjustment',
        'rx_release' => 'rx',
    ];

    public function request(
        string $type,
        int $branchId,
        User $requester,
        ?Model $approvable = null,
        ?float $amount = null,
        array $data = [],
        ?string $reason = null,
    ): ApprovalRequest {
        if (! isset(self::APPROVER_MODULE[$type])) {
            throw new BusinessException("Unknown approval type: $type");
        }

        return ApprovalRequest::create([
            'branch_id' => $branchId,
            'type' => $type,
            'approvable_type' => $approvable?->getMorphClass(),
            'approvable_id' => $approvable?->getKey(),
            'requested_by' => $requester->id,
            'status' => 'pending',
            'amount' => $amount,
            'data' => $data,
            'reason' => $reason,
        ]);
    }

    public function approve(ApprovalRequest $request, User $approver, ?string $note = null): ApprovalRequest
    {
        $this->assertCanDecide($request, $approver);

        return DB::transaction(function () use ($request, $approver, $note) {
            $request = ApprovalRequest::whereKey($request->id)->lockForUpdate()->firstOrFail();
            if ($request->status !== 'pending') {
                throw new BusinessException('This request has already been decided.');
            }

            $request->update([
                'status' => 'approved',
                'decided_by' => $approver->id,
                'decision_note' => $note,
                'decided_at' => now(),
            ]);

            $subject = $request->approvable;
            match (true) {
                $request->type === 'refund' && $subject instanceof SaleReturn => app(PosService::class)->completeReturn($subject, $approver),
                $request->type === 'stock_adjustment' && $subject instanceof StockAdjustment => app(StockService::class)->applyAdjustment($subject, $approver),
                default => null, // discount / rx_release are used later by the POS sale
            };

            activity('approvals')->performedOn($request)->causedBy($approver)->log("Approved {$request->type}");

            return $request->refresh();
        });
    }

    public function reject(ApprovalRequest $request, User $approver, ?string $note = null): ApprovalRequest
    {
        $this->assertCanDecide($request, $approver);

        return DB::transaction(function () use ($request, $approver, $note) {
            $request = ApprovalRequest::whereKey($request->id)->lockForUpdate()->firstOrFail();
            if ($request->status !== 'pending') {
                throw new BusinessException('This request has already been decided.');
            }

            $request->update([
                'status' => 'rejected',
                'decided_by' => $approver->id,
                'decision_note' => $note,
                'decided_at' => now(),
            ]);

            $subject = $request->approvable;
            if ($subject instanceof SaleReturn || $subject instanceof StockAdjustment) {
                $subject->update(['status' => 'rejected']);
            }

            activity('approvals')->performedOn($request)->causedBy($approver)->log("Rejected {$request->type}");

            return $request->refresh();
        });
    }

    /**
     * Use an approved discount / rx_release request in a POS sale. Each approval works once,
     * only for the person who asked, and only on the day it was approved.
     */
    public function consume(int $approvalId, string $type, User $requester, Model $usedFor, ?float $minAmount = null): ApprovalRequest
    {
        $request = ApprovalRequest::whereKey($approvalId)->lockForUpdate()->first();

        $valid = $request
            && $request->type === $type
            && $request->status === 'approved'
            && $request->requested_by === $requester->id
            && $request->approvable_id === null
            && $request->decided_at?->isToday()
            && ($minAmount === null || (float) $request->amount >= $minAmount);

        if (! $valid) {
            throw new BusinessException('The approval is missing, already used, expired or does not cover this sale.', 'invalid_approval', 403);
        }

        $request->update([
            'approvable_type' => $usedFor->getMorphClass(),
            'approvable_id' => $usedFor->getKey(),
        ]);

        return $request;
    }

    public function canDecide(string $type, User $user): bool
    {
        $module = self::APPROVER_MODULE[$type] ?? null;

        return $module !== null && $user->hasModuleAccess($module, 'full');
    }

    private function assertCanDecide(ApprovalRequest $request, User $approver): void
    {
        if (! $this->canDecide($request->type, $approver)) {
            throw new BusinessException('You are not allowed to decide this request.', 'forbidden', 403);
        }
        if ($request->requested_by === $approver->id) {
            throw new BusinessException('You cannot approve your own request.', 'forbidden', 403);
        }
    }
}
