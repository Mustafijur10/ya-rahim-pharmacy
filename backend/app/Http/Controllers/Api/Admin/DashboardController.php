<?php

namespace App\Http\Controllers\Api\Admin;

use App\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\ApprovalResource;
use App\Http\Resources\BatchResource;
use App\Http\Resources\OrderResource;
use App\Http\Resources\PrescriptionResource;
use App\Models\ApprovalRequest;
use App\Models\Batch;
use App\Models\HeldSale;
use App\Models\Medicine;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Prescription;
use App\Models\Setting;
use App\Models\Shift;
use App\Models\TemperatureLog;
use App\Services\ShiftService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    /** Owner / manager dashboard. ?days=7|30 for the chart. */
    public function index(Request $request, ShiftService $shifts): JsonResponse
    {
        $user = $request->user();
        $branchId = $user->branch_id;
        $days = in_array((int) $request->query('days'), [7, 30], true) ? (int) $request->query('days') : 7;
        $today = now()->startOfDay();

        $sold = fn () => Order::where('branch_id', $branchId)
            ->whereNotIn('status', [OrderStatus::Cancelled->value]);

        $todayOrders = $sold()->where('created_at', '>=', $today);
        $salesToday = (float) (clone $todayOrders)->sum('total');
        $yesterday = (float) $sold()->whereBetween('created_at', [$today->copy()->subDay(), $today])->sum('total');

        // 7/30-day chart: shop vs online, in Taka.
        $from = $today->copy()->subDays($days - 1);
        $rows = $sold()
            ->where('created_at', '>=', $from)
            ->selectRaw("DATE(created_at) d, CASE WHEN channel = 'shop' THEN 'shop' ELSE 'online' END ch, SUM(total) t")
            ->groupBy('d', 'ch')
            ->get();
        $chart = [];
        for ($date = $from->copy(); $date->lte($today); $date->addDay()) {
            $key = $date->toDateString();
            $chart[] = [
                'date' => $key,
                'label' => $date->format($days > 7 ? 'j M' : 'D'),
                'shop' => round((float) $rows->first(fn ($r) => $r->d === $key && $r->ch === 'shop')?->t, 2),
                'online' => round((float) $rows->first(fn ($r) => $r->d === $key && $r->ch === 'online')?->t, 2),
            ];
        }

        $payments = Payment::where('status', 'success')
            ->where('paid_at', '>=', $today)
            ->whereHas('order', fn ($q) => $q->where('branch_id', $branchId))
            ->selectRaw('method, SUM(amount) total, COUNT(*) count')
            ->groupBy('method')
            ->get()
            ->map(fn ($p) => ['method' => $p->method->value, 'label' => $p->method->label(), 'total' => round((float) $p->total, 2), 'count' => (int) $p->count]);

        $cashInDrawers = Shift::where('branch_id', $branchId)->where('status', 'open')->get()
            ->sum(fn (Shift $s) => $shifts->summary($s)['expected_cash']);

        $lowStock = $this->lowStockQuery($branchId)->limit(6)->get();

        $result = [
            'kpis' => [
                'sales_today' => round($salesToday, 2),
                'sales_today_shop' => round((float) (clone $todayOrders)->where('channel', 'shop')->sum('total'), 2),
                'sales_today_online' => round((float) (clone $todayOrders)->where('channel', '!=', 'shop')->sum('total'), 2),
                'sales_yesterday' => round($yesterday, 2),
                'orders_today' => (clone $todayOrders)->count(),
                'online_orders_today' => (clone $todayOrders)->where('channel', '!=', 'shop')->count(),
                'open_online_orders' => Order::where('branch_id', $branchId)->whereIn('status', ['new', 'rx_verification', 'packing', 'ready_for_pickup', 'out_for_delivery'])->count(),
                'shop_orders_today' => (clone $todayOrders)->where('channel', 'shop')->count(),
                'open_online_waiting_30' => Order::where('branch_id', $branchId)->whereIn('status', ['new', 'rx_verification'])->where('placed_at', '<', now()->subMinutes(30))->count(),
                'rx_waiting' => Order::where('branch_id', $branchId)->where('status', OrderStatus::RxVerification->value)->count(),
                'rx_oldest_at' => Order::where('branch_id', $branchId)->where('status', OrderStatus::RxVerification->value)->min('placed_at'),
                'low_stock' => Medicine::lowStock($branchId)->count(),
                'expiring_90' => Batch::where('branch_id', $branchId)->expiringWithin(90)->count(),
                'expiring_90_cost' => round((float) Batch::where('branch_id', $branchId)->expiringWithin(90)->sum(DB::raw('quantity * cost_price')), 2),
                'pending_approvals' => ApprovalRequest::pending()->where('branch_id', $branchId)->count(),
            ],
            'chart' => $chart,
            'payments_today' => $payments,
            'cash_in_drawers' => round($cashInDrawers, 2),
            'recent_orders' => OrderResource::collection(
                Order::where('branch_id', $branchId)->with('customer')->latest()->limit(8)->get()
            ),
            'expiring' => BatchResource::collection(
                Batch::where('branch_id', $branchId)->expiringWithin(90)->with(['medicine.defaultPackSize'])->orderBy('expiry_date')->limit(6)->get()
            ),
            'low_stock' => $lowStock->map(fn (Medicine $m) => [
                'id' => $m->id,
                'name' => $m->full_name,
                'stock_units' => (int) $m->stock_units,
                'reorder_level' => $m->reorder_level,
                'pack' => $m->defaultPackSize?->short_name,
                'stock_packs' => round((int) $m->stock_units / max(1, $m->defaultPackSize?->units ?? 1), 1),
                'reorder_packs' => round($m->reorder_level / max(1, $m->defaultPackSize?->units ?? 1), 1),
            ]),
            'hourly' => $this->hourly($branchId, $today),
            'categories' => $this->categoriesToday($branchId, $today),
            'top_medicines' => $this->topMedicines($branchId, $today),
            'target' => $this->monthlyTarget($branchId),
        ];

        if ($user->hasModuleAccess('profit', 'full', 'view')) {
            $result['kpis']['gross_profit_today'] = round((float) DB::table('order_items')
                ->join('orders', 'orders.id', '=', 'order_items.order_id')
                ->where('orders.branch_id', $branchId)
                ->where('orders.status', '!=', OrderStatus::Cancelled->value)
                ->where('orders.created_at', '>=', $today)
                ->whereNull('orders.deleted_at')
                ->sum(DB::raw('order_items.line_total - order_items.unit_cost * (order_items.quantity - order_items.returned_quantity)')), 2);
        }

        return response()->json($result);
    }

    /** Cashier home: their shift, drawer, receipts and requests. */
    public function counter(Request $request, ShiftService $shifts): JsonResponse
    {
        $user = $request->user();
        $shift = $user->openShift()->first();
        $mine = Order::where('cashier_id', $user->id)
            ->where('created_at', '>=', now()->startOfDay())
            ->where('status', '!=', OrderStatus::Cancelled->value);
        $myPayments = Payment::where('received_by', $user->id)->where('status', 'success')->where('paid_at', '>=', now()->startOfDay());

        return response()->json([
            'kpis' => [
                'sales_today' => round((float) (clone $mine)->sum('total'), 2),
                'receipts_today' => (clone $mine)->count(),
                'cash_today' => round((float) (clone $myPayments)->where('method', 'cash')->sum('amount'), 2),
                'digital_today' => round((float) (clone $myPayments)->where('method', '!=', 'cash')->sum('amount'), 2),
                'held_sales' => HeldSale::where('branch_id', $user->branch_id)->count(),
            ],
            'shift' => $shift ? $shift->only(['id', 'counter_name', 'opened_at', 'opening_cash']) : null,
            'drawer' => $shift ? $shifts->summary($shift) : null,
            'receipts' => OrderResource::collection(
                Order::where('cashier_id', $user->id)
                    ->where('created_at', '>=', now()->startOfDay())
                    ->with(['customer', 'payments'])
                    ->latest()
                    ->limit(50)
                    ->get()
            ),
            'requests' => ApprovalResource::collection(
                ApprovalRequest::where('requested_by', $user->id)->with('decider')->latest()->limit(10)->get()
            ),
        ]);
    }

    /** Pharmacist home: counter requests, Rx queue, expiry actions, fridge log. */
    public function pharmacist(Request $request): JsonResponse
    {
        $branchId = $request->user()->branch_id;
        $today = now()->startOfDay();
        $waiting = Order::where('branch_id', $branchId)->where('status', OrderStatus::RxVerification->value);

        return response()->json([
            'kpis' => [
                'rx_waiting' => (clone $waiting)->count(),
                'rx_oldest_at' => (clone $waiting)->min('placed_at'),
                'verified_online_today' => Prescription::where('status', 'verified')->where('verified_at', '>=', $today)->count(),
                'released_at_counter_today' => ApprovalRequest::where('branch_id', $branchId)->where('type', 'rx_release')->where('status', 'approved')->where('decided_at', '>=', $today)->count(),
                'rejected_today' => Prescription::where('status', 'rejected')->where('verified_at', '>=', $today)->count(),
                'expiring_30' => Batch::where('branch_id', $branchId)->expiringWithin(30)->count(),
            ],
            'counter_requests' => ApprovalResource::collection(
                ApprovalRequest::pending()->where('branch_id', $branchId)->where('type', 'rx_release')->with('requester')->oldest()->get()
            ),
            'rx_queue' => OrderResource::collection(
                Order::where('branch_id', $branchId)
                    ->where('status', OrderStatus::RxVerification->value)
                    ->with('customer')
                    ->withCount(['items', 'items as rx_items_count' => fn ($q) => $q->where('rx_required', true)])
                    ->oldest('placed_at')
                    ->limit(20)
                    ->get()
            ),
            'pending_prescriptions' => PrescriptionResource::collection(
                Prescription::where('status', 'pending')->whereDoesntHave('orders')->with(['customer', 'pages'])->latest()->limit(10)->get()
            ),
            'expiry_actions' => BatchResource::collection(
                Batch::where('branch_id', $branchId)->expiringWithin(90)->with(['medicine.defaultPackSize'])->orderBy('expiry_date')->limit(6)->get()
            ),
            'fridge' => TemperatureLog::where('branch_id', $branchId)->with('user:id,name')->latest('recorded_at')->first(),
        ]);
    }

    /** Medicines whose sellable stock is below their reorder level. */
    public static function lowStockQuery(int $branchId)
    {
        return Medicine::lowStock($branchId)->withSellableStock($branchId)->with('defaultPackSize');
    }

    /** Sold (non-cancelled) items of today's orders in this branch. */
    private function itemsToday(int $branchId, Carbon $today)
    {
        return DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->where('orders.branch_id', $branchId)
            ->where('orders.status', '!=', OrderStatus::Cancelled->value)
            ->where('orders.created_at', '>=', $today)
            ->whereNull('orders.deleted_at');
    }

    /** Today's sales per opening hour (9 am – 9 pm), shop vs online, in Taka. */
    private function hourly(int $branchId, Carbon $today): array
    {
        $rows = Order::where('branch_id', $branchId)
            ->whereNotIn('status', [OrderStatus::Cancelled->value])
            ->where('created_at', '>=', $today)
            ->selectRaw("HOUR(created_at) h, CASE WHEN channel = 'shop' THEN 'shop' ELSE 'online' END ch, SUM(total) t")
            ->groupBy('h', 'ch')
            ->get();

        $first = min(9, (int) ($rows->min('h') ?? 9));
        $last = max(21, (int) ($rows->max('h') ?? 21));
        $out = [];
        for ($h = $first; $h <= $last; $h++) {
            $out[] = [
                'hour' => $h,
                'shop' => round((float) $rows->first(fn ($r) => (int) $r->h === $h && $r->ch === 'shop')?->t, 2),
                'online' => round((float) $rows->first(fn ($r) => (int) $r->h === $h && $r->ch === 'online')?->t, 2),
            ];
        }

        return $out;
    }

    /** Share of today's sales by top-level category (biggest four + "Other"). */
    private function categoriesToday(int $branchId, Carbon $today): array
    {
        $rows = $this->itemsToday($branchId, $today)
            ->join('medicines', 'medicines.id', '=', 'order_items.medicine_id')
            ->leftJoin('categories as c', 'c.id', '=', 'medicines.category_id')
            ->leftJoin('categories as p', 'p.id', '=', 'c.parent_id')
            ->selectRaw("COALESCE(p.name, c.name, 'Other') name, SUM(order_items.line_total) total")
            ->groupBy('name')
            ->orderByDesc('total')
            ->get();

        $top = $rows->take(4)->map(fn ($r) => ['name' => $r->name, 'total' => round((float) $r->total, 2)])->values();
        $rest = (float) $rows->slice(4)->sum('total');
        if ($rest > 0) {
            $top->push(['name' => 'Other', 'total' => round($rest, 2)]);
        }

        return $top->all();
    }

    /** Best sellers today, counted in each medicine's default pack (e.g. strips). */
    private function topMedicines(int $branchId, Carbon $today): array
    {
        $rows = $this->itemsToday($branchId, $today)
            ->selectRaw('order_items.medicine_id, SUM(order_items.quantity) units')
            ->groupBy('order_items.medicine_id')
            ->orderByDesc('units')
            ->limit(5)
            ->get();
        $medicines = Medicine::with('defaultPackSize')->whereIn('id', $rows->pluck('medicine_id'))->get()->keyBy('id');

        return $rows->map(function ($r) use ($medicines) {
            $m = $medicines->get($r->medicine_id);
            $per = max(1, $m?->defaultPackSize?->units ?? 1);

            return [
                'id' => (int) $r->medicine_id,
                'name' => $m?->full_name ?? 'Medicine',
                'packs' => round((int) $r->units / $per, 1),
                'pack' => $m?->defaultPackSize ? str($m->defaultPackSize->short_name)->plural((int) ceil($r->units / $per))->toString() : 'units',
            ];
        })->values()->all();
    }

    /** This month's sales against the target set in Settings (sales.monthly_target). */
    private function monthlyTarget(int $branchId): array
    {
        $start = now()->startOfMonth();
        $sold = (float) Order::where('branch_id', $branchId)
            ->whereNotIn('status', [OrderStatus::Cancelled->value])
            ->where('created_at', '>=', $start)
            ->sum('total');
        $target = (float) Setting::get('sales.monthly_target', 1200000);
        $daysLeft = (int) now()->diffInDays(now()->endOfMonth()->startOfDay()) + 1;

        return [
            'month' => $start->format('F Y'),
            'sold' => round($sold, 2),
            'target' => round($target, 2),
            'days_left' => $daysLeft,
        ];
    }
}
