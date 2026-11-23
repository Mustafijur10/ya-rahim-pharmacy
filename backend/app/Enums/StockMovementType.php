<?php

namespace App\Enums;

enum StockMovementType: string
{
    case Purchase = 'purchase';
    case Sale = 'sale';
    case SaleReturn = 'sale_return';
    case Cancel = 'cancel';
    case AdjustmentIn = 'adjustment_in';
    case AdjustmentOut = 'adjustment_out';
    case Expired = 'expired';
    case SupplierReturn = 'supplier_return';
}
