<?php

namespace App\Services;

use App\Enums\PaymentMethod;
use App\Exceptions\BusinessException;
use App\Models\Payment;
use App\Models\SaleReturn;
use App\Models\Shift;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class ShiftService
{
    public function open(User $user, float $openingCash, string $counter = 'Counter 1'): Shift
    {
        if (! $user->hasModuleAccess('pos', 'full')) {
            throw new BusinessException('Your role cannot use the counter.', 'forbidden', 403);
        }
        if ($openingCash < 0) {
            throw new BusinessException('Opening cash cannot be negative.');
        }

        return DB::transaction(function () use ($user, $openingCash, $counter) {
            // Lock the user's row so a double-click can't open two shifts.
            User::whereKey($user->id)->lockForUpdate()->first();
            if (Shift::where('user_id', $user->id)->where('status', 'open')->exists()) {
                throw new BusinessException('You already have an open shift.', 'shift_already_open');
            }

            return Shift::create([
                'branch_id' => $user->branch_id,
                'user_id' => $user->id,
                'counter_name' => $counter,
                'opened_at' => now(),
                'opening_cash' => round($openingCash, 2),
                'status' => 'open',
            ]);
        });
    }

    /**
     * Cash drawer figures, as on the Cashier home screen:
     * expected = opening cash + cash sales − cash refunds.
     */
    public function summary(Shift $shift): array
    {
        $payments = Payment::where('shift_id', $shift->id)->where('status', 'success');

        $byMethod = (clone $payments)
            ->selectRaw('method, SUM(amount) total, COUNT(*) count')
            ->groupBy('method')
            ->get()
            ->mapWithKeys(fn ($row) => [$row->method->value => ['total' => round((float) $row->total, 2), 'count' => (int) $row->count]]);

        $cashSales = (float) ($byMethod[PaymentMethod::Cash->value]['total'] ?? 0);
        $cashRefunds = (float) SaleReturn::where('shift_id', $shift->id)
            ->where('status', 'completed')
            ->where('refund_method', 'cash')
            ->sum('refund_amount');

        $receipts = DB::table('orders')->where('shift_id', $shift->id)->whereNull('deleted_at')->count();

        return [
            'opening_cash' => round((float) $shift->opening_cash, 2),
            'cash_sales' => round($cashSales, 2),
            'cash_refunds' => round($cashRefunds, 2),
            'expected_cash' => round((float) $shift->opening_cash + $cashSales - $cashRefunds, 2),
            'by_method' => $byMethod->all(),
            'receipts' => $receipts,
        ];
    }

    public function close(Shift $shift, User $user, float $countedCash, ?string $note = null): Shift
    {
        if ($shift->user_id !== $user->id && ! $user->hasModuleAccess('pos', 'full')) {
            throw new BusinessException('You cannot close this shift.', 'forbidden', 403);
        }

        return DB::transaction(function () use ($shift, $user, $countedCash, $note) {
            $shift = Shift::whereKey($shift->id)->lockForUpdate()->firstOrFail();
            if (! $shift->isOpen()) {
                throw new BusinessException('This shift is already closed.');
            }

            $expected = $this->summary($shift)['expected_cash'];
            $difference = round($countedCash - $expected, 2);

            $shift->update([
                'closed_at' => now(),
                'expected_cash' => $expected,
                'counted_cash' => round($countedCash, 2),
                'difference' => $difference,
                'status' => 'closed',
                'note' => $note,
            ]);

            if (abs($difference) > 0.009) {
                activity('shifts')->performedOn($shift)->causedBy($user)
                    ->withProperties(['expected' => $expected, 'counted' => $countedCash, 'difference' => $difference])
                    ->log('Cash difference at shift close');
            }

            return $shift->refresh();
        });
    }
}
