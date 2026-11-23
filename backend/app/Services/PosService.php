<?php

namespace App\Services;

use App\Enums\DeliveryType;
use App\Enums\OrderChannel;
use App\Enums\OrderStatus;
use App\Enums\StockMovementType;
use App\Exceptions\ApprovalRequiredException;
use App\Exceptions\BusinessException;
use App\Models\HeldSale;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\SaleReturn;
use App\Models\Setting;
use App\Models\User;
use App\Support\Sequence;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class PosService
{
    public function __construct(
        private OrderService $orders,
        private StockService $stock,
        private ApprovalService $approvals,
    ) {}

    public function maxCashierDiscount(): float
    {
        return (float) Setting::get('pos.max_cashier_discount_percent', config('pharmacy.max_cashier_discount_percent'));
    }

    /**
     * Counter sale.
     *
     * $data keys:
     *  items             list of {medicine_id, quantity (packs), pack_size_id?}
     *  customer_id       optional (walk-in when empty)
     *  discount_percent  % off MRP for the whole sale (default 0)
     *  discount_approval_id  approved "discount" request when above the cashier limit
     *  rx_approval_id    approved "rx_release" request when a cashier sells Rx medicines
     *  payments          list of {method, amount, received_amount?, transaction_id?}
     *  note              optional
     */
    public function sell(User $cashier, array $data): Order
    {
        $shift = $cashier->openShift()->first();
        if (! $shift) {
            throw new BusinessException('Open your shift before selling.', 'shift_closed');
        }

        $discountPercent = round((float) ($data['discount_percent'] ?? 0), 2);
        if ($discountPercent < 0 || $discountPercent > 100) {
            throw new BusinessException('Discount must be between 0 and 100%.');
        }
        $needsDiscountApproval = $discountPercent > $this->maxCashierDiscount()
            && ! $cashier->hasModuleAccess('discount_override', 'full');

        if ($needsDiscountApproval && empty($data['discount_approval_id'])) {
            if (! $cashier->hasModuleAccess('discount_override', 'approval')) {
                throw new BusinessException("Discounts above {$this->maxCashierDiscount()}% are not allowed for your role.", 'forbidden', 403);
            }
            throw new ApprovalRequiredException(
                "A discount above {$this->maxCashierDiscount()}% needs manager approval.",
                'discount',
                ['discount_percent' => $discountPercent],
            );
        }

        return DB::transaction(function () use ($cashier, $shift, $data, $discountPercent, $needsDiscountApproval) {
            $order = Order::create([
                'code' => $this->orders->newCode(OrderChannel::Shop),
                'branch_id' => $shift->branch_id,
                'channel' => OrderChannel::Shop,
                'customer_id' => $data['customer_id'] ?? null,
                'status' => OrderStatus::Completed,
                'delivery_type' => DeliveryType::Counter,
                'cashier_id' => $cashier->id,
                'shift_id' => $shift->id,
                'staff_note' => $data['note'] ?? null,
                'placed_at' => now(),
                'completed_at' => now(),
            ]);

            $canReleaseRx = $cashier->hasModuleAccess('rx', 'full');
            $this->orders->addItems($order, $data['items'] ?? [], 'pos', $discountPercent, $cashier, rxReleased: true);

            if ($order->requires_rx) {
                if ($canReleaseRx) {
                    $order->pharmacist_id = $cashier->id;
                } elseif (! empty($data['rx_approval_id'])) {
                    $approval = $this->approvals->consume((int) $data['rx_approval_id'], 'rx_release', $cashier, $order);
                    $order->pharmacist_id = $approval->decided_by;
                } else {
                    throw new ApprovalRequiredException('Prescription medicines need a pharmacist to approve release.', 'rx_release');
                }
                $order->verified_at = now();
                $order->save();
            }

            if ($needsDiscountApproval) {
                $this->approvals->consume((int) $data['discount_approval_id'], 'discount', $cashier, $order, $discountPercent);
            }

            $this->orders->recordPayments($order, $data['payments'] ?? [], $cashier, $shift);
            $this->orders->logStatus($order, null, OrderStatus::Completed, $cashier, 'Counter sale');
            $this->orders->recordCustomerPurchase($order);

            if ($discountPercent > 0) {
                activity('pos')->performedOn($order)->causedBy($cashier)
                    ->withProperties(['discount_percent' => $discountPercent, 'discount' => $order->discount_total])
                    ->log('Discount given');
            }

            return $order->load(['items', 'payments']);
        });
    }

    /* ---------------- Held sales ---------------- */

    public function hold(User $cashier, array $cart, ?string $label = null, ?int $customerId = null): HeldSale
    {
        if (empty($cart['items'])) {
            throw new BusinessException('There is nothing to hold.');
        }

        return HeldSale::create([
            'branch_id' => $cashier->branch_id,
            'user_id' => $cashier->id,
            'shift_id' => $cashier->openShift()->value('id'),
            'customer_id' => $customerId,
            'label' => $label,
            'cart' => $cart,
        ]);
    }

    /** @return Collection<int, HeldSale> */
    public function held(User $cashier): Collection
    {
        return HeldSale::with('customer')->where('branch_id', $cashier->branch_id)->latest()->get();
    }

    /** Takes the cart back out of "held" and returns it. */
    public function resume(User $cashier, HeldSale $held): array
    {
        if ($held->branch_id !== $cashier->branch_id) {
            throw new BusinessException('This held sale belongs to another branch.', 'forbidden', 403);
        }
        $cart = $held->cart;
        $held->delete();

        return $cart;
    }

    /* ---------------- Returns & refunds ---------------- */

    /**
     * Start a return. Staff with full "returns" rights complete it at once;
     * cashiers (approval level) create a request for a manager.
     *
     * @param  list<array{order_item_id:int, quantity:int, restock?:bool}>  $items  quantity in base units
     */
    public function requestReturn(User $user, Order $order, array $items, string $refundMethod, string $reason): SaleReturn
    {
        if (! $user->hasModuleAccess('returns', 'full', 'approval')) {
            throw new BusinessException('You do not have permission to process returns.', 'forbidden', 403);
        }
        if (! in_array($order->status, [OrderStatus::Completed, OrderStatus::Delivered], true)) {
            throw new BusinessException('Only completed or delivered orders can be returned.');
        }
        if ($items === []) {
            throw new BusinessException('Choose at least one item to return.');
        }

        $return = DB::transaction(function () use ($user, $order, $items, $refundMethod, $reason) {
            $orderItems = $order->items()->get()->keyBy('id');
            $pending = $this->pendingReturnQuantities($order);

            $return = SaleReturn::create([
                'code' => Sequence::code('RET', 'sale_return'),
                'order_id' => $order->id,
                'branch_id' => $order->branch_id,
                'refund_amount' => 0,
                'refund_method' => $refundMethod,
                'reason' => $reason,
                'status' => 'pending',
                'requested_by' => $user->id,
                'shift_id' => $user->openShift()->value('id'),
            ]);

            $total = 0;
            foreach ($items as $line) {
                /** @var OrderItem|null $item */
                $item = $orderItems->get($line['order_item_id']);
                $qty = (int) $line['quantity'];
                if (! $item) {
                    throw new BusinessException('An item does not belong to this order.');
                }
                $returnable = $item->quantity - $item->returned_quantity - ($pending[$item->id] ?? 0);
                if ($qty < 1 || $qty > $returnable) {
                    throw new BusinessException("You can return at most $returnable of {$item->name}.");
                }

                $amount = round((float) $item->line_total / $item->quantity * $qty, 2);
                $return->items()->create([
                    'order_item_id' => $item->id,
                    'batch_id' => $item->batch_id,
                    'quantity' => $qty,
                    'amount' => $amount,
                    'restock' => $line['restock'] ?? true,
                ]);
                $total += $amount;
            }
            $return->update(['refund_amount' => round($total, 2)]);

            return $return;
        });

        if ($user->hasModuleAccess('returns', 'full')) {
            return $this->completeReturn($return, $user);
        }

        $this->approvals->request(
            type: 'refund',
            branchId: $order->branch_id,
            requester: $user,
            approvable: $return,
            amount: (float) $return->refund_amount,
            data: ['order' => $order->code, 'return' => $return->code],
            reason: $reason,
        );

        return $return->refresh();
    }

    /** Put returned stock back and mark the refund done. Called directly or on approval. */
    public function completeReturn(SaleReturn $return, User $approver): SaleReturn
    {
        return DB::transaction(function () use ($return, $approver) {
            $return = SaleReturn::whereKey($return->id)->lockForUpdate()->firstOrFail();
            if (! in_array($return->status, ['pending', 'approved'], true)) {
                throw new BusinessException('This return has already been processed.');
            }

            foreach ($return->items()->with(['orderItem', 'batch'])->get() as $line) {
                OrderItem::whereKey($line->order_item_id)->increment('returned_quantity', $line->quantity);
                if ($line->restock && $line->batch) {
                    $this->stock->put($line->batch, $line->quantity, StockMovementType::SaleReturn, $return, $approver->id);
                }
            }

            $return->update([
                'status' => 'completed',
                'approved_by' => $approver->id,
                'shift_id' => $return->shift_id ?? $approver->openShift()->value('id'),
            ]);

            $order = Order::whereKey($return->order_id)->lockForUpdate()->firstOrFail();
            $fullyReturned = ! $order->items()->whereColumn('returned_quantity', '<', 'quantity')->exists();
            if ($fullyReturned) {
                $order->update(['payment_status' => 'refunded']);
            }

            activity('returns')->performedOn($return)->causedBy($approver)
                ->withProperties(['order' => $order->code, 'amount' => $return->refund_amount])
                ->log('Refund completed');

            return $return->refresh();
        });
    }

    /** @return array<int, int> order_item_id => units in returns not yet completed */
    private function pendingReturnQuantities(Order $order): array
    {
        return DB::table('sale_return_items')
            ->join('sale_returns', 'sale_returns.id', '=', 'sale_return_items.sale_return_id')
            ->where('sale_returns.order_id', $order->id)
            ->whereIn('sale_returns.status', ['pending', 'approved'])
            ->groupBy('sale_return_items.order_item_id')
            ->selectRaw('sale_return_items.order_item_id AS item_id, SUM(sale_return_items.quantity) AS qty')
            ->pluck('qty', 'item_id')
            ->map(fn ($v) => (int) $v)
            ->all();
    }
}
