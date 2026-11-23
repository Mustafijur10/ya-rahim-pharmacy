"use client";

import { Bike } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/ui/Feedback";

export default function RiderToday() {
  const t = useTranslations("common");
  return <EmptyState icon={<Bike size={28} />} title={t("comingSoon", { step: "Step 8" })} description="Current delivery, next stops, delivery code and cash held." />;
}
