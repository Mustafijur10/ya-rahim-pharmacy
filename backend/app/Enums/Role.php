<?php

namespace App\Enums;

/** Staff roles. Names match the spatie/permission role names. */
enum Role: string
{
    case Owner = 'owner';
    case Manager = 'manager';
    case Pharmacist = 'pharmacist';
    case Cashier = 'cashier';
    case StoreKeeper = 'store_keeper';
    case Rider = 'rider';

    public function label(): string
    {
        return match ($this) {
            self::Owner => 'Super admin',
            self::Manager => 'Manager',
            self::Pharmacist => 'Pharmacist',
            self::Cashier => 'Cashier',
            self::StoreKeeper => 'Store keeper',
            self::Rider => 'Delivery rider',
        };
    }

    /** Which app the role signs in to. */
    public function app(): string
    {
        return match ($this) {
            self::Rider => 'Rider phone app',
            self::Cashier => 'Counter (POS)',
            default => 'Admin dashboard',
        };
    }
}
