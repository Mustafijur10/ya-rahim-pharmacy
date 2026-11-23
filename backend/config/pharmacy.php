<?php

/*
 * Ya Rahim Pharmacy business settings that live in code.
 * Shop details the owner edits (address, fees, hours) live in the `settings` table.
 */
return [

    // Cashiers need manager approval for any discount above this percentage.
    'max_cashier_discount_percent' => 5,

    // Expiry colour thresholds (days).
    'expiry' => [
        'red_days' => 30,
        'amber_days' => 90,
    ],

    'order_code_prefix' => [
        'shop' => 'POS',
        'online' => 'ON',
    ],

    /*
     * Permission levels, as in the "Staff & roles" screen:
     *  full     = create, edit, delete
     *  view     = read only
     *  approval = can request; a manager must approve
     *  own      = only their own records (e.g. a rider's own deliveries)
     */
    'permission_levels' => ['full', 'view', 'approval', 'own'],

    // Module key => label shown in the permission grid.
    'modules' => [
        'dashboard' => 'Dashboard & sales reports',
        'profit' => 'Profit & cost prices',
        'pos' => 'POS — sell at counter',
        'discount_override' => 'Discount above 5%',
        'returns' => 'Returns & refunds',
        'orders' => 'Online orders',
        'rx' => 'Prescription verification',
        'inventory' => 'Inventory & expiry',
        'stock_adjustment' => 'Stock adjustment',
        'purchases' => 'Purchases & suppliers',
        'customers' => 'Customers',
        'staff' => 'Staff & roles',
        'settings' => 'Settings & payment accounts',
        'modules' => 'Modules & features (on/off)',
    ],

    /*
     * Parts of the system the Super admin can turn on or off ("Modules & features").
     * When off: menu items disappear for staff, website pages are hidden, data is kept.
     * core = cannot be turned off; requires = another feature that must be on.
     */
    'features' => [
        'store_sales' => [
            'label' => 'Store & sales',
            'items' => [
                'online_store' => ['label' => 'Online store (website)', 'help' => 'Customers can browse and order online'],
                'pos' => ['label' => 'POS — shop counter', 'help' => 'Sell at the counter', 'core' => true],
                'pay_at_shop' => ['label' => 'Pay at the shop', 'help' => 'Reserve online, pay at the counter'],
                'cash_on_delivery' => ['label' => 'Cash on delivery'],
                'bkash' => ['label' => 'bKash payments', 'help' => 'Needs merchant account in Settings', 'default' => false],
                'nagad' => ['label' => 'Nagad payments', 'help' => 'Needs merchant account in Settings', 'default' => false],
                'card' => ['label' => 'Card payments', 'help' => 'Needs payment gateway', 'default' => false],
                'customer_credit' => ['label' => 'Customer credit (baki)', 'help' => 'Allow selling on credit with limits'],
                'offers' => ['label' => 'Offers & coupons', 'help' => 'Promo codes and discounted items'],
            ],
        ],
        'pharmacy' => [
            'label' => 'Pharmacy',
            'items' => [
                'prescriptions' => ['label' => 'Prescription upload & verification', 'help' => 'Rx orders checked by pharmacist', 'core' => true],
                'refill_reminders' => ['label' => 'Refill reminders', 'help' => 'Monthly SMS reminders to customers'],
                'same_generic' => ['label' => 'Same-generic suggestions', 'help' => 'Show other brands of the same medicine'],
                'loose_sale' => ['label' => 'Loose tablet sale', 'help' => 'Sell single tablets'],
            ],
        ],
        'delivery' => [
            'label' => 'Delivery',
            'items' => [
                'home_delivery' => ['label' => 'Home delivery', 'help' => 'Riders and delivery zones'],
                'express_delivery' => ['label' => 'Express delivery (2 hours)', 'requires' => 'home_delivery'],
                'rider_app' => ['label' => 'Rider phone app', 'requires' => 'home_delivery'],
            ],
        ],
        'community' => [
            'label' => 'Community',
            'items' => [
                'emergency_directory' => ['label' => 'Emergency directory', 'help' => 'Hospitals, doctors, ambulances on the website'],
                'blood_donors' => ['label' => 'Blood donors', 'help' => 'Donor list and blood requests', 'requires' => 'emergency_directory'],
                'helplines' => ['label' => 'National helplines'],
            ],
        ],
        'business' => [
            'label' => 'Business',
            'items' => [
                'purchases' => ['label' => 'Purchases & suppliers'],
                'expenses' => ['label' => 'Expenses'],
                'reports' => ['label' => 'Reports'],
                'day_close' => ['label' => 'Day close'],
                'barcode_labels' => ['label' => 'Barcode labels', 'default' => false],
            ],
        ],
        'website' => [
            'label' => 'Website & app',
            'items' => [
                'dark_theme' => ['label' => 'Dark theme switch'],
                'bangla' => ['label' => 'Bangla language'],
                'customer_accounts' => ['label' => 'Customer accounts', 'help' => 'Login, orders, saved prescriptions'],
                'health_blog' => ['label' => 'Health tips / blog', 'default' => false],
            ],
        ],
    ],

    /*
     * Default grid. Columns: owner, manager, pharmacist, cashier, store_keeper, rider.
     * F = full, V = view, A = approval, O = own only, N = no access.
     */
    'role_order' => ['owner', 'manager', 'pharmacist', 'cashier', 'store_keeper', 'rider'],

    'default_matrix' => [
        'dashboard' => 'FFVONN',
        'profit' => 'FVNNNN',
        'pos' => 'FFFFNN',
        'discount_override' => 'FFNANN',
        'returns' => 'FFVANN',
        'orders' => 'FFFVNO',
        'rx' => 'FVFNNN',
        'inventory' => 'FFVVFN',
        'stock_adjustment' => 'FAANFN',
        'purchases' => 'FFNNFN',
        'customers' => 'FFVVNO',
        'staff' => 'FVNNNN',
        'settings' => 'FNNNNN',
        'modules' => 'FNNNNN',
    ],
];
