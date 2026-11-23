import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import Breadcrumbs from "@/components/store/Breadcrumbs";
import RxUploadForm from "@/components/store/RxUploadForm";

export const metadata: Metadata = {
  title: "Order with prescription",
  description: "Upload a photo of your prescription. Our registered pharmacist calls you to confirm the medicines and price.",
};

export default async function UploadPrescriptionPage({ params }: PageProps<"/[locale]/upload-prescription">) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="container-page flex flex-col gap-6 py-8">
      <Breadcrumbs items={[{ label: "Order with prescription" }]} />
      <div className="grid items-start gap-8 lg:grid-cols-[1fr_420px]">
        <section className="card-pad flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h1 className="m-0 text-3xl">Order with your prescription</h1>
            <p className="m-0 text-ink-2">No account needed. Send a clear photo of every page — our pharmacist calls you to confirm the medicines and the price before anything is packed.</p>
          </div>
          <RxUploadForm />
        </section>
        <aside className="flex flex-col gap-4">
          <section className="card-pad flex flex-col gap-3">
            <h2 className="m-0 text-lg">How it works</h2>
            <ol className="steps">
              <li>Upload the prescription</li>
              <li>Pharmacist calls to confirm items &amp; price</li>
              <li>Delivered, or ready for pickup</li>
            </ol>
          </section>
          <section className="notice-brand">
            <ShieldCheck size={22} aria-hidden="true" className="flex-none text-brand dark:text-brand-line" />
            <div className="flex flex-col gap-1 text-sm">
              <span className="font-bold">Your prescription stays private</span>
              <span className="text-ink-2">Only our pharmacists and the staff packing your order can see it. We never share it or use it for advertising.</span>
            </div>
          </section>
          <section className="card-pad flex flex-col gap-2 text-sm text-ink-2">
            <h2 className="m-0 text-lg text-ink">Tips for a clear photo</h2>
            <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
              <li>Doctor’s name, date and your name must be readable</li>
              <li>Take it in good light, flat on a table</li>
              <li>Include every page</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
