import {
  BarChart3,
  Barcode,
  Building2,
  CheckCheck,
  ClipboardList,
  Clock3,
  Droplet,
  Globe,
  HeartPulse,
  LayoutDashboard,
  ListChecks,
  MapPin,
  MessageSquare,
  Monitor,
  Package,
  Pill,
  ReceiptText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Truck,
  Undo2,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { can } from "./permissions";
import type { Features, User } from "./types";

export type NavBadgeKey = "orders" | "rx" | "expiry" | "approvals" | "blood";

export type NavItem = {
  key: string;
  /** Key in messages admin.nav.* */
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: NavBadgeKey;
  /** Module switch that must be on ("Modules & features"). */
  feature?: string;
  visible: (u: User) => boolean;
};

export type NavSection = { key: "overview" | "sales" | "stock" | "community" | "business"; items: NavItem[] };

const anyStaff = () => true;

/** The sidebar from the design; each item shows only for roles that may open it and modules that are on. */
export const ADMIN_NAV: NavSection[] = [
  {
    key: "overview",
    items: [
      { key: "dashboard", label: "dashboard", href: "/admin", icon: LayoutDashboard, visible: (u) => can(u, "dashboard", "full", "view") && u.role !== "pharmacist" },
      { key: "pharmacist", label: "myWork", href: "/admin/pharmacist", icon: HeartPulse, visible: (u) => u.role === "pharmacist" },
      { key: "counter", label: "myCounter", href: "/admin/counter", icon: Monitor, visible: (u) => u.role === "cashier" },
      { key: "approvals", label: "approvals", href: "/admin/approvals", icon: CheckCheck, badge: "approvals", visible: anyStaff },
    ],
  },
  {
    key: "sales",
    items: [
      { key: "pos", label: "pos", href: "/admin/pos", icon: Monitor, visible: (u) => can(u, "pos") },
      { key: "orders", label: "orders", href: "/admin/orders", icon: ShoppingCart, badge: "orders", feature: "online_store", visible: (u) => can(u, "orders", "full", "view") },
      { key: "prescriptions", label: "prescriptions", href: "/admin/prescriptions", icon: ClipboardList, badge: "rx", visible: (u) => can(u, "rx", "full", "view") },
      { key: "returns", label: "returns", href: "/admin/returns", icon: Undo2, visible: (u) => can(u, "returns", "full", "view", "approval") },
      { key: "customers", label: "customers", href: "/admin/customers", icon: Users, visible: (u) => can(u, "customers", "full", "view") },
      { key: "day-close", label: "dayClose", href: "/admin/day-close", icon: Wallet, feature: "day_close", visible: (u) => can(u, "dashboard", "full") },
    ],
  },
  {
    key: "stock",
    items: [
      { key: "inventory", label: "inventory", href: "/admin/inventory", icon: Package, visible: (u) => can(u, "inventory", "full", "view") },
      { key: "medicines", label: "medicines", href: "/admin/medicines", icon: Pill, visible: (u) => can(u, "inventory", "full", "view") },
      { key: "purchases", label: "purchases", href: "/admin/purchases", icon: Truck, feature: "purchases", visible: (u) => can(u, "purchases") },
      { key: "suppliers", label: "suppliers", href: "/admin/suppliers", icon: Building2, feature: "purchases", visible: (u) => can(u, "purchases") },
      { key: "expiry", label: "expiry", href: "/admin/expiry", icon: Clock3, badge: "expiry", visible: (u) => can(u, "inventory", "full", "view") },
      { key: "labels", label: "labels", href: "/admin/labels", icon: Barcode, feature: "barcode_labels", visible: (u) => can(u, "inventory") },
    ],
  },
  {
    key: "community",
    items: [
      { key: "emergency", label: "emergency", href: "/admin/emergency", icon: HeartPulse, feature: "emergency_directory", visible: (u) => can(u, "dashboard", "full") },
      { key: "blood", label: "blood", href: "/admin/blood-requests", icon: Droplet, badge: "blood", feature: "blood_donors", visible: (u) => can(u, "dashboard", "full") },
    ],
  },
  {
    key: "business",
    items: [
      { key: "reports", label: "reports", href: "/admin/reports", icon: BarChart3, feature: "reports", visible: (u) => can(u, "dashboard", "full", "view") && u.role !== "pharmacist" },
      { key: "expenses", label: "expenses", href: "/admin/expenses", icon: ReceiptText, feature: "expenses", visible: (u) => can(u, "dashboard", "full") },
      { key: "website", label: "website", href: "/admin/website", icon: Globe, feature: "online_store", visible: (u) => can(u, "settings") },
      { key: "sms", label: "sms", href: "/admin/sms", icon: MessageSquare, visible: (u) => can(u, "settings") },
      { key: "delivery", label: "delivery", href: "/admin/delivery", icon: MapPin, feature: "home_delivery", visible: (u) => can(u, "settings") || can(u, "orders") },
      { key: "staff", label: "staff", href: "/admin/staff", icon: ShieldCheck, visible: (u) => can(u, "staff", "full", "view") },
      { key: "activity", label: "activity", href: "/admin/activity", icon: ListChecks, visible: (u) => can(u, "staff", "full", "view") },
      { key: "modules", label: "modules", href: "/admin/modules", icon: SlidersHorizontal, visible: (u) => can(u, "modules") },
      { key: "settings", label: "settings", href: "/admin/settings", icon: Settings, visible: (u) => can(u, "settings") },
    ],
  },
];

export function navFor(user: User, features: Features): NavSection[] {
  return ADMIN_NAV.map((s) => ({
    ...s,
    items: s.items.filter((i) => i.visible(user) && (!i.feature || features[i.feature] !== false)),
  })).filter((s) => s.items.length > 0);
}
