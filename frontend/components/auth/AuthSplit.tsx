import { ArrowLeft, Clock3, FileUp, Headset, MapPin } from "lucide-react";
import type { ReactNode } from "react";
import Logo from "@/components/brand/Logo";
import { LanguageSwitch, ThemeToggle } from "@/components/common/Preferences";
import { Link } from "@/i18n/navigation";
import { filled, getStoreInfo } from "@/lib/store-data";

type Variant = "login" | "register" | "verify";

/** Two-panel layout from the Log in / Create account / Verify designs. */
export default async function AuthSplit({ children, variant }: { children: ReactNode; variant: Variant }) {
  const store = await getStoreInfo();
  const licence = filled(store.drug_licence_no);

  const benefits =
    variant === "register"
      ? [
          { icon: FileUp, title: "Upload a prescription once", text: "Reorder from your saved prescriptions." },
          { icon: Clock3, title: "Refill reminders", text: "An SMS before your monthly medicines run out." },
          { icon: Headset, title: "Pharmacist on call", text: "Ask about any medicine during shop hours." },
        ]
      : [
          { icon: FileUp, title: "Reorder in seconds", text: "Saved prescriptions and past orders, ready to repeat." },
          { icon: Clock3, title: "Refill reminders", text: "An SMS before your monthly medicines run out." },
          { icon: MapPin, title: "Shop or online — one account", text: "Purchases at the counter and online, in one history." },
        ];

  return (
    <div className="auth-split">
      <aside className="auth-panel">
        <span className="auth-panel-circle" aria-hidden="true" />
        <span className="auth-panel-ring" aria-hidden="true" />
        <div className="relative">
          <Logo size="md" onDark />
        </div>
        <div className="relative flex max-w-md flex-col gap-6">
          <h2 className="m-0 text-3xl leading-tight text-white">{variant === "register" ? "Your pharmacy, in your pocket." : "Your health, one tap away."}</h2>
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {benefits.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-3">
                <span className="auth-panel-icon" aria-hidden="true">
                  <Icon size={18} />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium text-white">{title}</span>
                  <span className="text-sm text-[#D9CCE3]">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <span className="relative text-sm text-[#B9AEC2]">Drug Licence No. {licence ?? "[number]"} · Registered pharmacist on duty</span>
      </aside>

      <main className="auth-main">
        <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
          <Link href="/" className="inline-flex items-center gap-1.5 font-medium">
            <ArrowLeft size={16} aria-hidden="true" />
            Back to shop
          </Link>
          <LanguageSwitch />
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center py-8">
          <div className="flex w-full max-w-md flex-col gap-6">
            <div className="lg:hidden">
              <Logo size="sm" />
            </div>
            {children}
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-5 text-sm text-muted">
          <Link href="/privacy">Privacy policy</Link>
          <Link href="/contact">Need help?</Link>
          <span>© Ya Rahim Pharmacy</span>
        </div>
      </main>
    </div>
  );
}
