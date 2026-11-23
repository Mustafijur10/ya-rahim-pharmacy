"use client";

import { Hammer } from "lucide-react";
import { useTranslations } from "next-intl";
import { RequireModule } from "@/components/auth/Guards";
import { PageHeader } from "@/components/admin/AdminHeader";
import { EmptyState } from "@/components/ui/Feedback";
import type { Module, PermissionLevel } from "@/lib/types";

/** Shell page for admin screens not built yet. Already enforces who may open it. */
export default function AdminPlaceholder({
  titleKey,
  module,
  levels = ["full"],
  step,
  description,
}: {
  titleKey: string;
  module?: Module;
  levels?: PermissionLevel[];
  step: string;
  description?: string;
}) {
  const t = useTranslations();
  const body = (
    <div className="flex flex-col gap-6">
      <PageHeader title={t(`admin.nav.${titleKey}`)} />
      <EmptyState icon={<Hammer size={28} />} title={t("common.comingSoon", { step })} description={description} />
    </div>
  );

  return module ? (
    <RequireModule module={module} levels={levels}>
      {body}
    </RequireModule>
  ) : (
    body
  );
}
