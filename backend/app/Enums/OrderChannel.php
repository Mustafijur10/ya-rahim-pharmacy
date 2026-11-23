<?php

namespace App\Enums;

enum OrderChannel: string
{
    case Shop = 'shop';
    case Online = 'online';
    case Phone = 'phone';

    public function codePrefix(): string
    {
        return $this === self::Shop ? 'POS' : 'ON';
    }
}
