import { cacheLife, cacheTag } from "next/cache";
import { serverGet, serverGetOr } from "./server-api";
import type { Category, DeliveryArea, MedicineCard, MedicineDetail, StoreInfo } from "./types";

const EMPTY_STORE: StoreInfo = {
  name: "Ya Rahim Pharmacy",
  phone: null,
  whatsapp: null,
  email: null,
  address: null,
  area: null,
  opening_hours: null,
  hours_sat_thu: null,
  hours_friday: null,
  delivery_hours: null,
  drug_licence_no: null,
  trade_licence_no: null,
  tin_bin: null,
  since_year: null,
  map_url: null,
  payment_methods: ["cash"],
  same_day_cutoff: null,
};

/** Shop details for the header/footer. Cached; refreshed every few minutes. */
export async function getStoreInfo(): Promise<StoreInfo> {
  "use cache";
  cacheLife("minutes");
  cacheTag("store-settings");
  return (await serverGetOr<{ store: StoreInfo }>("/store/settings", { store: EMPTY_STORE })).store;
}

export type CategoryTree = Category & { children: Category[]; medicines_count: number };

export async function getCategories(): Promise<CategoryTree[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("categories");
  return (await serverGetOr<{ data: CategoryTree[] }>("/store/categories", { data: [] })).data;
}

export type HomeData = {
  categories: Category[];
  quick_filters: Category[];
  most_ordered: MedicineCard[];
  companies: { id: number; name: string; slug: string; logo: string | null }[];
};

/** Home page catalog blocks. Prices/stock may be up to a few minutes old; checkout re-prices. */
export async function getHome(): Promise<HomeData> {
  "use cache";
  cacheLife("minutes");
  cacheTag("home");
  return serverGetOr<HomeData>("/store/home", { categories: [], quick_filters: [], most_ordered: [], companies: [] });
}

/** Product page data, or null when the slug doesn't exist. */
export async function getMedicine(slug: string): Promise<MedicineDetail | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`medicine:${slug}`);
  try {
    return (await serverGet<{ data: MedicineDetail }>(`/store/medicines/${encodeURIComponent(slug)}`)).data;
  } catch {
    return null;
  }
}

export async function getDeliveryAreas(): Promise<{ data: DeliveryArea[]; pickup_ready_minutes: number; express_hours: number }> {
  "use cache";
  cacheLife("minutes");
  cacheTag("delivery-areas");
  return serverGetOr("/store/delivery-areas", { data: [], pickup_ready_minutes: 30, express_hours: 2 });
}

/** Placeholders like "[01XXX-XXXXXX]" from the seed are hidden until the owner fills them in. */
export function filled(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const s = String(value);
  return /^\[.*\]$/.test(s.trim()) || /\[[^\]]+\]/.test(s) ? null : s;
}

/** Like filled(), but keeps the bracketed placeholder so the owner can see what's missing. */
export function orPlaceholder(value: string | number | null | undefined, placeholder: string): string {
  return filled(value) ?? placeholder;
}
