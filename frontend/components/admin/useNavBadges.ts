"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/providers/AuthProvider";
import { apiGet } from "@/lib/api";
import type { NavBadgeKey } from "@/lib/admin-nav";

type OrderStats = { new: number; rx_verification: number; packing: number; ready_for_pickup: number; out_for_delivery: number };
type InventorySummary = { tabs: { expiring: number; expired: number } };

/** Sidebar counters, refreshed every minute. Each only loads if the user can see that section. */
export function useNavBadges(): Partial<Record<NavBadgeKey, number>> {
  const { can } = useAuth();
  const refetchInterval = 60_000;

  const orders = useQuery({
    queryKey: ["badges", "orders"],
    queryFn: () => apiGet<OrderStats>("/admin/orders/stats"),
    enabled: can("orders", "full", "view"),
    refetchInterval,
  });
  const inventory = useQuery({
    queryKey: ["badges", "inventory"],
    queryFn: () => apiGet<InventorySummary>("/admin/inventory/summary"),
    enabled: can("inventory", "full", "view"),
    refetchInterval: 5 * refetchInterval,
  });
  const approvals = useQuery({
    queryKey: ["badges", "approvals"],
    queryFn: () => apiGet<{ meta: { total: number } }>("/admin/approvals", { status: "pending" }),
    refetchInterval,
  });

  const o = orders.data;
  return {
    orders: o ? o.new + o.rx_verification + o.packing + o.ready_for_pickup : undefined,
    rx: o?.rx_verification,
    expiry: inventory.data ? inventory.data.tabs.expiring + inventory.data.tabs.expired : undefined,
    approvals: approvals.data?.meta.total,
  };
}
