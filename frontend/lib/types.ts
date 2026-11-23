export type Role = "owner" | "manager" | "pharmacist" | "cashier" | "store_keeper" | "rider";

export type PermissionLevel = "full" | "view" | "approval" | "own";

export type Module =
  | "dashboard"
  | "profit"
  | "pos"
  | "discount_override"
  | "returns"
  | "orders"
  | "rx"
  | "inventory"
  | "stock_adjustment"
  | "purchases"
  | "customers"
  | "staff"
  | "settings"
  | "modules";

export type User = {
  id: number;
  name: string;
  initials: string;
  phone: string | null;
  email: string | null;
  is_staff: boolean;
  status: "active" | "inactive";
  role: Role | null;
  role_label: string | null;
  branch_id: number | null;
  shift: string | null;
  registration_no: string | null;
  staff_note: string | null;
  locale: string;
  permissions?: string[];
  customer?: { id: number; name: string; phone: string } | null;
};

export type Paginated<T> = {
  data: T[];
  meta: { current_page: number; last_page: number; per_page: number; total: number };
};

export type StoreInfo = {
  name: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  area: string | null;
  opening_hours: string | null;
  hours_sat_thu: string | null;
  hours_friday: string | null;
  delivery_hours: string | null;
  drug_licence_no: string | null;
  trade_licence_no: string | null;
  tin_bin: string | null;
  since_year: number | null;
  map_url: string | null;
  payment_methods: string[];
  same_day_cutoff: string | null;
};

export type PackOption = {
  id: number;
  name: string;
  short_name: string;
  units: number;
  is_default: boolean;
  price: Price | null;
  in_stock: boolean;
};

export type MedicineDetail = MedicineCard & {
  description: string | null;
  unit_name: string;
  packs_in_stock: number;
  pack_sizes: PackOption[];
  info: {
    therapeutic_class: string | null;
    overview: string | null;
    indications: string | null;
    side_effects: string | null;
    precautions: string | null;
    storage: string | null;
  } | null;
  alternatives: MedicineCard[];
};

export type Facet = { slug: string; name: string; name_bn?: string | null; count: number };

export type CatalogPage = Paginated<MedicineCard> & {
  meta: Paginated<MedicineCard>["meta"] & { from: number | null; to: number | null };
  category: { id: number; name: string; name_bn: string | null; slug: string } | null;
  facets: { types: Facet[]; brands: Facet[]; in_stock: number; on_discount: number; total: number };
};

export type DeliveryArea = {
  id: number;
  name: string;
  name_bn: string | null;
  standard_fee: string;
  express_fee: string | null;
  express_available: boolean;
};

export type QuoteLine = {
  medicine_id: number;
  slug: string;
  name: string;
  generic: string | null;
  pack_size_id: number | null;
  pack_name: string | null;
  quantity: number;
  units: number;
  rx_required: boolean;
  in_stock: boolean;
  available_units: number;
  mrp_total: number;
  discount: number;
  total: number;
};

export type Quote = {
  lines: QuoteLine[];
  subtotal: number;
  discount_total: number;
  delivery_fee: number;
  total: number;
  requires_rx: boolean;
  rx_item_count: number;
  problems: { medicine_id: number; message: string; available_units?: number }[];
  delivery_error: string | null;
  can_checkout: boolean;
};

export type Address = {
  id: number;
  label: string | null;
  delivery_area_id: number | null;
  delivery_area?: { id: number; name: string } | null;
  recipient_name: string;
  phone: string;
  address_line: string;
  landmark: string | null;
  is_default: boolean;
};

export type Prescription = {
  id: number;
  status: "pending" | "verified" | "rejected" | "expired";
  save_for_refill: boolean;
  pharmacist_note: string | null;
  reject_reason: string | null;
  verified_at: string | null;
  verified_by?: { name: string; registration_no: string | null } | null;
  pages?: { id: number; mime: string; size: number; url: string }[];
  created_at: string;
};

export type OrderStatusKey =
  | "new"
  | "rx_verification"
  | "packing"
  | "ready_for_pickup"
  | "out_for_delivery"
  | "delivered"
  | "completed"
  | "cancelled";

export type Order = {
  id: number;
  code: string;
  channel: "shop" | "online" | "phone";
  status: OrderStatusKey;
  status_label: string;
  delivery_type: "counter" | "pickup" | "standard" | "express";
  recipient_name: string | null;
  recipient_phone: string | null;
  delivery_address: string | null;
  delivery_landmark: string | null;
  delivery_area?: { id: number; name: string } | null;
  subtotal: number;
  discount_total: number;
  delivery_fee: number;
  total: number;
  paid_amount: number;
  balance_due: number;
  payment_status: string;
  requires_rx: boolean;
  customer_note: string | null;
  cancel_reason: string | null;
  placed_at: string | null;
  completed_at: string | null;
  created_at: string;
  items_count?: number;
  items?: {
    id: number;
    medicine_id: number;
    pack_size_id: number | null;
    name: string;
    quantity: number;
    quantity_label: string | null;
    unit_mrp: number;
    discount: number;
    line_total: number;
    rx_required: boolean;
    rx_status: string | null;
  }[];
  payments?: { id: number; method: string; method_label: string; amount: number; status: string }[];
  prescription?: Prescription | null;
  delivery?: {
    status: string;
    rider?: { name: string; phone: string } | null;
    otp_code?: string;
    cash_to_collect: number;
  } | null;
  history?: { from: string | null; to: string; note: string | null; at: string }[];
};

export type Category = {
  id: number;
  name: string;
  name_bn: string | null;
  slug: string;
  icon?: string | null;
};

export type Price = {
  mrp: number;
  price: number;
  discount_percent: number;
  saving: number;
  unit_price: number;
};

export type MedicineCard = {
  id: number;
  slug: string;
  name: string;
  full_name: string;
  strength: string | null;
  dosage_form: string | null;
  generic: { name: string; slug: string } | null;
  company: { name: string; slug: string } | null;
  category: { name: string; slug: string } | null;
  rx_required: boolean;
  is_cold_chain: boolean;
  image: string | null;
  pack: { id: number; name: string; short_name: string; units: number } | null;
  price: Price | null;
  in_stock: boolean;
  stock_status: "in_stock" | "low" | "out";
};

/** "Modules & features" switches, e.g. { blood_donors: true, card: false }. */
export type Features = Record<string, boolean>;
