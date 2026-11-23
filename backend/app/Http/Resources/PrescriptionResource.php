<?php

namespace App\Http\Resources;

use App\Models\Prescription;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Prescription */
class PrescriptionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $staff = (bool) $request->user()?->is_staff;
        $base = $staff ? '/api/admin/prescriptions/' : '/api/account/prescriptions/';

        return [
            'id' => $this->id,
            'status' => $this->status,
            'doctor_name' => $this->doctor_name,
            'prescribed_at' => $this->prescribed_at?->toDateString(),
            'save_for_refill' => $this->save_for_refill,
            'pharmacist_note' => $this->pharmacist_note,
            'reject_reason' => $this->reject_reason,
            'contact_name' => $this->contact_name,
            'contact_phone' => $this->when($staff, $this->contact_phone),
            'delivery_type' => $this->delivery_type,
            'customer_note' => $this->customer_note,
            'verified_at' => $this->verified_at,
            'verified_by' => $this->whenLoaded('verifier', fn () => $this->verifier ? [
                'name' => $this->verifier->name,
                'registration_no' => $this->verifier->registration_no,
            ] : null),
            'customer' => $this->when($staff && $this->relationLoaded('customer'), fn () => $this->customer?->only(['id', 'name', 'phone'])),
            'pages' => $this->whenLoaded('pages', fn () => $this->pages->map(fn ($p, $i) => [
                'id' => $p->id,
                'mime' => $p->mime,
                'size' => $p->size,
                'url' => $base.$this->id.'/pages/'.$p->id,
            ])->values()),
            'created_at' => $this->created_at,
        ];
    }
}
