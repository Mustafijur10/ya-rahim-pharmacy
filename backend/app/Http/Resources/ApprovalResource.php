<?php

namespace App\Http\Resources;

use App\Models\ApprovalRequest;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin ApprovalRequest */
class ApprovalResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'status' => $this->status,
            'amount' => $this->amount !== null ? (float) $this->amount : null,
            'data' => $this->data,
            'reason' => $this->reason,
            'decision_note' => $this->decision_note,
            'requested_by' => $this->whenLoaded('requester', fn () => $this->requester?->only(['id', 'name'])),
            'decided_by' => $this->whenLoaded('decider', fn () => $this->decider?->only(['id', 'name'])),
            'used' => $this->approvable_id !== null && in_array($this->type, ['discount', 'rx_release'], true),
            'created_at' => $this->created_at,
            'decided_at' => $this->decided_at,
        ];
    }
}
