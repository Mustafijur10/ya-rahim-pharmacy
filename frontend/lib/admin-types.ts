import type { Order } from "./types";

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
  medicine?: { id: number; name: string; generic: string | null; company: string | null; reorder_level: number; reorder_level_packs: number; rx_required: boolean; is_cold_chain: boolean };
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
