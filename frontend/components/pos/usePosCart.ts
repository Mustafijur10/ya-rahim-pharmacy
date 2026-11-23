"use client";

import { useCallback, useEffect, useState } from "react";
import { lineKey, type HeldCart, type PosCustomer, type PosLine } from "./pos-types";

const KEY = "yr-pos-cart";

type State = { lines: PosLine[]; customer: PosCustomer | null; discount: number; heldSaleId: number | null };
const EMPTY: State = { lines: [], customer: null, discount: 0, heldSaleId: null };

function load(): State {
  if (typeof window === "undefined") return EMPTY;
  try {
    return { ...EMPTY, ...JSON.parse(sessionStorage.getItem(KEY) ?? "{}") };
  } catch {
    return EMPTY;
  }
}

/** Counter cart. Kept in this tab's sessionStorage so a refresh never loses a sale in progress. */
export function usePosCart() {
  const [state, setState] = useState<State>(load);

  useEffect(() => {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  }, [state]);

  const add = useCallback((line: PosLine) => {
    setState((s) => {
      const existing = s.lines.find((l) => lineKey(l) === lineKey(line));
      const lines = existing
        ? s.lines.map((l) => (l === existing ? { ...l, quantity: l.quantity + line.quantity } : l))
        : [...s.lines, line];
      return { ...s, lines };
    });
  }, []);

  const setQuantity = useCallback((key: string, quantity: number) => {
    setState((s) => ({ ...s, lines: quantity < 1 ? s.lines.filter((l) => lineKey(l) !== key) : s.lines.map((l) => (lineKey(l) === key ? { ...l, quantity: Math.min(1000, quantity) } : l)) }));
  }, []);

  const setPack = useCallback((key: string, packId: number) => {
    setState((s) => ({
      ...s,
      lines: s.lines.map((l) => {
        if (lineKey(l) !== key) return l;
        const p = l.packs.find((x) => x.id === packId);
        return p ? { ...l, pack_size_id: p.id, pack_name: p.name, pack_short: p.short_name, pack_units: p.units } : l;
      }),
    }));
  }, []);

  const remove = useCallback((key: string) => setState((s) => ({ ...s, lines: s.lines.filter((l) => lineKey(l) !== key) })), []);
  const setCustomer = useCallback((customer: PosCustomer | null) => setState((s) => ({ ...s, customer })), []);
  const setDiscount = useCallback((discount: number) => setState((s) => ({ ...s, discount: Math.max(0, Math.min(100, discount)) })), []);
  const clear = useCallback(() => setState(EMPTY), []);

  const resume = useCallback((cart: HeldCart, heldSaleId: number) => {
    setState({ lines: cart.lines ?? [], customer: cart.customer ?? null, discount: cart.discount_percent ?? 0, heldSaleId });
  }, []);

  const toHeld = useCallback(
    (): HeldCart => ({
      items: state.lines.map((l) => ({ medicine_id: l.medicine_id, quantity: l.quantity, pack_size_id: l.pack_size_id })),
      lines: state.lines,
      discount_percent: state.discount,
      customer: state.customer,
    }),
    [state],
  );

  return { ...state, add, setQuantity, setPack, remove, setCustomer, setDiscount, clear, resume, toHeld };
}
