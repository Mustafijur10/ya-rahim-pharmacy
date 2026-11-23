<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\ApprovalResource;
use App\Models\ApprovalRequest;
use App\Services\ApprovalService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ApprovalController extends Controller
{
    public function __construct(private ApprovalService $approvals) {}

    /** Requests the user can decide, plus their own. ?status=pending|approved|rejected&mine=1 */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'status' => ['nullable', 'in:pending,approved,rejected,decided'],
            'type' => ['nullable', 'in:discount,refund,stock_adjustment,rx_release'],
            'mine' => ['nullable', 'boolean'],
        ]);

        $decidable = collect(['discount', 'refund', 'stock_adjustment', 'rx_release'])
            ->filter(fn ($type) => $this->approvals->canDecide($type, $user))
            ->values();

        $query = ApprovalRequest::where('branch_id', $user->branch_id)
            ->with(['requester', 'decider'])
            ->latest();

        if (! empty($data['mine'])) {
            $query->where('requested_by', $user->id);
        } else {
            $query->where(fn (Builder $q) => $q->whereIn('type', $decidable)->orWhere('requested_by', $user->id));
        }
        if (($data['status'] ?? null) === 'decided') {
            $query->whereIn('status', ['approved', 'rejected'])->reorder()->latest('decided_at');
        } elseif (! empty($data['status'])) {
            $query->where('status', $data['status']);
        }
        if (! empty($data['type'])) {
            $query->where('type', $data['type']);
        }

        $pendingCounts = ApprovalRequest::where('branch_id', $user->branch_id)->pending()->whereIn('type', $decidable)
            ->selectRaw('type, COUNT(*) c')->groupBy('type')->pluck('c', 'type');

        return ApprovalResource::collection($query->paginate(30))->additional([
            'can_decide' => $decidable,
            'pending_counts' => $pendingCounts,
        ])->response();
    }

    /** Cashier asks for a discount above the limit, or for an Rx medicine to be released. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', 'in:discount,rx_release'],
            'amount' => ['required_if:type,discount', 'nullable', 'numeric', 'min:0', 'max:100'],
            'reason' => ['nullable', 'string', 'max:255'],
            'data' => ['nullable', 'array'],
            'data.customer' => ['nullable', 'string', 'max:100'],
            'data.medicines' => ['nullable', 'array', 'max:20'],
            'data.medicines.*' => ['string', 'max:150'],
            'data.prescription_id' => ['nullable', 'integer'],
        ]);

        $approval = $this->approvals->request(
            type: $data['type'],
            branchId: $request->user()->branch_id,
            requester: $request->user(),
            amount: isset($data['amount']) ? (float) $data['amount'] : null,
            data: $data['data'] ?? [],
            reason: $data['reason'] ?? null,
        );

        return response()->json(['data' => new ApprovalResource($approval->load('requester'))], 201);
    }

    public function show(Request $request, ApprovalRequest $approval): JsonResponse
    {
        abort_unless($approval->branch_id === $request->user()->branch_id, 404);

        return response()->json(['data' => new ApprovalResource($approval->load(['requester', 'decider']))]);
    }

    public function approve(Request $request, ApprovalRequest $approval): JsonResponse
    {
        abort_unless($approval->branch_id === $request->user()->branch_id, 404);
        $note = $request->validate(['note' => ['nullable', 'string', 'max:255']])['note'] ?? null;

        return response()->json(['data' => new ApprovalResource($this->approvals->approve($approval, $request->user(), $note)->load(['requester', 'decider']))]);
    }

    public function reject(Request $request, ApprovalRequest $approval): JsonResponse
    {
        abort_unless($approval->branch_id === $request->user()->branch_id, 404);
        $note = $request->validate(['note' => ['nullable', 'string', 'max:255']])['note'] ?? null;

        return response()->json(['data' => new ApprovalResource($this->approvals->reject($approval, $request->user(), $note)->load(['requester', 'decider']))]);
    }
}
