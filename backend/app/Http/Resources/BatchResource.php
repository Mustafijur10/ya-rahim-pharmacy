<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** One inventory row (a batch on the shelf). @mixin \App\Models\Batch */
class BatchResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $canSeeCost = $request->user()?->hasModuleAccess('profit', 'full', 'view')
            || $request->user()?->hasModuleAccess('purchases', 'full');
        $pack = $this->relationLoaded('medicine') && $this->medicine->relationLoaded('defaultPackSize')
            ? $this->medicine->defaultPackSize
            : null;
        $perPack = $pack?->units ?: 1;

        return [
            'id' => $this->id,
            'batch_no' => $this->batch_no,
            'expiry_date' => $this->expiry_date->toDateString(),
            'expiry_level' => $this->expiryLevel(),
            'days_to_expiry' => (int) now()->startOfDay()->diffInDays($this->expiry_date, false),
            'quantity' => $this->quantity,
            'quantity_packs' => round($this->quantity / $perPack, 1),
            'pack_name' => $pack?->short_name,
            'rack' => $this->rack,
            'status' => $this->status,
            'mrp' => (float) $this->mrp,
            'mrp_per_pack' => round((float) $this->mrp * $perPack, 2),
            'cost_price' => $this->when($canSeeCost, fn () => (float) $this->cost_price),
            'cost_per_pack' => $this->when($canSeeCost, fn () => round((float) $this->cost_price * $perPack, 2)),
            'supplier' => $this->whenLoaded('supplier', fn () => $this->supplier?->only(['id', 'name'])),
            'medicine' => $this->whenLoaded('medicine', fn () => [
                'id' => $this->medicine->id,
                'name' => $this->medicine->full_name,
                'generic' => $this->medicine->relationLoaded('generic') ? $this->medicine->generic?->name : null,
                'company' => $this->medicine->relationLoaded('company') ? $this->medicine->company?->name : null,
                'reorder_level' => $this->medicine->reorder_level,
                'barcode' => $this->medicine->barcode,
                'short_name' => trim($this->medicine->name.' '.$this->medicine->strength),
                'reorder_level_packs' => round($this->medicine->reorder_level / $perPack, 1),
                'rx_required' => $this->medicine->rx_required,
                'is_cold_chain' => $this->medicine->is_cold_chain,
            ]),
        ];
    }
}
