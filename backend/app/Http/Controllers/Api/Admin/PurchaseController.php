<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Purchase;
use App\Services\PurchaseService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PurchaseController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'supplier_id' => ['nullable', 'integer'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
        ]);

        $query = Purchase::where('branch_id', $request->user()->branch_id)
            ->with(['supplier:id,name', 'creator:id,name'])
            ->withCount('items')
            ->latest('purchased_at')
            ->latest('id');
        if (! empty($data['supplier_id'])) {
            $query->where('supplier_id', $data['supplier_id']);
        }
        if (! empty($data['from'])) {
            $query->whereDate('purchased_at', '>=', $data['from']);
        }
        if (! empty($data['to'])) {
            $query->whereDate('purchased_at', '<=', $data['to']);
        }

        return response()->json($query->paginate(25)->withQueryString());
    }

    public function show(Request $request, Purchase $purchase): JsonResponse
    {
        abort_unless($purchase->branch_id === $request->user()->branch_id, 404);

        return response()->json(['data' => $purchase->load(['supplier', 'creator:id,name', 'items.medicine:id,name,strength,dosage_form'])]);
    }

    public function store(Request $request, PurchaseService $purchases): JsonResponse
    {
        $data = $request->validate([
            'supplier_id' => ['required', 'integer', 'exists:suppliers,id'],
            'invoice_no' => ['nullable', 'string', 'max:50'],
            'purchased_at' => ['nullable', 'date', 'before_or_equal:today'],
            'discount' => ['nullable', 'numeric', 'min:0'],
            'paid' => ['nullable', 'numeric', 'min:0'],
            'note' => ['nullable', 'string', 'max:500'],
            'items' => ['required', 'array', 'min:1', 'max:200'],
            'items.*.medicine_id' => ['required', 'integer', 'exists:medicines,id'],
            'items.*.batch_no' => ['required', 'string', 'max:50'],
            'items.*.expiry_date' => ['required', 'date'],
            'items.*.quantity' => ['required', 'integer', 'min:1'],
            'items.*.free_quantity' => ['nullable', 'integer', 'min:0'],
            'items.*.unit_cost' => ['required', 'numeric', 'min:0'],
            'items.*.mrp' => ['required', 'numeric', 'min:0'],
            'items.*.rack' => ['nullable', 'string', 'max:30'],
        ]);

        return response()->json(['data' => $purchases->receive($request->user(), $data)], 201);
    }
}
