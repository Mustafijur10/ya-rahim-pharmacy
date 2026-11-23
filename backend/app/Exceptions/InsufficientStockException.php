<?php

namespace App\Exceptions;

class InsufficientStockException extends BusinessException
{
    public function __construct(string $medicineName, int $available, int $requested, int $medicineId)
    {
        parent::__construct(
            "Not enough stock for {$medicineName}: {$available} available, {$requested} requested.",
            'insufficient_stock',
            422,
            ['medicine_id' => $medicineId, 'available' => $available, 'requested' => $requested],
        );
    }
}
