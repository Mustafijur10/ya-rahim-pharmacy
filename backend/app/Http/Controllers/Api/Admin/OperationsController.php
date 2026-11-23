<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Delivery;
use App\Models\TemperatureLog;
use App\Models\User;
use App\Services\DeliveryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Riders (assignment list, cash hand-over) and the fridge temperature log. */
class OperationsController extends Controller
{
    public function riders(Request $request, DeliveryService $deliveries): JsonResponse
    {
        $riders = User::staff()->role('rider')
            ->where('branch_id', $request->user()->branch_id)
            ->where('status', 'active')
            ->withCount(['deliveries as active_deliveries' => fn ($q) => $q->whereIn('status', ['assigned', 'picked_up'])])
            ->orderBy('name')
            ->get();

        return response()->json([
            'data' => $riders->map(fn (User $r) => [
                'id' => $r->id,
                'name' => $r->name,
                'phone' => $r->phone,
                'staff_note' => $r->staff_note,
                'active_deliveries' => $r->active_deliveries,
                'cash_held' => $deliveries->cashHeld($r),
                'last_active_at' => $r->last_active_at,
            ]),
        ]);
    }

    public function settleRider(Request $request, User $rider, DeliveryService $deliveries): JsonResponse
    {
        abort_unless($rider->hasRole('rider') && $rider->branch_id === $request->user()->branch_id, 404);

        return response()->json(['settled' => $deliveries->settleCash($rider, $request->user())]);
    }

    public function deliveries(Request $request): JsonResponse
    {
        $status = $request->validate(['status' => ['nullable', 'in:assigned,picked_up,delivered,failed,returned']])['status'] ?? null;

        $query = Delivery::whereHas('order', fn ($q) => $q->where('branch_id', $request->user()->branch_id))
            ->with(['order:id,code,recipient_name,recipient_phone,delivery_address,total,status,delivery_type', 'rider:id,name'])
            ->latest('assigned_at');
        if ($status) {
            $query->where('status', $status);
        }

        return response()->json($query->paginate(30));
    }

    public function temperatures(Request $request): JsonResponse
    {
        return response()->json(
            TemperatureLog::where('branch_id', $request->user()->branch_id)->with('user:id,name')->latest('recorded_at')->paginate(30)
        );
    }

    public function logTemperature(Request $request): JsonResponse
    {
        $data = $request->validate([
            'temperature' => ['required', 'numeric', 'between:-30,50'],
            'location' => ['nullable', 'string', 'max:30'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $log = TemperatureLog::create($data + [
            'branch_id' => $request->user()->branch_id,
            'user_id' => $request->user()->id,
            'location' => $data['location'] ?? 'Fridge',
            'recorded_at' => now(),
        ]);

        // Insulin and vaccines must stay at 2–8 °C.
        $outOfRange = $log->temperature < 2 || $log->temperature > 8;
        if ($outOfRange) {
            activity('cold_chain')->causedBy($request->user())->withProperties(['temperature' => $log->temperature])->log('Fridge temperature out of range');
        }

        return response()->json(['data' => $log, 'out_of_range' => $outOfRange], 201);
    }
}
