import AdminPlaceholder from "@/components/admin/AdminPlaceholder";

export default function Page() {
  return <AdminPlaceholder titleKey="inventory" module="inventory" levels={["full", "view"]} step="Step 7" description="Batches, expiry colours, low stock and stock adjustments." />;
}
