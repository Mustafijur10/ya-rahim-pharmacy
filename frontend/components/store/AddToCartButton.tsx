"use client";

import { Check, Plus, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { useCart } from "@/components/providers/CartProvider";
import { useToast } from "@/components/providers/ToastProvider";
import type { MedicineCard } from "@/lib/types";

type Props = {
  medicine: Pick<MedicineCard, "id" | "slug" | "full_name" | "rx_required" | "image" | "in_stock">;
  pack: { id: number; name: string } | null;
  price: number;
  mrp: number;
  quantity?: number;
  variant?: "full" | "icon";
  className?: string;
};

export default function AddToCartButton({ medicine, pack, price, mrp, quantity = 1, variant = "full", className = "" }: Props) {
  const { add } = useCart();
  const toast = useToast();
  const [added, setAdded] = useState(false);

  function onAdd() {
    add(
      {
        medicine_id: medicine.id,
        pack_size_id: pack?.id ?? null,
        slug: medicine.slug,
        name: medicine.full_name,
        pack_name: pack?.name ?? null,
        price,
        mrp,
        rx_required: medicine.rx_required,
        image: medicine.image,
      },
      quantity,
    );
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
    toast.success(`${medicine.full_name} added to cart`, medicine.rx_required ? "Prescription needed at checkout." : undefined);
  }

  if (!medicine.in_stock) {
    return (
      <button type="button" className={`${variant === "icon" ? "btn-icon btn-ghost" : "btn-ghost w-full"} ${className}`} disabled>
        {variant === "icon" ? <ShoppingCart size={18} aria-hidden="true" /> : "Out of stock"}
      </button>
    );
  }

  if (variant === "icon") {
    return (
      <button type="button" className={`btn-icon btn-primary ${className}`} onClick={onAdd} aria-label={`Add ${medicine.full_name} to cart`}>
        {added ? <Check size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}
      </button>
    );
  }

  return (
    <button type="button" className={`btn-primary w-full ${className}`} onClick={onAdd}>
      {added ? <Check size={18} aria-hidden="true" /> : <ShoppingCart size={18} aria-hidden="true" />}
      {added ? "Added" : "Add to cart"}
    </button>
  );
}
