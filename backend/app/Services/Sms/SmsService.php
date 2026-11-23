<?php

namespace App\Services\Sms;

use App\Jobs\SendSms;
use App\Models\SmsLog;

class SmsService
{
    /** Queue an SMS. Every message is kept in sms_logs. */
    public function send(?string $phone, string $message, ?string $purpose = null): ?SmsLog
    {
        $phone = $this->normalise($phone);
        if ($phone === null) {
            return null;
        }

        $log = SmsLog::create([
            'phone' => $phone,
            'message' => $message,
            'purpose' => $purpose,
            'status' => 'queued',
        ]);

        SendSms::dispatch($log->id)->afterCommit();

        return $log;
    }

    /** Accepts 01XXXXXXXXX, +8801XXXXXXXXX or 8801XXXXXXXXX; returns 01XXXXXXXXX or null. */
    public function normalise(?string $phone): ?string
    {
        $digits = preg_replace('/\D/', '', (string) $phone);
        if (str_starts_with($digits, '880')) {
            $digits = substr($digits, 2);
        }

        return preg_match('/^01[3-9]\d{8}$/', $digits) ? $digits : null;
    }
}
