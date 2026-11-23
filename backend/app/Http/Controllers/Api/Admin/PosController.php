<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\OrderResource;
use App\Models\Batch;
use App\Models\Customer;
use App\Models\HeldSale;
use App\Models\Medicine;
use App\Models\Order;
use App\Models\Setting;
use App\Services\PosService;
use App\Services\PricingService;
use App\Services\Sms\SmsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PosController extends Controller
{
    public function __construct(private PosService $pos) {}

    /**
     * Medicine search for the counter. Shows every brand of the generic, the batch that
     * will be sold next (FEFO), its rack, stock and price per pack.
     */
    public function search(Request $request): JsonResponse
    {
        $q = (string) $request->validate(['q' => ['required', 'string', 'min:1', 'max:60']])['q'];
        $branchId = $request->user()->branch_id;

        $medicines = Medicine::active()
            ->with(['generic:id,name', 'company:id,name', 'packSizes'])
            ->search($q)
            ->orderByDesc('sold_count')
            ->limit(15)
            ->get();

        $batches = Batch::whereIn('medicine_id', $medicines->pluck('id'))
            ->where('branch_id', $branchId)
            ->where('status', 'active')
            ->where('quantity', '>', 0)
            ->whereDate('expiry_date', '>', now()->toDateString())
            ->orderBy('expiry_date')
            ->orderBy('id')
            ->get()
            ->groupBy('medicine_id');

        return response()->json([
            'data' => $medicines->map(function (Medicine $m) use ($batches) {
                $list = $batches->get($m->id, collect());
                $next = $list->first();
                $pack = $m->packSizes->firstWhere('is_default', true) ?? $m->packSizes->first();
                $perPack = $pack?->units ?: 1;
                $units = (int) $list->sum('quantity');

                return [
                    'id' => $m->id,
                    'name' => $m->full_name,
                    'generic' => $m->generic?->name,
                    'company' => $m->company?->name,
                    'barcode' => $m->barcode,
                    'rx_required' => $m->rx_required,
                    'is_cold_chain' => $m->is_cold_chain,
                    'stock_units' => $units,
                    'stock_packs' => round($units / $perPack, 1),
                    'low_stock' => $units < $m->reorder_level,
                    'next_batch' => $next ? [
                        'id' => $next->id,
                        'batch_no' => $next->batch_no,
                        'expiry_date' => $next->expiry_date->toDateString(),
                        'expiry_level' => $next->expiryLevel(),
                        'rack' => $next->rack,
                        'unit_mrp' => (float) $next->mrp,
                    ] : null,
                    'pack_sizes' => $m->packSizes->map(fn ($p) => [
                        'id' => $p->id,
                        'name' => $p->name,
                        'short_name' => $p->short_name,
                        'units' => $p->units,
                        'is_default' => $p->is_default,
                        'mrp' => $next ? round((float) $next->mrp * $p->units, 2) : null,
                    ])->values(),
                ];
            }),
            'max_cashier_discount' => $this->pos->maxCashierDiscount(),
        ]);
    }

    /** Exact counter total before payment (same FEFO batches and discount the sale will use). */
    public function quote(Request $request, PricingService $pricing): JsonResponse
    {
        $data = $request->validate([
            'items' => ['required', 'array', 'min:1', 'max:100'],
            'items.*.medicine_id' => ['required', 'integer'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:1000'],
            'items.*.pack_size_id' => ['nullable', 'integer'],
            'discount_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
        ]);

        $quote = $pricing->quote($data['items'], $request->user()->branch_id, null, null, (float) ($data['discount_percent'] ?? 0));

        return response()->json($quote + ['max_cashier_discount' => $this->pos->maxCashierDiscount()]);
    }

    public function sell(Request $request): JsonResponse
    {
        $data = $request->validate([
            'items' => ['required', 'array', 'min:1', 'max:100'],
            'items.*.medicine_id' => ['required', 'integer'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:1000'],
            'items.*.pack_size_id' => ['nullable', 'integer'],
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'discount_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'discount_approval_id' => ['nullable', 'integer'],
            'rx_approval_id' => ['nullable', 'integer'],
            'payments' => ['required', 'array', 'min:1', 'max:4'],
            'payments.*.method' => ['required', Rule::in(['cash', 'bkash', 'nagad', 'card'])],
            'payments.*.amount' => ['required', 'numeric', 'min:0'],
            'payments.*.received_amount' => ['nullable', 'numeric', 'min:0'],
            'payments.*.transaction_id' => ['nullable', 'string', 'max:100'],
            'note' => ['nullable', 'string', 'max:255'],
            'held_sale_id' => ['nullable', 'integer'],
        ]);

        $order = $this->pos->sell($request->user(), $data);

        if (! empty($data['held_sale_id'])) {
            HeldSale::where('branch_id', $request->user()->branch_id)->whereKey($data['held_sale_id'])->delete();
        }

        return response()->json(['data' => new OrderResource($order->load(['items.batch', 'payments', 'customer', 'cashier']))], 201);
    }

    /** Data for printing an 80mm receipt. */
    public function receipt(Request $request, Order $order): JsonResponse
    {
        abort_unless($order->branch_id === $request->user()->branch_id, 404);

        return response()->json([
            'data' => new OrderResource($order->load(['items.batch', 'payments', 'customer', 'cashier', 'pharmacist'])),
            'store' => [
                'name' => Setting::get('store.name'),
                'address' => Setting::get('store.address'),
                'phone' => Setting::get('store.phone'),
                'drug_licence_no' => Setting::get('store.drug_licence_no'),
                'tin_bin' => Setting::get('store.tin_bin'),
                'email' => Setting::get('store.email'),
                'footer' => Setting::get('pos.receipt_footer'),
            ],
        ]);
    }

    public function held(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->pos->held($request->user())]);
    }

    public function hold(Request $request): JsonResponse
    {
        $data = $request->validate([
            'cart' => ['required', 'array'],
            'cart.items' => ['required', 'array', 'min:1'],
            'label' => ['nullable', 'string', 'max:100'],
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
        ]);

        return response()->json(['data' => $this->pos->hold($request->user(), $data['cart'], $data['label'] ?? null, $data['customer_id'] ?? null)], 201);
    }

    public function resume(Request $request, HeldSale $heldSale): JsonResponse
    {
        return response()->json(['data' => ['cart' => $this->pos->resume($request->user(), $heldSale), 'customer_id' => $heldSale->customer_id]]);
    }

    /** Find a customer by phone/name, or add one at the counter. */
    public function customers(Request $request): JsonResponse
    {
        $q = (string) $request->validate(['q' => ['required', 'string', 'min:2', 'max:60']])['q'];

        return response()->json([
            'data' => Customer::search($q)->orderByDesc('last_purchase_at')->limit(10)
                ->get(['id', 'name', 'phone', 'orders_count', 'last_purchase_at', 'notes']),
        ]);
    }

    public function createCustomer(Request $request, SmsService $sms): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'phone' => ['required', 'string', 'max:20'],
        ]);
        $phone = $sms->normalise($data['phone']);
        abort_unless($phone, 422, 'Enter a valid mobile number.');

        $customer = Customer::firstOrCreate(['phone' => $phone], ['name' => $data['name']]);

        return response()->json(['data' => $customer->only(['id', 'name', 'phone', 'orders_count'])], $customer->wasRecentlyCreated ? 201 : 200);
    }
}
