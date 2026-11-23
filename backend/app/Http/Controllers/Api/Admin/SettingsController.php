<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\DeliveryArea;
use App\Models\Setting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SettingsController extends Controller
{
    /** Keys the owner may edit, with their validation rules. */
    private const RULES = [
        'store.name' => ['required', 'string', 'max:100'],
        'store.phone' => ['nullable', 'string', 'max:30'],
        'store.email' => ['nullable', 'email', 'max:150'],
        'store.address' => ['nullable', 'string', 'max:255'],
        'store.opening_hours' => ['nullable', 'string', 'max:100'],
        'store.drug_licence_no' => ['nullable', 'string', 'max:100'],
        'store.trade_licence_no' => ['nullable', 'string', 'max:100'],
        'store.map_url' => ['nullable', 'url', 'max:500'],
        'store.whatsapp' => ['nullable', 'string', 'max:30'],
        'store.area' => ['nullable', 'string', 'max:100'],
        'store.hours_sat_thu' => ['nullable', 'string', 'max:50'],
        'store.hours_friday' => ['nullable', 'string', 'max:50'],
        'store.delivery_hours' => ['nullable', 'string', 'max:50'],
        'store.tin_bin' => ['nullable', 'string', 'max:50'],
        'store.since_year' => ['nullable', 'integer', 'min:1900', 'max:2100'],
        'delivery.same_day_cutoff' => ['nullable', 'date_format:H:i'],
        'delivery.pickup_ready_minutes' => ['nullable', 'integer', 'min:5', 'max:600'],
        'delivery.express_hours' => ['nullable', 'integer', 'min:1', 'max:24'],
        'pos.max_cashier_discount_percent' => ['nullable', 'numeric', 'min:0', 'max:50'],
        'pos.receipt_footer' => ['nullable', 'string', 'max:300'],
        'payments.methods' => ['nullable', 'array'],
        'payments.methods.*' => ['in:cash,bkash,nagad,card'],
        'refill.remind_days_before' => ['nullable', 'integer', 'min:1', 'max:14'],
    ];

    public function index(): JsonResponse
    {
        $values = [];
        foreach (array_keys(self::RULES) as $key) {
            if (! str_ends_with($key, '.*')) {
                $values[$key] = Setting::get($key);
            }
        }

        return response()->json([
            'settings' => $values,
            'delivery_areas' => DeliveryArea::orderBy('sort_order')->get(),
        ]);
    }

    /** Body: {"settings": {"store.name": "…", …}} */
    public function update(Request $request): JsonResponse
    {
        // Setting keys contain dots ("store.name"); swap them for "__" so the validator
        // treats each key as one field instead of a nested path.
        $input = (array) $request->input('settings', []);
        $flat = collect($input)->mapWithKeys(fn ($v, $k) => [str_replace('.', '__', (string) $k) => $v])->all();
        $validated = validator($flat, collect(self::RULES)
            ->reject(fn ($r, $k) => str_ends_with($k, '.*'))
            ->mapWithKeys(fn ($r, $k) => [str_replace('.', '__', $k) => $r])
            ->all() + ['payments__methods.*' => self::RULES['payments.methods.*']])->validate();

        foreach ($validated as $flatKey => $value) {
            $key = str_replace('__', '.', $flatKey);
            if (array_key_exists($key, self::RULES)) {
                Setting::put($key, $value);
            }
        }

        // Keep the branch record in step with the store details shown on receipts.
        Branch::where('id', $request->user()->branch_id)->update(array_filter([
            'phone' => $validated['store__phone'] ?? null,
            'address' => $validated['store__address'] ?? null,
            'opening_hours' => $validated['store__opening_hours'] ?? null,
            'drug_licence_no' => $validated['store__drug_licence_no'] ?? null,
            'trade_licence_no' => $validated['store__trade_licence_no'] ?? null,
        ], fn ($v) => $v !== null));

        activity('settings')->causedBy($request->user())->withProperties(['keys' => array_keys($validated)])->log('Settings changed');

        return $this->index();
    }

    public function saveArea(Request $request, ?DeliveryArea $area = null): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'name_bn' => ['nullable', 'string', 'max:100'],
            'standard_fee' => ['required', 'numeric', 'min:0', 'max:10000'],
            'express_fee' => ['nullable', 'numeric', 'min:0', 'max:10000'],
            'express_available' => ['boolean'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'is_active' => ['boolean'],
        ]);
        $area ??= new DeliveryArea(['branch_id' => $request->user()->branch_id]);
        $area->fill($data)->save();

        return response()->json(['data' => $area], $area->wasRecentlyCreated ? 201 : 200);
    }
}
