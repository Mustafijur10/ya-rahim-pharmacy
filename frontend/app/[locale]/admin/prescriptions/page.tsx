import AdminPlaceholder from "@/components/admin/AdminPlaceholder";

export default function Page() {
  return <AdminPlaceholder titleKey="prescriptions" module="rx" levels={["full", "view"]} step="Step 7" description="Uploaded prescriptions and their status." />;
}
