<?php

namespace App\Enums;

enum OrderStatus: string
{
    case New = 'new';
    case RxVerification = 'rx_verification';
    case Packing = 'packing';
    case ReadyForPickup = 'ready_for_pickup';
    case OutForDelivery = 'out_for_delivery';
    case Delivered = 'delivered';
    case Completed = 'completed';
    case Cancelled = 'cancelled';

    public function label(): string
    {
        return match ($this) {
            self::New => 'New',
            self::RxVerification => 'Rx verification',
            self::Packing => 'Packing',
            self::ReadyForPickup => 'Ready for pickup',
            self::OutForDelivery => 'Out for delivery',
            self::Delivered => 'Delivered',
            self::Completed => 'Completed',
            self::Cancelled => 'Cancelled',
        };
    }

    /** Statuses an order may move to from this one. */
    public function next(): array
    {
        return match ($this) {
            self::New => [self::RxVerification, self::Packing, self::Cancelled],
            self::RxVerification => [self::Packing, self::Cancelled],
            self::Packing => [self::ReadyForPickup, self::OutForDelivery, self::Cancelled],
            self::ReadyForPickup => [self::Completed, self::Cancelled],
            self::OutForDelivery => [self::Delivered, self::Packing],
            self::Delivered => [self::Completed],
            self::Completed, self::Cancelled => [],
        };
    }

    public function canMoveTo(self $to): bool
    {
        return in_array($to, $this->next(), true);
    }

    public function isOpen(): bool
    {
        return ! in_array($this, [self::Completed, self::Cancelled, self::Delivered], true);
    }
}
