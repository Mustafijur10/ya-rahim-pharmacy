<?php

namespace App\Jobs;

use App\Models\SmsLog;
use App\Services\Sms\SmsGateway;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

class SendSms implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public array $backoff = [30, 120];

    public function __construct(public int $smsLogId) {}

    public function handle(SmsGateway $gateway): void
    {
        $log = SmsLog::find($this->smsLogId);
        if (! $log || $log->status === 'sent') {
            return;
        }

        $ref = $gateway->send($log->phone, $log->message);
        $log->update(['status' => 'sent', 'provider_ref' => $ref, 'error' => null]);
    }

    public function failed(Throwable $e): void
    {
        SmsLog::whereKey($this->smsLogId)->update(['status' => 'failed', 'error' => $e->getMessage()]);
    }
}
