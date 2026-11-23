"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/** A cart line. Prices here are for display only; the server re-prices at checkout. */
export type CartLine = {
  medicine_id: number;
  pack_size_id: number | null;
  slug: string;
  name: string;
  pack_name: string | null;
  quantity: number;
  price: number;
  mrp: number;
  rx_required: boolean;
  image: string | null;
};

type CartContextValue = {
  lines: CartLine[];
  /** Number of lines (what the header badge shows); 0 until loaded to avoid hydration mismatch. */
  count: number;
  ready: boolean;
  add: (line: Omit<CartLine, "quantity">, quantity?: number) => void;
  setQuantity: (medicineId: number, packSizeId: number | null, quantity: number) => void;
  remove: (medicineId: number, packSizeId: number | null) => void;
  clear: () => void;
  requiresRx: boolean;
};

const STORAGE_KEY = "yr-cart";
const CartContext = createContext<CartContextValue | null>(null);

const same = (l: CartLine, id: number, pack: number | null) => l.medicine_id === id && l.pack_size_id === pack;

export default function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the saved cart once after mount
      if (Array.isArray(saved)) setLines(saved);
    } catch {
      /* corrupted storage: start empty */
    }
    setReady(true);

    // Keep several open tabs in sync.
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setLines(JSON.parse(e.newValue ?? "[]"));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  }, [lines, ready]);

  const add = useCallback((line: Omit<CartLine, "quantity">, quantity = 1) => {
    setLines((prev) => {
      const existing = prev.find((l) => same(l, line.medicine_id, line.pack_size_id));
      if (existing) {
        return prev.map((l) => (l === existing ? { ...l, ...line, quantity: Math.min(500, l.quantity + quantity) } : l));
      }
      return [...prev, { ...line, quantity }];
    });
  }, []);

  const setQuantity = useCallback((id: number, pack: number | null, quantity: number) => {
    setLines((prev) =>
      quantity < 1 ? prev.filter((l) => !same(l, id, pack)) : prev.map((l) => (same(l, id, pack) ? { ...l, quantity: Math.min(500, quantity) } : l)),
    );
  }, []);

  const remove = useCallback((id: number, pack: number | null) => setLines((prev) => prev.filter((l) => !same(l, id, pack))), []);
  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      count: ready ? lines.length : 0,
      ready,
      add,
      setQuantity,
      remove,
      clear,
      requiresRx: lines.some((l) => l.rx_required),
    }),
    [lines, ready, add, setQuantity, remove, clear],
  );

  return <CartContext value={value}>{children}</CartContext>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
