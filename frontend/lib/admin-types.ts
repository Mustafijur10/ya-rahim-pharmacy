import type { Order, OrderStatusKey, Prescription } from "./types";

export type BatchRow = {
  id: number;
  batch_no: string;
  expiry_date: string;
  expiry_level: "red" | "amber" | "green";
  days_to_expiry: number;
  quantity: number;
  quantity_packs: number;
  pack_name: string | null;
  rack: string | null;
  mrp: number;
  mrp_per_pack: number;
  cost_price?: number;
  cost_per_pack?: number;
  medicine?: { id: number; name: string; short_name?: string; barcode?: string | null; generic: string | null; company: string | null; reorder_level: number; reorder_level_packs: number; rx_required: boolean; is_cold_chain: boolean };
  supplier?: { id: number; name: string } | null;
};

export type Approval = {
  id: number;
  type: "discount" | "refund" | "stock_adjustment" | "rx_release";
  status: "pending" | "approved" | "rejected";
  amount: number | null;
  data: Record<string, unknown> | null;
  reason: string | null;
  decision_note: string | null;
  requested_by?: { id: number; name: string };
  decided_by?: { id: number; name: string } | null;
  used: boolean;
  created_at: string;
  decided_at: string | null;
};

export type OwnerDashboard = {
  kpis: {
    sales_today: number;
    sales_today_shop: number;
    sales_today_online: number;
    sales_yesterday: number;
    orders_today: number;
    shop_orders_today: number;
    online_orders_today: number;
    open_online_orders: number;
    open_online_waiting_30: number;
    rx_waiting: number;
    rx_oldest_at: string | null;
    low_stock: number;
    expiring_90: number;
    expiring_90_cost: number;
    pending_approvals: number;
    gross_profit_today?: number;
  };
  chart: { date: string; label: string; shop: number; online: number }[];
  payments_today: { method: string; label: string; total: number; count: number }[];
  cash_in_drawers: number;
  recent_orders: Order[];
  expiring: BatchRow[];
  low_stock: { id: number; name: string; stock_units: number; reorder_level: number; pack: string | null; stock_packs: number; reorder_packs: number }[];
  hourly: { hour: number; shop: number; online: number }[];
  categories: { name: string; total: number }[];
  top_medicines: { id: number; name: string; packs: number; pack: string }[];
  target: { month: string; sold: number; target: number; days_left: number };
};

export type DrawerSummary = {
  opening_cash: number;
  cash_sales: number;
  cash_refunds: number;
  expected_cash: number;
  by_method: Record<string, { total: number; count: number }>;
  receipts: number;
};

export type CounterDashboard = {
  kpis: { sales_today: number; receipts_today: number; cash_today: number; digital_today: number; held_sales: number };
  shift: { id: number; counter_name: string; opened_at: string; opening_cash: string } | null;
  drawer: DrawerSummary | null;
  receipts: Order[];
  requests: Approval[];
};

export type PharmacistDashboard = {
  kpis: {
    rx_waiting: number;
    rx_oldest_at: string | null;
    verified_online_today: number;
    released_at_counter_today: number;
    rejected_today: number;
    expiring_30: number;
  };
  counter_requests: Approval[];
  rx_queue: (Order & { rx_items_count?: number })[];
  expiry_actions: BatchRow[];
  fridge: { temperature: string; location: string; recorded_at: string; user: { name: string } | null } | null;
};

/** Human text for an approval request ("10% discount on ৳2,180", "Release Monas 10 mg (Rx)"). */
export function approvalTitle(a: Approval): string {
  const meds = Array.isArray(a.data?.medicines) ? (a.data!.medicines as string[]).join(", ") : null;
  switch (a.type) {
    case "discount":
      return `${a.amount ?? "?"}% discount${a.data?.customer ? ` · ${a.data.customer}` : ""}`;
    case "refund":
      return `Refund ৳${a.amount ?? "?"}${a.data?.order ? ` · ${a.data.order}` : ""}`;
    case "stock_adjustment":
      return `Stock adjustment ${a.data?.quantity ?? ""}${a.data?.batch_no ? ` · batch ${a.data.batch_no}` : ""}`;
    case "rx_release":
      return `Release ${meds ?? "prescription medicine"} (Rx)`;
  }
}

export const APPROVER: Record<Approval["type"], string> = {
  discount: "Manager",
  refund: "Manager",
  stock_adjustment: "Owner",
  rx_release: "Pharmacist",
};

/* ---------------- 7d: orders, prescriptions, approvals ---------------- */
export type AdminPrescription = Prescription & {
  doctor_name?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  delivery_type?: string | null;
  customer_note?: string | null;
  customer?: { id: number; name: string; phone: string } | null;
  orders?: { id: number; code: string; status: OrderStatusKey }[];
};

export type AdminOrderItem = NonNullable<Order["items"]>[number] & {
  batch?: { id: number; batch_no: string; expiry_date: string; rack: string | null } | null;
};

export type AdminOrder = Omit<Order, "items" | "prescription" | "delivery" | "history"> & {
  payment_preference: string | null;
  payment_status: string | null;
  paid_amount: number;
  balance_due: number;
  delivery_fee: number;
  staff_note?: string | null;
  cancel_reason: string | null;
  placed_at: string | null;
  items_count?: number;
  customer?: { id: number; name: string; phone: string } | null;
  pharmacist?: { name: string; registration_no: string | null } | null;
  items?: AdminOrderItem[];
  prescription?: AdminPrescription | null;
  delivery?: {
    id: number;
    status: string;
    rider?: { id: number; name: string; phone: string } | null;
    courier_name: string | null;
    cash_to_collect: number;
    assigned_at: string | null;
  } | null;
  history?: { from: string | null; to: string; note: string | null; by: string | null; at: string }[];
};

export type OrderStats = {
  new: number;
  rx_verification: number;
  packing: number;
  ready_for_pickup: number;
  out_for_delivery: number;
  delivered_today: number;
  cancelled_today: number;
};

export type Rider = { id: number; name: string; phone: string; active_deliveries: number; cash_held: number };

export const PAY_LABEL: Record<string, string> = {
  cod: "Cash on delivery",
  pay_at_shop: "Pay at shop",
  bkash: "bKash",
  nagad: "Nagad",
  card: "Card",
};

/* ---------------- 7e: stock ---------------- */
export type InventorySummary = {
  medicines: number;
  batches: number;
  tabs: { all: number; low: number; expiring: number; expired: number; out: number };
  racks: string[];
  stock_value_cost?: number;
  stock_value_mrp?: number;
};

export type References = {
  categories: { id: number; parent_id: number | null; name: string }[];
  companies: { id: number; name: string }[];
  generics: { id: number; name: string }[];
  suppliers: { id: number; name: string; phone: string | null; balance: string }[];
};

export type Paged<T> = { data: T[]; current_page?: number; last_page?: number; total?: number; from?: number; to?: number; meta?: { current_page: number; last_page: number; total: number; from: number | null; to: number | null } };

/** Laravel paginator (plain or resource) → one shape. */
export function pageInfo(p: Paged<unknown> | undefined) {
  const m = p?.meta ?? p;
  return { page: m?.current_page ?? 1, last: m?.last_page ?? 1, total: m?.total ?? 0, from: m?.from ?? 0, to: m?.to ?? 0 };
}

export const MOVEMENT_LABEL: Record<string, string> = {
  purchase: "Purchase",
  sale: "Sale",
  sale_return: "Customer return",
  cancel: "Order cancelled",
  adjustment_in: "Adjustment +",
  adjustment_out: "Adjustment −",
  expired: "Written off (expired)",
  supplier_return: "Returned to supplier",
};
