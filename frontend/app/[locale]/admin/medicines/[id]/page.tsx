"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import MedicineForm, { type MedicineRecord } from "@/components/admin/stock/MedicineForm";
import { RequireModule } from "@/components/auth/Guards";
import { ErrorState, PageLoader } from "@/components/ui/Feedback";
import type { BatchRow } from "@/lib/admin-types";
import { apiGet } from "@/lib/api";

export default function MedicinePage() {
  return (
    <RequireModule module="inventory">
      <Suspense fallback={<PageLoader />}>
        <Medicine />
      </Suspense>
    </RequireModule>
  );
}

function Medicine() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const isNew = id === "new";
  const sourceId = isNew ? params.get("from") : id;
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "medicine", sourceId],
    queryFn: () => apiGet<{ data: MedicineRecord; batches: BatchRow[] }>(`/admin/medicines/${sourceId}`),
    enabled: !!sourceId,
  });

  if (!sourceId) return <MedicineForm key="new" />;
  if (isLoading) return <PageLoader />;
  if (isError || !data) return <ErrorState message="Medicine not found." onRetry={() => refetch()} />;
  return <MedicineForm key={`${id}-${sourceId}`} initial={data.data} batches={data.batches} duplicate={isNew} />;
}
