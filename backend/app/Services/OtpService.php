<?php

namespace App\Services;

use App\Exceptions\BusinessException;
use App\Models\OtpCode;
use App\Services\Sms\SmsService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/** One-time SMS codes for customer sign-in. Codes are stored hashed. */
class OtpService
{
    public const TTL_MINUTES = 5;

    public const RESEND_SECONDS = 60;

    public const MAX_ATTEMPTS = 5;

    public function __construct(private SmsService $sms) {}

    public function send(string $rawPhone, string $purpose = 'login'): string
    {
        $phone = $this->sms->normalise($rawPhone);
        if (! $phone) {
            throw new BusinessException('Enter a valid Bangladeshi mobile number, e.g. 01712345678.', 'invalid_phone');
        }

        $last = OtpCode::where('phone', $phone)->latest('id')->first();
        if ($last && $last->created_at->gt(now()->subSeconds(self::RESEND_SECONDS))) {
            $wait = self::RESEND_SECONDS - (int) $last->created_at->diffInSeconds(now());
            throw new BusinessException("Please wait {$wait} seconds before asking for a new code.", 'otp_throttled', 429);
        }

        $code = (string) random_int(100000, 999999);
        OtpCode::create([
            'phone' => $phone,
            'code_hash' => Hash::make($code),
            'purpose' => $purpose,
            'expires_at' => now()->addMinutes(self::TTL_MINUTES),
        ]);

        $this->sms->send($phone, "Your Ya Rahim Pharmacy code is $code. It expires in ".self::TTL_MINUTES.' minutes. Do not share it.', 'otp');

        return $phone;
    }

    /** @return string the normalised phone number on success */
    public function verify(string $rawPhone, string $code, string $purpose = 'login'): string
    {
        $phone = $this->sms->normalise($rawPhone) ?? throw new BusinessException('Invalid mobile number.', 'invalid_phone');

        return DB::transaction(function () use ($phone, $code, $purpose) {
            $otp = OtpCode::where('phone', $phone)
                ->where('purpose', $purpose)
                ->whereNull('used_at')
                ->latest('id')
                ->lockForUpdate()
                ->first();

            if (! $otp || $otp->expires_at->isPast()) {
                throw new BusinessException('The code has expired. Ask for a new one.', 'otp_expired');
            }
            if ($otp->attempts >= self::MAX_ATTEMPTS) {
                throw new BusinessException('Too many wrong attempts. Ask for a new code.', 'otp_locked', 429);
            }
            if (! Hash::check(trim($code), $otp->code_hash)) {
                $otp->increment('attempts');
                throw new BusinessException('The code is not correct.', 'otp_wrong');
            }

            $otp->update(['used_at' => now()]);

            return $phone;
        });
    }
}
