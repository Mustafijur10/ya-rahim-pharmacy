<?php

namespace App\Http\Controllers\Api\Admin;

use App\Enums\OrderStatus;
use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Http\Resources\DeliveryResource;
use App\Http\Resources\OrderResource;
use App\Models\Customer;
use App\Models\Order;
use App\Models\User;
use App\Services\DeliveryService;
use App\Services\OrderService;
use App\Services\PosService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class OrderController extends Controller
{
    public function __construct(private OrderService $orders) {}

    /** ?status=&channel=online|shop|phone&search=&from=&to=&rx=1 */
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'status' => ['nullable', Rule::enum(OrderStatus::class)],
            'channel' => ['nullable', 'in:online,shop,phone,web'],
            'search' => ['nullable', 'string', 'max:60'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'rx' => ['nullable', 'boolean'],
            'per_page' => ['nullable', 'integer', 'min:5', 'max:100'],
        ]);

        $query = $this->scoped($request)
            ->with(['customer', 'delivery.rider'])
            ->withCount('items')
            ->latest();

        if (! empty($data['status'])) {
            $query->where('status', $data['status']);
        }
        match ($data['channel'] ?? null) {
            'web' => $query->online(),
            null => null,
            default => $query->where('channel', $data['channel']),
        };
        if (isset($data['rx'])) {
            $query->where('requires_rx', (bool) $data['rx']);
        }
        if (! empty($data['from'])) {
            $query->whereDate('created_at', '>=', $data['from']);
        }
        if (! empty($data['to'])) {
            $query->whereDate('created_at', '<=', $data['to']);
        }
        if (! empty($data['search'])) {
            $s = '%'.addcslashes($data['search'], '%_\\').'%';
            $query->where(fn (Builder $q) => $q->where('code', 'like', $s)
                ->orWhere('recipient_phone', 'like', $s)
                ->orWhere('recipient_name', 'like', $s)
                ->orWhereHas('customer', fn (Builder $c) => $c->where('name', 'like', $s)->orWhere('phone', 'like', $s)));
        }

        return OrderResource::collection($query->paginate($data['per_page'] ?? 25)->withQueryString())->response();
    }

    /** Counts per stage for the order pipeline header. */
    public function stats(Request $request): JsonResponse
    {
        $branchId = $request->user()->branch_id;
        $counts = Order::where('branch_id', $branchId)
            ->online()
            ->whereIn('status', ['new', 'rx_verification', 'packing', 'ready_for_pickup', 'out_for_delivery'])
            ->selectRaw('status, COUNT(*) c')
            ->groupBy('status')
            ->pluck('c', 'status');

        $today = Order::where('branch_id', $branchId)->online()->where('updated_at', '>=', now()->startOfDay());

        return response()->json([
            'new' => (int) ($counts['new'] ?? 0),
            'rx_verification' => (int) ($counts['rx_verification'] ?? 0),
            'packing' => (int) ($counts['packing'] ?? 0),
            'ready_for_pickup' => (int) ($counts['ready_for_pickup'] ?? 0),
            'out_for_delivery' => (int) ($counts['out_for_delivery'] ?? 0),
            'delivered_today' => (clone $today)->whereIn('status', ['delivered', 'completed'])->count(),
            'cancelled_today' => (clone $today)->where('status', 'cancelled')->count(),
        ]);
    }

    public function show(Request $request, Order $order): JsonResponse
    {
        $this->assertBranch($request, $order);

        return response()->json(['data' => new OrderResource($order->load([
            'items.batch', 'payments', 'customer', 'cashier', 'pharmacist', 'deliveryArea',
            'prescription.pages', 'prescription.verifier', 'delivery.rider', 'statusHistory.user',
        ]))]);
    }

    /** Phone order taken by staff. */
    public function storePhoneOrder(Request $request): JsonResponse
    {
        $data = $request->validate([
            'items' => ['required', 'array', 'min:1', 'max:50'],
            'items.*.medicine_id' => ['required', 'integer'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:500'],
            'items.*.pack_size_id' => ['nullable', 'integer'],
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'delivery_type' => ['required', 'in:express,standard,pickup'],
            'delivery_area_id' => ['nullable', 'integer'],
            'recipient_name' => ['required', 'string', 'max:100'],
            'recipient_phone' => ['required', 'string', 'max:20'],
            'delivery_address' => ['nullable', 'string', 'max:255'],
            'delivery_landmark' => ['nullable', 'string', 'max:255'],
            'prescription_id' => ['nullable', 'integer'],
            'customer_note' => ['nullable', 'string', 'max:500'],
        ]);

        $customer = ! empty($data['customer_id']) ? Customer::find($data['customer_id']) : null;
        $order = $this->orders->placeOnline($data + [
            'channel' => 'phone',
            'payment_method' => 'cash',
            'branch_id' => $request->user()->branch_id,
        ], $customer, $request->user());

        return response()->json(['data' => new OrderResource($order->load(['items', 'customer']))], 201);
    }

    public function verifyRx(Request $request, Order $order): JsonResponse
    {
        $this->assertBranch($request, $order);
        $note = $request->validate(['note' => ['nullable', 'string', 'max:300']])['note'] ?? null;

        return response()->json(['data' => new OrderResource($this->orders->verifyPrescription($order, $request->user(), $note))]);
    }

    public function rejectRx(Request $request, Order $order): JsonResponse
    {
        $this->assertBranch($request, $order);
        $reason = $request->validate(['reason' => ['required', 'string', 'max:300']])['reason'];

        return response()->json(['data' => new OrderResource($this->orders->rejectPrescription($order, $request->user(), $reason))]);
    }

    /** Move an order along: packing, ready_for_pickup, completed… */
    public function transition(Request $request, Order $order): JsonResponse
    {
        $this->assertBranch($request, $order);
        $data = $request->validate([
            'status' => ['required', Rule::in(['packing', 'ready_for_pickup', 'completed'])],
            'note' => ['nullable', 'string', 'max:300'],
        ]);

        $order = $this->orders->transition($order, OrderStatus::from($data['status']), $request->user(), $data['note'] ?? null);

        return response()->json(['data' => new OrderResource($order)]);
    }

    public function cancel(Request $request, Order $order): JsonResponse
    {
        $this->assertBranch($request, $order);
        $reason = $request->validate(['reason' => ['required', 'string', 'max:300']])['reason'];

        return response()->json(['data' => new OrderResource($this->orders->cancel($order, $request->user(), $reason))]);
    }

    public function collectPickup(Request $request, Order $order): JsonResponse
    {
        $this->assertBranch($request, $order);
        $data = $request->validate([
            'payments' => ['present', 'array', 'max:4'],
            'payments.*.method' => ['required', Rule::in(['cash', 'bkash', 'nagad', 'card'])],
            'payments.*.amount' => ['required', 'numeric', 'min:0'],
            'payments.*.received_amount' => ['nullable', 'numeric', 'min:0'],
            'payments.*.transaction_id' => ['nullable', 'string', 'max:100'],
        ]);

        return response()->json(['data' => new OrderResource($this->orders->completePickup($order, $data['payments'], $request->user()))]);
    }

    public function assignRider(Request $request, Order $order, DeliveryService $deliveries): JsonResponse
    {
        $this->assertBranch($request, $order);
        $data = $request->validate([
            'rider_id' => ['nullable', 'integer', 'required_without:courier_name'],
            'courier_name' => ['nullable', 'string', 'max:100'],
        ]);
        $rider = ! empty($data['rider_id']) ? User::staff()->where('branch_id', $order->branch_id)->findOrFail($data['rider_id']) : null;

        $delivery = $deliveries->assign($order, $request->user(), $rider, $data['courier_name'] ?? null);

        return response()->json(['data' => new DeliveryResource($delivery->load('rider'))]);
    }

    /** Return / refund for a completed sale. Cashiers' requests wait for a manager. */
    public function requestReturn(Request $request, Order $order, PosService $pos): JsonResponse
    {
        $this->assertBranch($request, $order);
        $data = $request->validate([
            'items' => ['required', 'array', 'min:1'],
            'items.*.order_item_id' => ['required', 'integer'],
            'items.*.quantity' => ['required', 'integer', 'min:1'],
            'items.*.restock' => ['boolean'],
            'refund_method' => ['required', Rule::in(['cash', 'bkash', 'nagad', 'card', 'store_credit'])],
            'reason' => ['required', 'string', 'max:255'],
        ]);

        $return = $pos->requestReturn($request->user(), $order, $data['items'], $data['refund_method'], $data['reason']);

        return response()->json(['data' => $return->load('items')], 201);
    }

    private function scoped(Request $request): Builder
    {
        return Order::where('branch_id', $request->user()->branch_id);
    }

    private function assertBranch(Request $request, Order $order): void
    {
        if ($order->branch_id !== $request->user()->branch_id) {
            throw new BusinessException('Order not found.', 'not_found', 404);
        }
    }
}
