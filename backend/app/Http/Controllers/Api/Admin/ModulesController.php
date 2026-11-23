<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Support\Features;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Spatie\Activitylog\Models\Activity;

/** Super admin — Modules & features. */
class ModulesController extends Controller
{
    public function index(): JsonResponse
    {
        $enabled = Features::all();
        $groups = [];
        foreach (config('pharmacy.features') as $groupKey => $group) {
            $items = [];
            foreach ($group['items'] as $key => $item) {
                $items[] = [
                    'key' => $key,
                    'label' => $item['label'],
                    'help' => $item['help'] ?? null,
                    'core' => (bool) ($item['core'] ?? false),
                    'requires' => $item['requires'] ?? null,
                    'enabled' => $enabled[$key],
                ];
            }
            $groups[] = ['key' => $groupKey, 'label' => $group['label'], 'items' => $items];
        }

        return response()->json([
            'groups' => $groups,
            'recent' => Activity::where('log_name', 'modules')->with('causer:id,name')->latest('id')->limit(10)->get(['id', 'description', 'causer_id', 'causer_type', 'created_at']),
        ]);
    }

    /** {"features": {"blood_donors": true, "card": false}, "pin": "1234"} — the PIN confirms who is saving. */
    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'features' => ['required', 'array', 'min:1'],
            'features.*' => ['boolean'],
            'pin' => ['nullable', 'digits_between:4,6'],
        ]);

        $user = $request->user();
        if (! empty($data['pin']) && (! $user->pin || ! Hash::check($data['pin'], $user->pin))) {
            throw ValidationException::withMessages(['pin' => 'Your PIN is not correct.']);
        }

        $before = Features::all();
        Features::update($data['features']);

        $labels = collect(Features::catalog())->map(fn ($i) => $i['label']);
        foreach ($data['features'] as $key => $on) {
            if (($before[$key] ?? null) !== (bool) $on) {
                activity('modules')->causedBy($user)->withProperties(['feature' => $key, 'on' => (bool) $on])
                    ->log($labels[$key].' turned '.($on ? 'on' : 'off'));
            }
        }

        return $this->index();
    }
}
