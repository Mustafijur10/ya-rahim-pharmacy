<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\OrderResource;
use App\Http\Resources\PrescriptionResource;
use App\Models\Customer;
use App\Services\Sms\SmsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CustomerController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'search' => ['nullable', 'string', 'max:60'],
            'sort' => ['nullable', 'in:recent,top,name'],
        ]);

        $query = Customer::search($data['search'] ?? null);
        match ($data['sort'] ?? 'recent') {
            'top' => $query->orderByDesc('total_spent'),
            'name' => $query->orderBy('name'),
            default => $query->orderByDesc('last_purchase_at')->orderByDesc('id'),
        };

        return response()->json($query->paginate(25, ['id', 'name', 'phone', 'email', 'orders_count', 'total_spent', 'last_purchase_at', 'user_id'])->withQueryString());
    }

    public function show(Customer $customer): JsonResponse
    {
        $customer->load(['addresses.deliveryArea:id,name', 'refillSubscriptions.items.medicine:id,name,strength']);

        return response()->json([
            'data' => $customer,
            'has_online_account' => $customer->user_id !== null,
            'recent_orders' => OrderResource::collection($customer->orders()->withCount('items')->latest()->limit(20)->get()),
            'prescriptions' => PrescriptionResource::collection($customer->prescriptions()->with('pages')->latest()->limit(10)->get()),
        ]);
    }

    public function store(Request $request, SmsService $sms): JsonResponse
    {
        $data = $this->validated($request, $sms);

        return response()->json(['data' => Customer::create($data)], 201);
    }

    public function update(Request $request, Customer $customer, SmsService $sms): JsonResponse
    {
        $customer->update($this->validated($request, $sms, $customer));

        return response()->json(['data' => $customer]);
    }

    private function validated(Request $request, SmsService $sms, ?Customer $customer = null): array
    {
        $request->merge(['phone' => $sms->normalise($request->input('phone')) ?? $request->input('phone')]);

        return $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'phone' => ['required', 'regex:/^01[3-9]\d{8}$/', Rule::unique('customers', 'phone')->ignore($customer?->id)],
            'email' => ['nullable', 'email', 'max:150'],
            'date_of_birth' => ['nullable', 'date', 'before:today'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ], ['phone.regex' => 'Enter a valid mobile number, e.g. 01712345678.']);
    }
}
