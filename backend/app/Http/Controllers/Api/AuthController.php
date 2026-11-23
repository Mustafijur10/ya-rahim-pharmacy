<?php

namespace App\Http\Controllers\Api;

use App\Enums\Role;
use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\Customer;
use App\Models\User;
use App\Services\OtpService;
use App\Services\Sms\SmsService;
use App\Support\Features;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /** Staff sign-in with phone/email + password, or phone + PIN (counter). */
    public function staffLogin(Request $request): JsonResponse
    {
        // Either login (phone/email) + password|PIN, or user_id + PIN from the counter's name picker.
        $data = $request->validate([
            'login' => ['required_without:user_id', 'nullable', 'string', 'max:100'],
            'user_id' => ['required_without:login', 'nullable', 'integer'],
            'password' => ['required_without:pin', 'nullable', 'string', 'max:100'],
            'pin' => ['required_without:password', 'nullable', 'digits_between:4,6'],
            'remember' => ['boolean'],
        ]);

        if (! empty($data['user_id'])) {
            $user = User::staff()->find($data['user_id']);
        } else {
            $login = trim((string) $data['login']);
            $user = User::staff()
                ->where(fn ($q) => $q->where('email', $login)->orWhere('phone', preg_replace('/\D/', '', $login)))
                ->first();
        }

        $secretOk = $user && (
            ! empty($data['password'])
                ? ($user->password && Hash::check($data['password'], $user->password))
                : ($user->pin && Hash::check($data['pin'], $user->pin))
        );

        if (! $secretOk) {
            throw ValidationException::withMessages(['login' => 'The details you entered are not correct.']);
        }
        if (! $user->isActive()) {
            throw ValidationException::withMessages(['login' => 'Your account is inactive. Contact the owner.']);
        }

        Auth::guard('web')->login($user, (bool) ($data['remember'] ?? false));
        $request->session()->regenerate();
        activity('auth')->causedBy($user)->withProperties(['ip' => $request->ip(), 'method' => empty($data['pin']) ? 'password' : 'pin'])->log('Signed in');

        return response()->json(['user' => (new UserResource($user))->withPermissions(), 'features' => Features::all()]);
    }

    /** Step 1 of customer sign-in: SMS a 6-digit code. */
    public function requestOtp(Request $request, OtpService $otp): JsonResponse
    {
        $data = $request->validate(['phone' => ['required', 'string', 'max:20']]);
        $phone = $otp->send($data['phone']);

        return response()->json([
            'message' => 'We sent a 6-digit code to your phone.',
            'phone' => $phone,
            'expires_in' => OtpService::TTL_MINUTES * 60,
            'resend_in' => OtpService::RESEND_SECONDS,
        ]);
    }

    /** Step 2: check the code, then sign in (creating the account the first time). */
    public function verifyOtp(Request $request, OtpService $otp): JsonResponse
    {
        // Optional "Create account" fields are saved on the customer profile.
        $data = $request->validate([
            'phone' => ['required', 'string', 'max:20'],
            'code' => ['required', 'digits:6'],
            'name' => ['nullable', 'string', 'max:100'],
            'email' => ['nullable', 'email', 'max:150'],
            'delivery_area_id' => ['nullable', 'integer', 'exists:delivery_areas,id'],
            'sms_reminders' => ['nullable', 'boolean'],
            'remember' => ['nullable', 'boolean'],
        ]);

        $phone = $otp->verify($data['phone'], $data['code']);

        $user = DB::transaction(function () use ($phone, $data) {
            $user = User::withTrashed()->where('phone', $phone)->first();

            // A staff phone number must never get a session through the customer OTP flow.
            if ($user && $user->is_staff) {
                throw new BusinessException('This number belongs to a staff account. Please use the staff sign-in.', 'staff_account', 403);
            }
            if ($user?->trashed() || ($user && ! $user->isActive())) {
                throw new BusinessException('This account is disabled. Please call the shop.', 'inactive', 403);
            }

            $customer = Customer::where('phone', $phone)->first();
            $user ??= User::create([
                'name' => ($data['name'] ?? null) ?: ($customer?->name ?? 'Customer'),
                'phone' => $phone,
                'is_staff' => false,
                'status' => 'active',
            ]);
            $user->forceFill(['phone_verified_at' => now()])->save();

            $customer ??= Customer::create(['name' => $user->name, 'phone' => $phone]);
            $customer->fill(array_filter([
                'user_id' => $customer->user_id ?? $user->id,
                'email' => $data['email'] ?? null,
                'delivery_area_id' => $data['delivery_area_id'] ?? null,
            ], fn ($v) => $v !== null));
            if (isset($data['sms_reminders'])) {
                $customer->sms_reminders = (bool) $data['sms_reminders'];
            }
            $customer->save();

            return $user;
        });

        Auth::guard('web')->login($user, (bool) ($data['remember'] ?? true));
        $request->session()->regenerate();

        return response()->json(['user' => new UserResource($user->load('customer'))]);
    }

    /** Customer "Password" tab: mobile number + password (set from the account page). */
    public function customerLogin(Request $request): JsonResponse
    {
        $data = $request->validate([
            'phone' => ['required', 'string', 'max:20'],
            'password' => ['required', 'string', 'max:100'],
            'remember' => ['boolean'],
        ]);

        $phone = app(SmsService::class)->normalise($data['phone']);
        $user = $phone ? User::where('phone', $phone)->where('is_staff', false)->first() : null;

        if (! $user || ! $user->password || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages(['phone' => 'Mobile number or password is not correct. You can also sign in with an SMS code.']);
        }
        if (! $user->isActive()) {
            throw ValidationException::withMessages(['phone' => 'This account is disabled. Please call the shop.']);
        }

        Auth::guard('web')->login($user, (bool) ($data['remember'] ?? true));
        $request->session()->regenerate();

        return response()->json(['user' => new UserResource($user->load('customer'))]);
    }

    /**
     * Names for the counter's "choose your name" screen: first name, initials and role only
     * (no phone or email). Riders use the phone app, so they are left out.
     */
    public function staffDirectory(): JsonResponse
    {
        return response()->json([
            'data' => User::staff()
                ->where('status', 'active')
                ->whereNotNull('pin')
                ->with('roles:id,name')
                ->orderBy('name')
                ->get()
                ->reject(fn (User $u) => $u->hasRole('rider'))
                ->map(fn (User $u) => [
                    'id' => $u->id,
                    'name' => strtok($u->name, ' '),
                    'full_name' => $u->name,
                    'initials' => $u->initials(),
                    'role_label' => Role::tryFrom((string) $u->getRoleNames()->first())?->label(),
                    'staff_note' => $u->staff_note,
                ])
                ->values(),
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'features' => Features::all(),
            'user' => $user->is_staff
                ? (new UserResource($user))->withPermissions()
                : new UserResource($user->load('customer')),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['message' => 'Signed out.']);
    }
}
