<?php

namespace App\Enums;

enum DeliveryType: string
{
    case Counter = 'counter';
    case Pickup = 'pickup';
    case Standard = 'standard';
    case Express = 'express';

    public function needsRider(): bool
    {
        return in_array($this, [self::Standard, self::Express], true);
    }
}
