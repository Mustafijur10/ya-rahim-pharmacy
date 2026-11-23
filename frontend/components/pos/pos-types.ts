export type PosPack = { id: number; name: string; short_name: string; units: number; is_default: boolean; mrp: number | null };

export type PosResult = {
  id: number;
  name: string;
  generic: string | null;
  company: string | null;
  barcode: string | null;
  rx_required: boolean;
  is_cold_chain: boolean;
  stock_units: number;
  stock_packs: number;
  low_stock: boolean;
  next_batch: { id: number; batch_no: string; expiry_date: string; expiry_level: "red" | "amber" | "green"; rack: string | null; unit_mrp: number } | null;
  pack_sizes: PosPack[];
};

/** One cart line (display info is kept so held sales can be resumed as they were). */
export type PosLine = {
  medicine_id: number;
  name: string;
  generic: string | null;
  pack_size_id: number | null;
  pack_name: string;
  pack_short: string;
  pack_units: number;
  packs: PosPack[];
  quantity: number;
  unit_mrp: number;
  rx_required: boolean;
  batch_no: string | null;
  rack: string | null;
  stock_units: number;
};

export type PosCustomer = { id: number; name: string; phone: string | null; orders_count?: number; notes?: string | null };

export type PosQuote = {
  lines: { medicine_id: number; pack_size_id: number | null; mrp_total: number; discount: number; total: number; in_stock: boolean; available_units: number }[];
  subtotal: number;
  discount_total: number;
  total: number;
  requires_rx: boolean;
  problems: { medicine_id: number; message: string }[];
  max_cashier_discount: number;
};

export type HeldCart = { items: { medicine_id: number; quantity: number; pack_size_id: number | null }[]; lines: PosLine[]; discount_percent: number; customer: PosCustomer | null };

export function lineKey(l: { medicine_id: number; pack_size_id: number | null }) {
  return `${l.medicine_id}:${l.pack_size_id ?? 0}`;
}

export function toLine(r: PosResult, pack?: PosPack): PosLine {
  const p = pack ?? r.pack_sizes.find((x) => x.is_default) ?? r.pack_sizes[0];
  return {
    medicine_id: r.id,
    name: r.name,
    generic: r.generic,
    pack_size_id: p?.id ?? null,
    pack_name: p?.name ?? "1 unit",
    pack_short: p?.short_name ?? "unit",
    pack_units: p?.units ?? 1,
    packs: r.pack_sizes,
    quantity: 1,
    unit_mrp: r.next_batch?.unit_mrp ?? 0,
    rx_required: r.rx_required,
    batch_no: r.next_batch?.batch_no ?? null,
    rack: r.next_batch?.rack ?? null,
    stock_units: r.stock_units,
  };
}
