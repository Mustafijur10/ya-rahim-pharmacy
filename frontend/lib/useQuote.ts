"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiSend } from "./api";
import type { CartLine } from "@/components/providers/CartProvider";
import type { Quote } from "./types";

/** Live server prices and stock for the cart (prices in localStorage are only a hint). */
export function useQuote(lines: CartLine[], deliveryType?: string | null, areaId?: number | null) {
  const items = lines.map((l) => ({ medicine_id: l.medicine_id, pack_size_id: l.pack_size_id, quantity: l.quantity }));
  return useQuery({
    queryKey: ["quote", items, deliveryType ?? null, areaId ?? null],
    queryFn: () => apiSend<Quote>("post", "/store/cart/quote", { items, delivery_type: deliveryType || undefined, delivery_area_id: areaId || undefined }),
    enabled: items.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}
