<?php

namespace App\Http\Controllers\Api\Account;

use App\Enums\OrderStatus;
use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Http\Resources\OrderResource;
use App\Http\Resources\PrescriptionResource;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\Prescription;
use App\Models\PrescriptionPage;
use App\Services\OrderService;
use App\Services\PrescriptionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Signed-in customer: checkout, orders, addresses, prescriptions, refills. */
class AccountController extends Controller
{
    private function customer(Request $request): Customer
    {
        return $request->attributes->get('customer');
    }

    private function presentProfile(Request $request, Customer $customer): array
    {
        return $customer->only(['id', 'name', 'phone', 'email', 'date_of_birth', 'orders_count', 'total_spent', 'delivery_area_id', 'sms_reminders'])
            + ['has_password' => (bool) $request->user()->password];
    }

    public function profile(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->presentProfile($request, $this->customer($request))]);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'email' => ['nullable', 'email', 'max:150'],
            'date_of_birth' => ['nullable', 'date', 'before:today'],
            'delivery_area_id' => ['nullable', 'integer', 'exists:delivery_areas,id'],
            'sms_reminders' => ['boolean'],
        ]);
        $customer = $this->customer($request);
        $customer->update($data);
        $request->user()->update(['name' => $data['name']]);

        return response()->json(['data' => $this->presentProfile($request, $customer)]);
    }

    /** Optional password for the "Password" sign-in tab. Needs the current one if already set. */
    public function setPassword(Request $request): JsonResponse
    {
        $user = $request->user();
        $request->validate([
            'current_password' => [$user->password ? 'required' : 'nullable', 'string'],
            'password' => ['required', 'string', 'confirmed', Password::min(8)],
        ]);
        if ($user->password && ! Hash::check((string) $request->input('current_password'), $user->password)) {
            throw ValidationException::withMessages(['current_password' => 'Your current password is not correct.']);
        }

        $user->update(['password' => $request->input('password')]);

        return response()->json(['message' => 'Password saved. You can now sign in with your mobile number and password.']);
    }

    /* ---------------- Checkout & orders ---------------- */

    public function checkout(Request $request, OrderService $orders): JsonResponse
    {
        $customer = $this->customer($request);
        $data = $request->validate([
            'items' => ['required', 'array', 'min:1', 'max:50'],
            'items.*.medicine_id' => ['required', 'integer'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:500'],
            'items.*.pack_size_id' => ['nullable', 'integer'],
            'delivery_type' => ['required', 'in:express,standard,pickup'],
            'address_id' => ['nullable', 'integer'],
            'delivery_area_id' => ['nullable', 'integer'],
            'recipient_name' => ['required_without:address_id', 'nullable', 'string', 'max:100'],
            'recipient_phone' => ['required_without:address_id', 'nullable', 'string', 'max:20'],
            'delivery_address' => ['nullable', 'string', 'max:255'],
            'delivery_landmark' => ['nullable', 'string', 'max:255'],
            'payment_method' => ['required', Rule::in(['cash', 'pay_at_shop', 'bkash', 'nagad', 'card', 'sslcommerz'])],
            'prescription_id' => ['nullable', 'integer'],
            'customer_note' => ['nullable', 'string', 'max:500'],
            'save_address' => ['boolean'],
        ]);

        if (! empty($data['address_id'])) {
            $address = $customer->addresses()->findOrFail($data['address_id']);
            $data = array_merge($data, [
                'delivery_area_id' => $address->delivery_area_id,
                'recipient_name' => $address->recipient_name,
                'recipient_phone' => $address->phone,
                'delivery_address' => $address->address_line,
                'delivery_landmark' => $address->landmark,
            ]);
        }

        // Customers may only attach their own prescriptions.
        if (! empty($data['prescription_id'])
            && ! $customer->prescriptions()->whereKey($data['prescription_id'])->exists()) {
            throw new BusinessException('Prescription not found.', 'not_found', 404);
        }

        $order = DB::transaction(function () use ($orders, $data, $customer) {
            $order = $orders->placeOnline($data + ['channel' => 'online', 'branch_id' => Branch::default()->id], $customer);

            if (! empty($data['save_address']) && empty($data['address_id']) && $data['delivery_type'] !== 'pickup') {
                $customer->addresses()->create([
                    'label' => 'Home',
                    'delivery_area_id' => $data['delivery_area_id'] ?? null,
                    'recipient_name' => $data['recipient_name'],
                    'phone' => $data['recipient_phone'],
                    'address_line' => $data['delivery_address'],
                    'landmark' => $data['delivery_landmark'] ?? null,
                    'is_default' => ! $customer->addresses()->exists(),
                ]);
            }

            return $order;
        });

        return response()->json(['data' => new OrderResource($order->load(['items', 'payments']))], 201);
    }

    public function orders(Request $request): JsonResponse
    {
        $page = $this->customer($request)->orders()
            ->withCount('items')
            ->latest()
            ->paginate(15);

        return OrderResource::collection($page)->response();
    }

    public function order(Request $request, string $code): JsonResponse
    {
        $order = $this->customer($request)->orders()
            ->where('code', $code)
            ->with(['items', 'payments', 'prescription.pages', 'delivery.rider', 'statusHistory', 'deliveryArea'])
            ->firstOrFail();

        return response()->json(['data' => new OrderResource($order)]);
    }

    public function cancelOrder(Request $request, string $code, OrderService $orders): JsonResponse
    {
        $order = $this->customer($request)->orders()->where('code', $code)->firstOrFail();
        if (! in_array($order->status, [OrderStatus::New, OrderStatus::RxVerification], true)) {
            throw new BusinessException('This order is already being prepared. Please call the shop to cancel.', 'too_late');
        }
        $reason = $request->validate(['reason' => ['nullable', 'string', 'max:200']])['reason'] ?? null;

        $order = $orders->transition($order, OrderStatus::Cancelled, null, 'Cancelled by customer'.($reason ? ": $reason" : ''));

        return response()->json(['data' => new OrderResource($order)]);
    }

    /** Re-upload a prescription after the pharmacist rejected the first one. */
    public function attachPrescription(Request $request, string $code, OrderService $orders): JsonResponse
    {
        $customer = $this->customer($request);
        $order = $customer->orders()->where('code', $code)->firstOrFail();
        $id = (int) $request->validate(['prescription_id' => ['required', 'integer']])['prescription_id'];
        $prescription = $customer->prescriptions()->findOrFail($id);

        return response()->json(['data' => new OrderResource($orders->attachPrescription($order, $prescription))]);
    }

    /* ---------------- Addresses ---------------- */

    public function addresses(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->customer($request)->addresses()->with('deliveryArea:id,name')->orderByDesc('is_default')->get()]);
    }

    public function saveAddress(Request $request, ?int $id = null): JsonResponse
    {
        $customer = $this->customer($request);
        $data = $request->validate([
            'label' => ['nullable', 'string', 'max:30'],
            'delivery_area_id' => ['required', 'integer', 'exists:delivery_areas,id'],
            'recipient_name' => ['required', 'string', 'max:100'],
            'phone' => ['required', 'string', 'max:20'],
            'address_line' => ['required', 'string', 'max:255'],
            'landmark' => ['nullable', 'string', 'max:255'],
            'is_default' => ['boolean'],
        ]);

        $address = DB::transaction(function () use ($customer, $data, $id) {
            if (! empty($data['is_default'])) {
                $customer->addresses()->update(['is_default' => false]);
            }
            if ($id) {
                $address = $customer->addresses()->findOrFail($id);
                $address->update($data);

                return $address;
            }

            return $customer->addresses()->create($data + ['is_default' => ! $customer->addresses()->exists()]);
        });

        return response()->json(['data' => $address], $id ? 200 : 201);
    }

    public function deleteAddress(Request $request, int $id): JsonResponse
    {
        $this->customer($request)->addresses()->findOrFail($id)->delete();

        return response()->json(['message' => 'Address removed.']);
    }

    /* ---------------- Prescriptions ---------------- */

    public function prescriptions(Request $request): JsonResponse
    {
        $items = $this->customer($request)->prescriptions()->with(['pages', 'verifier'])->latest()->paginate(20);

        return PrescriptionResource::collection($items)->response();
    }

    public function uploadPrescription(Request $request, PrescriptionService $service): JsonResponse
    {
        $request->validate([
            'files' => ['required', 'array', 'min:1', 'max:'.PrescriptionService::MAX_PAGES],
            'files.*' => ['required', 'file', 'max:10240', 'mimetypes:'.implode(',', PrescriptionService::ALLOWED_MIMES)],
            'save_for_refill' => ['boolean'],
        ]);

        $prescription = $service->upload(
            $request->file('files'),
            $this->customer($request),
            $request->user(),
            $request->boolean('save_for_refill'),
        );

        return response()->json(['data' => new PrescriptionResource($prescription)], 201);
    }

    public function prescriptionPage(Request $request, int $prescriptionId, int $pageId): StreamedResponse
    {
        $prescription = $this->customer($request)->prescriptions()->findOrFail($prescriptionId);
        $page = PrescriptionPage::where('prescription_id', $prescription->id)->findOrFail($pageId);

        return Storage::disk($page->disk)->response($page->path, null, [
            'Cache-Control' => 'private, max-age=600',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    /* ---------------- Monthly refills ---------------- */

    public function refills(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $this->customer($request)->refillSubscriptions()
                ->with(['items.medicine:id,name,strength,dosage_form,slug', 'items.packSize:id,name'])
                ->latest()
                ->get(),
        ]);
    }

    public function createRefill(Request $request): JsonResponse
    {
        $customer = $this->customer($request);
        $data = $request->validate([
            'interval_days' => ['required', 'integer', 'min:7', 'max:120'],
            'next_refill_on' => ['required', 'date', 'after:today'],
            'delivery_type' => ['required', 'in:standard,express,pickup'],
            'address_id' => ['nullable', 'integer'],
            'prescription_id' => ['nullable', 'integer'],
            'items' => ['required', 'array', 'min:1', 'max:20'],
            'items.*.medicine_id' => ['required', 'integer', 'exists:medicines,id'],
            'items.*.pack_size_id' => ['nullable', 'integer'],
            'items.*.packs' => ['required', 'integer', 'min:1', 'max:50'],
        ]);
        if (! empty($data['address_id'])) {
            $customer->addresses()->findOrFail($data['address_id']);
        }
        if (! empty($data['prescription_id'])) {
            $customer->prescriptions()->findOrFail($data['prescription_id']);
        }

        $refill = DB::transaction(function () use ($customer, $data) {
            $refill = $customer->refillSubscriptions()->create([
                'interval_days' => $data['interval_days'],
                'next_refill_on' => $data['next_refill_on'],
                'delivery_type' => $data['delivery_type'],
                'address_id' => $data['address_id'] ?? null,
                'prescription_id' => $data['prescription_id'] ?? null,
                'status' => 'active',
            ]);
            foreach ($data['items'] as $item) {
                $refill->items()->create($item);
            }

            return $refill;
        });

        return response()->json(['data' => $refill->load('items')], 201);
    }

    public function updateRefill(Request $request, int $id): JsonResponse
    {
        $refill = $this->customer($request)->refillSubscriptions()->findOrFail($id);
        $data = $request->validate([
            'status' => ['sometimes', 'in:active,paused,cancelled'],
            'interval_days' => ['sometimes', 'integer', 'min:7', 'max:120'],
            'next_refill_on' => ['sometimes', 'date', 'after:today'],
        ]);
        $refill->update($data);

        return response()->json(['data' => $refill]);
    }
}
