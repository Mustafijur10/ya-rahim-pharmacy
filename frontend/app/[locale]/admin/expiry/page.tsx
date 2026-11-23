"use client";

import { useEffect } from "react";
import { PageLoader } from "@/components/ui/Feedback";
import { useRouter } from "@/i18n/navigation";

/** "Expiry alerts" in the sidebar is the inventory list filtered to batches expiring within 90 days. */
export default function ExpiryPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/inventory?tab=expiring");
  }, [router]);
  return <PageLoader />;
}
