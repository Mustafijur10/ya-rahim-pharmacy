<?php

namespace App\Http\Controllers\Api\Admin;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Models\Purchase;
use App\Models\Supplier;
use App\Models\SupplierPayment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/** Suppliers (design: "Stock / Suppliers"): list with dues, rep visits, ledger and payments. */
class SupplierController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $branchId = $request->user()->branch_id;
        $yearStart = now()->startOfYear()->toDateString();
        $monthStart = now()->startOfMonth()->toDateString();
        $search = trim((string) $request->query('search', ''));

        $suppliers = Supplier::with('company:id,name')
            ->withSum(['purchases as purchases_this_year' => fn ($q) => $q->where('branch_id', $branchId)->whereDate('purchased_at', '>=', $yearStart)], 'total')
            ->when($search !== '', fn ($q) => $q->where(fn ($w) => $w->where('name', 'like', "%$search%")->orWhere('contact_person', 'like', "%$search%")->orWhere('phone', 'like', "%$search%")))
            ->orderByDesc('is_active')
            ->orderBy('name')
            ->get();

        $nextVisit = Supplier::where('is_active', true)->whereNotNull('next_visit_on')->whereDate('next_visit_on', '>=', now()->toDateString())->orderBy('next_visit_on')->first();
        $paidMonth = SupplierPayment::where('branch_id', $branchId)->whereDate('paid_on', '>=', $monthStart);

        return response()->json([
            'data' => $suppliers->map(fn (Supplier $s) => [
                'id' => $s->id,
                'name' => $s->name,
                'company' => $s->company?->only(['id', 'name']),
                'contact_person' => $s->contact_person,
                'phone' => $s->phone,
                'email' => $s->email,
                'address' => $s->address,
                'visit_frequency' => $s->visit_frequency,
                'next_visit_on' => $s->next_visit_on?->toDateString(),
                'balance' => (float) $s->balance,
                'purchases_this_year' => round((float) $s->purchases_this_year, 2),
                'is_active' => $s->is_active,
            ]),
            'summary' => [
                'active_this_year' => Purchase::where('branch_id', $branchId)->whereDate('purchased_at', '>=', $yearStart)->distinct()->count('supplier_id'),
                'suppliers' => $suppliers->where('is_active', true)->count(),
                'total_due' => round((float) Supplier::sum('balance'), 2),
                'due_suppliers' => Supplier::where('balance', '>', 0)->count(),
                'paid_this_month' => round((float) (clone $paidMonth)->sum('amount'), 2),
                'payments_this_month' => (clone $paidMonth)->count(),
                'next_visit' => $nextVisit ? ['supplier' => $nextVisit->name, 'rep' => $nextVisit->contact_person, 'on' => $nextVisit->next_visit_on->toDateString()] : null,
            ],
        ]);
    }

    public function save(Request $request, ?Supplier $supplier = null): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'contact_person' => ['nullable', 'string', 'max:100'],
            'phone' => ['nullable', 'string', 'max:20'],
            'email' => ['nullable', 'email', 'max:150'],
            'address' => ['nullable', 'string', 'max:255'],
            'visit_frequency' => ['nullable', Rule::in(['weekly', 'fortnightly', 'monthly', 'on_call'])],
            'next_visit_on' => ['nullable', 'date'],
            'is_active' => ['boolean'],
        ]);
        $supplier ??= new Supplier;
        $supplier->fill($data)->save();

        return response()->json(['data' => $supplier], $supplier->wasRecentlyCreated ? 201 : 200);
    }

    /** Purchases (+) and payments (−) in date order with a running balance. */
    public function ledger(Request $request, Supplier $supplier): JsonResponse
    {
        $branchId = $request->user()->branch_id;
        $purchases = Purchase::where('supplier_id', $supplier->id)->where('branch_id', $branchId)
            ->get(['id', 'code', 'invoice_no', 'purchased_at', 'total', 'created_at'])
            ->map(fn ($p) => ['date' => $p->purchased_at->toDateString(), 'sort' => $p->created_at, 'kind' => 'purchase', 'details' => 'Invoice '.($p->invoice_no ?: $p->code), 'purchase' => (float) $p->total, 'paid' => 0.0, 'purchase_id' => $p->id]);
        $payments = SupplierPayment::where('supplier_id', $supplier->id)->where('branch_id', $branchId)
            ->get()
            ->map(fn ($p) => ['date' => $p->paid_on->toDateString(), 'sort' => $p->created_at, 'kind' => 'payment', 'details' => 'Payment — '.$p->method.($p->reference ? " · {$p->reference}" : '').($p->note ? " · {$p->note}" : ''), 'purchase' => 0.0, 'paid' => (float) $p->amount, 'purchase_id' => $p->purchase_id]);

        $balance = 0.0;
        $rows = $purchases->concat($payments)->sortBy([['date', 'asc'], ['sort', 'asc']])->values()->map(function ($r) use (&$balance) {
            $balance = round($balance + $r['purchase'] - $r['paid'], 2);
            unset($r['sort']);

            return $r + ['balance' => $balance];
        });

        return response()->json([
            'supplier' => ['id' => $supplier->id, 'name' => $supplier->name, 'balance' => (float) $supplier->balance],
            'data' => $rows->reverse()->values()->take(100),
        ]);
    }

    public function pay(Request $request, Supplier $supplier): JsonResponse
    {
        $data = $request->validate([
            'amount' => ['required', 'numeric', 'min:1'],
            'method' => ['required', Rule::in(['cash', 'bank', 'bkash', 'cheque'])],
            'reference' => ['nullable', 'string', 'max:100'],
            'note' => ['nullable', 'string', 'max:255'],
            'paid_on' => ['nullable', 'date', 'before_or_equal:today'],
        ]);
        if ((float) $data['amount'] > (float) $supplier->balance + 0.009) {
            throw new BusinessException('That is more than we owe this supplier (৳'.number_format((float) $supplier->balance, 2).').');
        }

        $payment = DB::transaction(function () use ($request, $supplier, $data) {
            $payment = SupplierPayment::create($data + [
                'supplier_id' => $supplier->id,
                'branch_id' => $request->user()->branch_id,
                'paid_on' => $data['paid_on'] ?? now()->toDateString(),
                'created_by' => $request->user()->id,
            ]);
            Supplier::whereKey($supplier->id)->decrement('balance', round((float) $data['amount'], 2));
            activity('purchases')->performedOn($supplier)->causedBy($request->user())->withProperties($data)->log('Supplier paid');

            return $payment;
        });

        return response()->json(['data' => $payment, 'balance' => (float) $supplier->fresh()->balance], 201);
    }
}
