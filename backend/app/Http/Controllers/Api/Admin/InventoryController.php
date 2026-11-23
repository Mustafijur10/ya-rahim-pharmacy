<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\BatchResource;
use App\Models\Batch;
use App\Models\Medicine;
use App\Models\StockAdjustment;
use App\Models\StockMovement;
use App\Services\StockService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class InventoryController extends Controller
{
    /**
     * Batch-level stock list, as on the Inventory screen.
     * ?tab=all|low|expiring|expired|out &search= &category_id= &company_id= &rack=
     */
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'tab' => ['nullable', 'in:all,low,expiring,expired,out'],
            'search' => ['nullable', 'string', 'max:60'],
            'category_id' => ['nullable', 'integer'],
            'company_id' => ['nullable', 'integer'],
            'rack' => ['nullable', 'string', 'max:30'],
            'per_page' => ['nullable', 'integer', 'min:5', 'max:100'],
        ]);
        $branchId = $request->user()->branch_id;
        $today = now()->toDateString();

        $query = Batch::where('branch_id', $branchId)
            ->where('status', 'active')
            ->with(['medicine.generic:id,name', 'medicine.company:id,name', 'medicine.defaultPackSize', 'supplier:id,name']);

        match ($data['tab'] ?? 'all') {
            'expiring' => $query->where('quantity', '>', 0)->whereDate('expiry_date', '>', $today)->whereDate('expiry_date', '<=', now()->addDays(90)->toDateString())->orderBy('expiry_date'),
            'expired' => $query->where('quantity', '>', 0)->whereDate('expiry_date', '<=', $today)->orderBy('expiry_date'),
            'low' => $query->where('quantity', '>', 0)->whereIn('medicine_id', Medicine::lowStock($branchId)->pluck('id'))->orderBy('expiry_date'),
            'out' => $query->whereIn('medicine_id', $this->outOfStockIds($branchId))->latest('id'),
            default => $query->where('quantity', '>', 0)->orderBy('expiry_date'),
        };

        if (! empty($data['search'])) {
            $term = $data['search'];
            $query->where(fn (Builder $q) => $q
                ->where('batch_no', 'like', addcslashes($term, '%_\\').'%')
                ->orWhereHas('medicine', fn (Builder $m) => $m->search($term)));
        }
        if (! empty($data['category_id'])) {
            $query->whereHas('medicine', fn (Builder $m) => $m->where('category_id', $data['category_id']));
        }
        if (! empty($data['company_id'])) {
            $query->whereHas('medicine', fn (Builder $m) => $m->where('company_id', $data['company_id']));
        }
        if (! empty($data['rack'])) {
            $query->where('rack', $data['rack']);
        }

        return BatchResource::collection($query->paginate($data['per_page'] ?? 25)->withQueryString())->response();
    }

    /** Header numbers and tab counts. */
    public function summary(Request $request): JsonResponse
    {
        $branchId = $request->user()->branch_id;
        $today = now()->toDateString();
        $base = fn () => Batch::where('branch_id', $branchId)->where('status', 'active');

        $result = [
            'medicines' => Medicine::active()->count(),
            'batches' => $base()->where('quantity', '>', 0)->count(),
            'tabs' => [
                'all' => $base()->where('quantity', '>', 0)->count(),
                'low' => Medicine::lowStock($branchId)->count(),
                'expiring' => $base()->where('quantity', '>', 0)->whereDate('expiry_date', '>', $today)->whereDate('expiry_date', '<=', now()->addDays(90)->toDateString())->count(),
                'expired' => $base()->where('quantity', '>', 0)->whereDate('expiry_date', '<=', $today)->count(),
                'out' => count($this->outOfStockIds($branchId)),
            ],
            'racks' => $base()->whereNotNull('rack')->distinct()->orderBy('rack')->pluck('rack'),
        ];

        if ($request->user()->hasModuleAccess('profit', 'full', 'view')) {
            $result['stock_value_cost'] = round((float) $base()->sum(DB::raw('quantity * cost_price')), 2);
            $result['stock_value_mrp'] = round((float) $base()->sum(DB::raw('quantity * mrp')), 2);
        }

        return response()->json($result);
    }

    /** Stock correction. Full rights apply it now; approval-level creates a request. */
    public function adjust(Request $request, StockService $stock): JsonResponse
    {
        $data = $request->validate([
            'batch_id' => ['required', 'integer'],
            'quantity' => ['required', 'integer', 'not_in:0', 'between:-100000,100000'],
            'reason' => ['required', Rule::in(['damaged', 'expired', 'count_correction', 'lost', 'supplier_return', 'other'])],
            'note' => ['nullable', 'string', 'max:255'],
        ]);
        $batch = Batch::where('branch_id', $request->user()->branch_id)->findOrFail($data['batch_id']);

        $adjustment = $stock->requestAdjustment($request->user(), $batch, (int) $data['quantity'], $data['reason'], $data['note'] ?? null);

        return response()->json([
            'data' => $adjustment,
            'applied' => $adjustment->status === 'approved',
            'batch' => new BatchResource($batch->fresh()->load('medicine.defaultPackSize')),
        ], 201);
    }

    public function adjustments(Request $request): JsonResponse
    {
        return response()->json(
            StockAdjustment::where('branch_id', $request->user()->branch_id)
                ->with(['batch.medicine:id,name,strength,dosage_form', 'requester:id,name', 'approver:id,name'])
                ->latest()
                ->paginate(25)
        );
    }

    /** Movement history of one batch or one medicine. ?batch_id= or ?medicine_id= */
    public function movements(Request $request): JsonResponse
    {
        $data = $request->validate([
            'batch_id' => ['required_without:medicine_id', 'nullable', 'integer'],
            'medicine_id' => ['required_without:batch_id', 'nullable', 'integer'],
        ]);

        $query = StockMovement::where('branch_id', $request->user()->branch_id)
            ->with(['batch:id,batch_no', 'user:id,name'])
            ->latest('id');
        if (! empty($data['batch_id'])) {
            $query->where('batch_id', $data['batch_id']);
        }
        if (! empty($data['medicine_id'])) {
            $query->where('medicine_id', $data['medicine_id']);
        }

        return response()->json($query->paginate(50));
    }

    /** @return list<int> active medicines with no sellable stock */
    private function outOfStockIds(int $branchId): array
    {
        return Medicine::outOfStock($branchId)->pluck('id')->all();
    }
}
