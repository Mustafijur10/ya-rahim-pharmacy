"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { RequireModule } from "@/components/auth/Guards";
import OrdersBoard from "@/components/admin/orders/OrdersBoard";
import PrescriptionRequests from "@/components/admin/orders/PrescriptionRequests";
import { PageLoader } from "@/components/ui/Feedback";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { OrderStats } from "@/lib/admin-types";
import { apiGet } from "@/lib/api";

export default function PrescriptionsPage() {
  return (
    <RequireModule module="rx" levels={["full", "view"]}>
      <Suspense fallback={<PageLoader />}>
        <Prescriptions />
      </Suspense>
    </RequireModule>
  );
}

function Prescriptions() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = params.get("tab") === "requests" ? "requests" : "orders";
  const stats = useQuery({ queryKey: ["admin", "orders", "stats"], queryFn: () => apiGet<OrderStats>("/admin/orders/stats"), refetchInterval: 20_000 });
  const requests = useQuery({
    queryKey: ["admin", "prescriptions", "pending-count"],
    queryFn: () => apiGet<{ meta: { total: number } }>("/admin/prescriptions", { standalone: 1, status: "pending" }),
    refetchInterval: 30_000,
  });

  const tabs = (
    <div className="tabs" role="tablist" aria-label="Prescriptions">
      {(
        [
          ["orders", "On orders", stats.data?.rx_verification],
          ["requests", "Requests without an order", requests.data?.meta.total],
        ] as const
      ).map(([key, label, count]) => (
        <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "tab tab-active" : "tab"} onClick={() => router.replace(key === "orders" ? pathname : `${pathname}?tab=requests`, { scroll: false })}>
          {label}
          {!!count && <span className="badge-count">{count}</span>}
        </button>
      ))}
    </div>
  );

  return tab === "requests" ? (
    <PrescriptionRequests toolbar={tabs} />
  ) : (
    <OrdersBoard title="Prescriptions" subtitle="Orders waiting for a pharmacist to check the prescription" defaultStage="rx_verification" lockStage toolbar={tabs} />
  );
}
