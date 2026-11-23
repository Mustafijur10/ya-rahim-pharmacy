import { Suspense } from "react";
import { RequireModule } from "@/components/auth/Guards";
import OrdersBoard from "@/components/admin/orders/OrdersBoard";
import { PageLoader } from "@/components/ui/Feedback";

export default function OrdersPage() {
  return (
    <RequireModule module="orders" levels={["full", "view"]}>
      <Suspense fallback={<PageLoader />}>
        <OrdersBoard title="Online orders" subtitle="Website and phone orders · auto-refresh on" />
      </Suspense>
    </RequireModule>
  );
}
