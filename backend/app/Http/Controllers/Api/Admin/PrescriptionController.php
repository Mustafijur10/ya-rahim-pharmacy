<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\PrescriptionResource;
use App\Models\Customer;
use App\Models\Prescription;
use App\Models\PrescriptionPage;
use App\Services\PrescriptionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class PrescriptionController extends Controller
{
    /** ?status=pending|verified|rejected&customer_id= */
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'status' => ['nullable', 'in:pending,verified,rejected,expired'],
            'customer_id' => ['nullable', 'integer'],
        ]);

        $query = Prescription::with(['customer', 'pages', 'verifier'])->withCount('orders')->latest();
        if (! empty($data['status'])) {
            $query->where('status', $data['status']);
        }
        if (! empty($data['customer_id'])) {
            $query->where('customer_id', $data['customer_id']);
        }

        return PrescriptionResource::collection($query->paginate(25))->response();
    }

    public function show(Prescription $prescription): JsonResponse
    {
        return response()->json(['data' => new PrescriptionResource($prescription->load(['customer', 'pages', 'verifier']))]);
    }

    /** Staff uploads a prescription for a counter or phone customer. */
    public function store(Request $request, PrescriptionService $service): JsonResponse
    {
        $request->validate([
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'files' => ['required', 'array', 'min:1', 'max:'.PrescriptionService::MAX_PAGES],
            'files.*' => ['required', 'file', 'max:10240', 'mimetypes:'.implode(',', PrescriptionService::ALLOWED_MIMES)],
        ]);
        $customer = $request->filled('customer_id') ? Customer::find($request->integer('customer_id')) : null;

        $prescription = $service->upload($request->file('files'), $customer, $request->user());

        return response()->json(['data' => new PrescriptionResource($prescription)], 201);
    }

    /** Streams the private image/PDF. Never exposed as a public URL. */
    public function page(Prescription $prescription, PrescriptionPage $page): StreamedResponse
    {
        abort_unless($page->prescription_id === $prescription->id, 404);

        return Storage::disk($page->disk)->response($page->path, null, [
            'Cache-Control' => 'private, max-age=600',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
