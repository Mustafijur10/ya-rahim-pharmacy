<?php

namespace App\Http\Controllers\Api\Rider;

use App\Http\Controllers\Controller;
use App\Http\Resources\DeliveryResource;
use App\Models\Delivery;
use App\Services\DeliveryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The rider phone app. Riders only ever see their own deliveries. */
class RiderController extends Controller
{
    public function __construct(private DeliveryService $deliveries) {}

    /** Home screen: current delivery, next stops, today's counts, cash held. */
    public function today(Request $request): JsonResponse
    {
        $rider = $request->user();
        $open = $this->mine($request)
            ->whereIn('status', ['assigned', 'picked_up'])
            ->orderByRaw("FIELD(status, 'picked_up', 'assigned')")
            ->oldest('assigned_at')
            ->get();

        return response()->json([
            'current' => $open->first() ? new DeliveryResource($open->first()) : null,
            'next' => DeliveryResource::collection($open->slice(1)->values()),
            'counts' => [
                'to_deliver' => $open->count(),
                'delivered_today' => Delivery::where('rider_id', $rider->id)->where('status', 'delivered')->where('delivered_at', '>=', now()->startOfDay())->count(),
            ],
            'cash_held' => $this->deliveries->cashHeld($rider),
        ]);
    }

    public function history(Request $request): JsonResponse
    {
        return DeliveryResource::collection(
            $this->mine($request)->whereIn('status', ['delivered', 'failed', 'returned'])->latest('updated_at')->paginate(30)
        )->response();
    }

    public function show(Request $request, int $id): JsonResponse
    {
        return response()->json(['data' => new DeliveryResource($this->mine($request)->findOrFail($id))]);
    }

    public function pickUp(Request $request, int $id): JsonResponse
    {
        $delivery = $this->deliveries->pickUp($this->mine($request)->findOrFail($id), $request->user());

        return response()->json(['data' => new DeliveryResource($delivery->load(['order.deliveryArea']))]);
    }

    public function complete(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'digits:4'],
            'cash_collected' => ['required', 'numeric', 'min:0'],
        ]);

        $delivery = $this->deliveries->complete($this->mine($request)->findOrFail($id), $request->user(), $data['code'], (float) $data['cash_collected']);

        return response()->json([
            'data' => new DeliveryResource($delivery->load(['order.deliveryArea'])),
            'cash_held' => $this->deliveries->cashHeld($request->user()),
        ]);
    }

    public function fail(Request $request, int $id): JsonResponse
    {
        $reason = $request->validate(['reason' => ['required', 'string', 'max:200']])['reason'];

        return response()->json(['data' => new DeliveryResource($this->deliveries->fail($this->mine($request)->findOrFail($id), $request->user(), $reason))]);
    }

    private function mine(Request $request)
    {
        return Delivery::where('rider_id', $request->user()->id)
            ->with(['order' => fn ($q) => $q->withCount('items')->with('deliveryArea:id,name')]);
    }
}
