<?php

namespace App\Http\Resources;

use App\Models\Order;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Order */
class OrderResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $staff = (bool) $request->user()?->is_staff;
        $canSeeCost = $staff && $request->user()->hasModuleAccess('profit', 'full', 'view');

        return [
            'id' => $this->id,
            'code' => $this->code,
            'channel' => $this->channel->value,
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'delivery_type' => $this->delivery_type->value,
            'recipient_name' => $this->recipient_name,
            'recipient_phone' => $this->recipient_phone,
            'delivery_address' => $this->delivery_address,
            'delivery_landmark' => $this->delivery_landmark,
            'delivery_area' => $this->whenLoaded('deliveryArea', fn () => $this->deliveryArea?->only(['id', 'name'])),
            'subtotal' => (float) $this->subtotal,
            'discount_total' => (float) $this->discount_total,
            'delivery_fee' => (float) $this->delivery_fee,
            'total' => (float) $this->total,
            'paid_amount' => (float) $this->paid_amount,
            'balance_due' => round($this->balanceDue(), 2),
            'payment_status' => $this->payment_status,
            'payment_preference' => $this->payment_preference,
            'requires_rx' => $this->requires_rx,
            'customer_note' => $this->customer_note,
            'staff_note' => $this->when($staff, $this->staff_note),
            'cancel_reason' => $this->cancel_reason,
            'placed_at' => $this->placed_at,
            'verified_at' => $this->verified_at,
            'completed_at' => $this->completed_at,
            'cancelled_at' => $this->cancelled_at,
            'created_at' => $this->created_at,
            'items_count' => $this->whenCounted('items'),
            'rx_items_count' => $this->whenCounted('rx_items'),
            'customer' => $this->whenLoaded('customer', fn () => $this->customer ? [
                'id' => $this->customer->id,
                'name' => $this->customer->name,
                'phone' => $this->customer->phone,
            ] : null),
            'cashier' => $this->whenLoaded('cashier', fn () => $this->cashier?->only(['id', 'name'])),
            'pharmacist' => $this->whenLoaded('pharmacist', fn () => $this->pharmacist ? [
                'id' => $this->pharmacist->id,
                'name' => $this->pharmacist->name,
                'registration_no' => $this->pharmacist->registration_no,
            ] : null),
            'items' => $this->whenLoaded('items', fn () => $this->items->map(fn ($i) => [
                'id' => $i->id,
                'medicine_id' => $i->medicine_id,
                'pack_size_id' => $i->pack_size_id,
                'name' => $i->name,
                'quantity' => $i->quantity,
                'quantity_label' => $i->quantity_label,
                'unit_mrp' => (float) $i->unit_mrp,
                'discount' => (float) $i->discount,
                'line_total' => (float) $i->line_total,
                'rx_required' => $i->rx_required,
                'rx_status' => $i->rx_status,
                'returned_quantity' => $i->returned_quantity,
                'batch' => $staff && $i->relationLoaded('batch') && $i->batch ? [
                    'id' => $i->batch->id,
                    'batch_no' => $i->batch->batch_no,
                    'expiry_date' => $i->batch->expiry_date->toDateString(),
                    'rack' => $i->batch->rack,
                ] : null,
                'unit_cost' => $this->when($canSeeCost, fn () => (float) $i->unit_cost),
            ])),
            'payments' => $this->whenLoaded('payments', fn () => $this->payments->map(fn ($p) => [
                'id' => $p->id,
                'method' => $p->method->value,
                'method_label' => $p->method->label(),
                'amount' => (float) $p->amount,
                'received_amount' => $p->received_amount !== null ? (float) $p->received_amount : null,
                'change_amount' => $p->change_amount !== null ? (float) $p->change_amount : null,
                'transaction_id' => $p->transaction_id,
                'status' => $p->status,
                'paid_at' => $p->paid_at,
            ])),
            'prescription' => $this->whenLoaded('prescription', fn () => $this->prescription ? new PrescriptionResource($this->prescription) : null),
            'delivery' => $this->whenLoaded('delivery', fn () => $this->delivery ? new DeliveryResource($this->delivery) : null),
            'history' => $this->whenLoaded('statusHistory', fn () => $this->statusHistory->map(fn ($h) => [
                'from' => $h->from_status,
                'to' => $h->to_status,
                'note' => $h->note,
                'by' => $staff && $h->relationLoaded('user') ? $h->user?->name : null,
                'at' => $h->created_at,
            ])),
        ];
    }
}
