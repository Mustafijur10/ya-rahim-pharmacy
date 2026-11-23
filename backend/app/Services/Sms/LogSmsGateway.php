<?php

namespace App\Services\Sms;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/** Development gateway: writes messages to the Laravel log instead of sending them. */
class LogSmsGateway implements SmsGateway
{
    public function send(string $phone, string $message): string
    {
        Log::channel(config('logging.default'))->info("[SMS to $phone] $message");

        return 'log-'.Str::random(10);
    }
}
