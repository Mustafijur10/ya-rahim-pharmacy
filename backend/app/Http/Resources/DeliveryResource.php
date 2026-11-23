<?php

namespace App\Http\Resources;

use App\Models\Delivery;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Delivery */
class DeliveryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $user = $request->user();
        // Only the customer who owns the order sees the code; riders must ask for it.
        $showCode = $user && ! $user->is_staff;

        return [
            'id' => $this->id,
            'order_id' => $this->order_id,
            'status' => $this->status,
            'rider' => $this->whenLoaded('rider', fn () => $this->rider ? ['id' => $this->rider->id, 'name' => $this->rider->name, 'phone' => $this->rider->phone] : null),
            'courier_name' => $this->courier_name,
            'cash_to_collect' => (float) $this->cash_to_collect,
            'cash_collected' => (float) $this->cash_collected,
            'cash_settled_at' => $this->cash_settled_at,
            'failed_reason' => $this->failed_reason,
            'assigned_at' => $this->assigned_at,
            'picked_up_at' => $this->picked_up_at,
            'delivered_at' => $this->delivered_at,
            'otp_code' => $this->when($showCode, fn () => $this->otp_code),
            'order' => $this->whenLoaded('order', fn () => [
                'id' => $this->order->id,
                'code' => $this->order->code,
                'delivery_type' => $this->order->delivery_type->value,
                'recipient_name' => $this->order->recipient_name,
                'recipient_phone' => $this->order->recipient_phone,
                'delivery_address' => $this->order->delivery_address,
                'delivery_landmark' => $this->order->delivery_landmark,
                'area' => $this->order->relationLoaded('deliveryArea') ? $this->order->deliveryArea?->name : null,
                'items_count' => $this->order->items_count ?? null,
                'total' => (float) $this->order->total,
                'status' => $this->order->status->value,
            ]),
        ];
    }
}
