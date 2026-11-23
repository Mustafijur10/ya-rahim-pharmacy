<?php

namespace App\Services\Sms;

/** Implement this for the chosen Bangladesh SMS provider. */
interface SmsGateway
{
    /**
     * @return string provider reference / message id
     *
     * @throws \Throwable when the provider rejects the message
     */
    public function send(string $phone, string $message): string;
}
