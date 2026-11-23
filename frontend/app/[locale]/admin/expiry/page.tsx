import AdminPlaceholder from "@/components/admin/AdminPlaceholder";

export default function Page() {
  return <AdminPlaceholder titleKey="expiry" module="inventory" levels={["full", "view"]} step="Step 7" description="Expired and soon-to-expire batches." />;
}
