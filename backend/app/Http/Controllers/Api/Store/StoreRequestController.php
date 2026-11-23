<?php

namespace App\Http\Controllers\Api\Store;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Http\Resources\PrescriptionResource;
use App\Models\ContactMessage;
use App\Models\Customer;
use App\Services\PrescriptionService;
use App\Services\Sms\SmsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Public forms: "Order with prescription" (also as a guest) and "Contact us". */
class StoreRequestController extends Controller
{
    /**
     * Upload a prescription; a pharmacist calls back to confirm items and price.
     * Signed-in customers are linked automatically; guests give name + mobile.
     */
    public function prescriptionRequest(Request $request, PrescriptionService $prescriptions, SmsService $sms): JsonResponse
    {
        $user = $request->user('sanctum'); // optional sign-in on a public route
        $isCustomer = $user && ! $user->is_staff;

        $data = $request->validate([
            'name' => [$isCustomer ? 'nullable' : 'required', 'string', 'max:100'],
            'phone' => [$isCustomer ? 'nullable' : 'required', 'string', 'max:20'],
            'delivery_type' => ['nullable', 'in:delivery,pickup'],
            'note' => ['nullable', 'string', 'max:500'],
            'save_for_refill' => ['boolean'],
            'files' => ['required', 'array', 'min:1', 'max:'.PrescriptionService::MAX_PAGES],
            'files.*' => ['required', 'file', 'max:10240', 'mimetypes:'.implode(',', PrescriptionService::ALLOWED_MIMES)],
            'website' => ['prohibited'], // honeypot: real people never fill this hidden field
        ]);

        $customer = $isCustomer ? $user->customer()->first() : null;
        $phone = $customer?->phone ?? $sms->normalise($data['phone'] ?? null);
        if (! $phone) {
            throw new BusinessException('Enter a valid mobile number, e.g. 01712345678.', 'invalid_phone');
        }

        $prescription = DB::transaction(function () use ($request, $prescriptions, $customer, $data, $phone, $user, $isCustomer) {
            $customer ??= Customer::firstOrCreate(['phone' => $phone], ['name' => $data['name'] ?? 'Customer']);

            $prescription = $prescriptions->upload($request->file('files'), $customer, $isCustomer ? $user : null, (bool) ($data['save_for_refill'] ?? false));
            $prescription->update([
                'contact_name' => $data['name'] ?? $customer->name,
                'contact_phone' => $phone,
                'delivery_type' => $data['delivery_type'] ?? null,
                'customer_note' => $data['note'] ?? null,
            ]);

            return $prescription;
        });

        $sms->send($phone, 'Ya Rahim Pharmacy: we received your prescription. Our pharmacist will call you shortly to confirm the medicines and price.', 'rx_request');

        return response()->json([
            'message' => 'Prescription received. Our pharmacist will call you to confirm.',
            'data' => $isCustomer ? new PrescriptionResource($prescription->load('pages')) : ['id' => $prescription->id],
        ], 201);
    }

    public function contact(Request $request, SmsService $sms): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'phone' => ['required', 'string', 'max:20'],
            'email' => ['nullable', 'email', 'max:150'],
            'topic' => ['required', 'in:availability,order,prescription,delivery,feedback,other'],
            'order_code' => ['nullable', 'string', 'max:30'],
            'message' => ['required', 'string', 'min:5', 'max:2000'],
            'agree' => ['accepted'],
            'website' => ['prohibited'],
        ]);

        $phone = $sms->normalise($data['phone']);
        if (! $phone) {
            throw new BusinessException('Enter a valid mobile number, e.g. 01712345678.', 'invalid_phone');
        }

        ContactMessage::create([
            'name' => $data['name'],
            'phone' => $phone,
            'email' => $data['email'] ?? null,
            'topic' => $data['topic'],
            'order_code' => $data['order_code'] ?? null,
            'message' => $data['message'],
            'ip' => $request->ip(),
        ]);

        return response()->json(['message' => 'Thank you. We will get back to you soon.'], 201);
    }
}
