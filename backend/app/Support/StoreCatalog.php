<?php

namespace App\Support;

use App\Models\Medicine;
use App\Services\PricingService;
use Illuminate\Support\Collection;

/** Shapes medicines for the public store, with live price and stock. */
class StoreCatalog
{
    public function __construct(private PricingService $pricing) {}

    /** Eager loads every card needs. */
    public const CARD_RELATIONS = ['generic:id,name,slug', 'company:id,name,slug', 'category:id,name,slug', 'packSizes'];

    /** @param  Collection<int, Medicine>  $medicines */
    public function cards(Collection $medicines, int $branchId): array
    {
        $info = $this->pricing->stockInfo($medicines->pluck('id'), $branchId);

        return $medicines->map(fn (Medicine $m) => $this->card($m, $info[$m->id] ?? ['units' => 0, 'unit_mrp' => null]))->values()->all();
    }

    public function card(Medicine $m, array $info): array
    {
        $pack = $m->packSizes->firstWhere('is_default', true) ?? $m->packSizes->first();
        $perPack = $pack?->units ?: 1;
        $packsInStock = intdiv($info['units'], $perPack);

        return [
            'id' => $m->id,
            'slug' => $m->slug,
            'name' => $m->name,
            'full_name' => $m->full_name,
            'strength' => $m->strength,
            'dosage_form' => $m->dosage_form,
            'generic' => $m->generic?->only(['name', 'slug']),
            'company' => $m->company?->only(['name', 'slug']),
            'category' => $m->category?->only(['name', 'slug']),
            'rx_required' => $m->rx_required,
            'is_cold_chain' => $m->is_cold_chain,
            'image' => $m->images[0] ?? null,
            'pack' => $pack ? ['id' => $pack->id, 'name' => $pack->name, 'short_name' => $pack->short_name, 'units' => $pack->units] : null,
            'price' => $this->pricing->packPrice($m, $pack, $info['unit_mrp']),
            'in_stock' => $packsInStock > 0,
            'stock_status' => match (true) {
                $packsInStock === 0 => 'out',
                $info['units'] < max(1, $m->reorder_level) => 'low',
                default => 'in_stock',
            },
        ];
    }

    public function detail(Medicine $m, int $branchId): array
    {
        // Full generic row here (the card list only loads id/name/slug).
        $m->load(['generic', 'company:id,name,slug', 'category:id,name,slug', 'packSizes']);
        $info = $this->pricing->stockInfo([$m->id], $branchId)[$m->id];
        $card = $this->card($m, $info);

        $alternatives = $m->generic_id
            ? Medicine::active()
                ->with(self::CARD_RELATIONS)
                ->where('generic_id', $m->generic_id)
                ->where('strength', $m->strength)
                ->whereKeyNot($m->id)
                ->orderByDesc('sold_count')
                ->limit(6)
                ->get()
            : collect();

        $pack = $m->packSizes->firstWhere('is_default', true) ?? $m->packSizes->first();

        return $card + [
            'description' => $m->description,
            'unit_name' => $m->unit_name,
            'packs_in_stock' => intdiv($info['units'], $pack?->units ?: 1),
            'pack_sizes' => $m->packSizes->map(fn ($p) => [
                'id' => $p->id,
                'name' => $p->name,
                'short_name' => $p->short_name,
                'units' => $p->units,
                'is_default' => $p->is_default,
                'price' => $this->pricing->packPrice($m, $p, $info['unit_mrp']),
                'in_stock' => $info['units'] >= $p->units,
            ])->values(),
            'info' => $m->generic ? [
                'therapeutic_class' => $m->generic->therapeutic_class,
                'overview' => $m->generic->overview,
                'indications' => $m->generic->indications,
                'side_effects' => $m->generic->side_effects,
                'precautions' => $m->generic->precautions,
                'storage' => $m->generic->storage,
            ] : null,
            'alternatives' => $this->cards($alternatives, $branchId),
        ];
    }
}
