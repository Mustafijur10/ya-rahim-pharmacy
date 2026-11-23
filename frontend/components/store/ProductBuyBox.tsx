"use client";

import { Minus, Plus, ShoppingCart, Zap } from "lucide-react";
import { useLocale } from "next-intl";
import { useState } from "react";
import { useCart } from "@/components/providers/CartProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { useRouter } from "@/i18n/navigation";
import { taka } from "@/lib/format";
import type { MedicineDetail } from "@/lib/types";

/** Pack size, price, quantity and the two buy buttons. */
export default function ProductBuyBox({ medicine }: { medicine: MedicineDetail }) {
  const locale = useLocale();
  const { add } = useCart();
  const toast = useToast();
  const router = useRouter();
  const packs = medicine.pack_sizes.filter((p) => p.price);
  const [packId, setPackId] = useState(packs.find((p) => p.is_default)?.id ?? packs[0]?.id);
  const [qty, setQty] = useState(1);
  const pack = packs.find((p) => p.id === packId);
  const unitLabel = medicine.unit_name === "cap" ? "cap" : medicine.unit_name === "tab" ? "tab" : medicine.unit_name;

  if (!pack?.price) {
    return <p className="m-0 text-muted">Price on request — please call the shop.</p>;
  }
  const maxPacks = Math.max(1, Math.floor((medicine.packs_in_stock * (medicine.pack?.units ?? 1)) / pack.units));

  function addToCart(goToCart: boolean) {
    add(
      {
        medicine_id: medicine.id,
        pack_size_id: pack!.id,
        slug: medicine.slug,
        name: medicine.full_name,
        pack_name: pack!.name,
        price: pack!.price!.price,
        mrp: pack!.price!.mrp,
        rx_required: medicine.rx_required,
        image: medicine.image,
      },
      qty,
    );
    if (goToCart) router.push("/cart");
    else toast.success(`${qty} × ${pack!.name} added to cart`);
  }

  return (
    <div className="flex flex-col gap-5">
      {packs.length > 1 && (
        <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
          <legend className="mb-2.5 text-sm font-medium">Pack size</legend>
          <div className="flex flex-wrap gap-2.5">
            {packs.map((p) => (
              <label key={p.id} className={`choice flex-[1_1_160px] items-center ${p.id === packId ? "choice-selected" : ""}`}>
                <input type="radio" name="pack" className="checkbox" checked={p.id === packId} onChange={() => setPackId(p.id)} disabled={!p.in_stock} />
                <span className="flex flex-col">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-sm text-muted">
                    {taka(p.price!.price, locale)}
                    {p.units > 1 && ` · ${taka(p.price!.unit_price, locale)} / ${unitLabel}`}
                    {!p.in_stock && " · not enough stock"}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="flex flex-wrap items-baseline gap-3">
        <span className="text-4xl font-bold">{taka(pack.price.price, locale)}</span>
        {pack.price.saving > 0 && (
          <>
            <span className="text-muted line-through">MRP {taka(pack.price.mrp, locale)}</span>
            <span className="badge-save">
              You save {taka(pack.price.saving, locale)} ({Math.round(pack.price.discount_percent)}%)
            </span>
          </>
        )}
      </div>

      {medicine.in_stock ? (
        <div className="flex flex-wrap items-center gap-3">
          <div className="stepper" role="group" aria-label="Quantity">
            <button type="button" className="stepper-button" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Decrease quantity" disabled={qty <= 1}>
              <Minus size={18} aria-hidden="true" />
            </button>
            <input
              className="stepper-input"
              inputMode="numeric"
              aria-label="Quantity"
              value={qty}
              onChange={(e) => setQty(Math.min(maxPacks, Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1)))}
            />
            <button type="button" className="stepper-button" onClick={() => setQty(Math.min(maxPacks, qty + 1))} aria-label="Increase quantity" disabled={qty >= maxPacks}>
              <Plus size={18} aria-hidden="true" />
            </button>
          </div>
          <button type="button" className="btn-primary btn-lg flex-[1_1_180px]" onClick={() => addToCart(false)}>
            <ShoppingCart size={20} aria-hidden="true" />
            Add to cart
          </button>
          <button type="button" className="btn-accent btn-lg flex-[1_1_140px]" onClick={() => addToCart(true)}>
            <Zap size={20} aria-hidden="true" />
            Buy now
          </button>
        </div>
      ) : (
        <div className="notice-warn">This item is out of stock right now. Call the shop and we’ll arrange it for you.</div>
      )}
    </div>
  );
}
