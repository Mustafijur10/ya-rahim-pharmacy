<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Shift;
use App\Services\ShiftService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ShiftController extends Controller
{
    public function __construct(private ShiftService $shifts) {}

    public function current(Request $request): JsonResponse
    {
        $shift = $request->user()->openShift()->first();

        return response()->json([
            'data' => $shift ? $this->present($shift) : null,
        ]);
    }

    public function open(Request $request): JsonResponse
    {
        $data = $request->validate([
            'opening_cash' => ['required', 'numeric', 'min:0', 'max:10000000'],
            'counter_name' => ['nullable', 'string', 'max:30'],
        ]);

        $shift = $this->shifts->open($request->user(), (float) $data['opening_cash'], $data['counter_name'] ?? 'Counter 1');

        return response()->json(['data' => $this->present($shift)], 201);
    }

    public function close(Request $request, Shift $shift): JsonResponse
    {
        $data = $request->validate([
            'counted_cash' => ['required', 'numeric', 'min:0', 'max:10000000'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);
        abort_unless($shift->branch_id === $request->user()->branch_id, 404);

        $shift = $this->shifts->close($shift, $request->user(), (float) $data['counted_cash'], $data['note'] ?? null);

        return response()->json(['data' => $this->present($shift)]);
    }

    /** Shift history (managers see everyone's, others only their own). */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = Shift::where('branch_id', $user->branch_id)->with('user:id,name')->latest('opened_at');
        if (! $user->hasModuleAccess('dashboard', 'full')) {
            $query->where('user_id', $user->id);
        }

        return response()->json($query->paginate(20));
    }

    private function present(Shift $shift): array
    {
        return $shift->only(['id', 'counter_name', 'status', 'opened_at', 'closed_at', 'opening_cash', 'expected_cash', 'counted_cash', 'difference', 'note'])
            + ['summary' => $this->shifts->summary($shift)];
    }
}
