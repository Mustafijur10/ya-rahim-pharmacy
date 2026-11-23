"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ClipboardList, FileUp, LogOut, MapPin, Package, Plus, Trash2, UserRound } from "lucide-react";
import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { RequireCustomer } from "@/components/auth/Guards";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/providers/ToastProvider";
import Button, { buttonClass } from "@/components/ui/Button";
import { StatusDot } from "@/components/ui/Data";
import { Checkbox, SelectField, TextField } from "@/components/ui/Field";
import { EmptyState, PageLoader } from "@/components/ui/Feedback";
import Modal from "@/components/ui/Modal";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { ApiError, apiGet, apiSend } from "@/lib/api";
import { date, phone, taka } from "@/lib/format";
import type { Address, DeliveryArea, Order, Paginated, Prescription } from "@/lib/types";

const TABS = [
  { key: "orders", label: "My orders", icon: Package },
  { key: "prescriptions", label: "Prescriptions", icon: ClipboardList },
  { key: "addresses", label: "Addresses", icon: MapPin },
  { key: "refills", label: "Monthly refills", icon: CalendarClock },
  { key: "profile", label: "Profile & security", icon: UserRound },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function AccountPage() {
  return (
    <RequireCustomer>
      <Suspense fallback={<PageLoader />}>
        <Account />
      </Suspense>
    </RequireCustomer>
  );
}

function Account() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const raw = useSearchParams().get("tab");
  const tab: TabKey = TABS.some((t) => t.key === raw) ? (raw as TabKey) : "orders";

  return (
    <div className="container-page flex flex-col gap-6 py-8">
      <div className="card-pad flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="avatar avatar-lg">{user?.initials}</span>
          <div className="flex flex-col">
            <h1 className="m-0 text-2xl">{user?.name}</h1>
            <span className="text-muted">{phone(user?.phone)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/upload-prescription" className={buttonClass("accent")}>
            <FileUp size={18} aria-hidden="true" />
            Upload prescription
          </Link>
          <Button
            variant="ghost"
            icon={<LogOut size={18} aria-hidden="true" />}
            onClick={async () => {
              await logout();
              router.replace("/");
            }}
          >
            Sign out
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[240px_1fr]">
        <nav aria-label="Account" className="account-nav">
          {TABS.map(({ key, label, icon: Icon }) => (
            <Link key={key} href={`${pathname}?tab=${key}`} replace scroll={false} className={`account-nav-link ${tab === key ? "account-nav-link-active" : ""}`} aria-current={tab === key ? "page" : undefined}>
              <Icon size={18} aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="min-w-0">
          {tab === "orders" && <OrdersTab />}
          {tab === "prescriptions" && <PrescriptionsTab />}
          {tab === "addresses" && <AddressesTab />}
          {tab === "refills" && <RefillsTab />}
          {tab === "profile" && <ProfileTab />}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Orders ---------------- */
function OrdersTab() {
  const locale = useLocale();
  const { data, isLoading } = useQuery({ queryKey: ["account", "orders"], queryFn: () => apiGet<Paginated<Order>>("/account/orders") });
  if (isLoading) return <PageLoader />;
  if (!data?.data.length) {
    return <EmptyState icon={<Package size={28} />} title="No orders yet" description="Online orders and shop purchases on your number appear here." action={<Link href="/medicines" className="btn-primary">Start shopping</Link>} />;
  }
  return (
    <section className="table-wrap">
      <table className="table">
        <caption className="sr-only">My orders</caption>
        <thead>
          <tr>
            <th scope="col">Order</th>
            <th scope="col">Date</th>
            <th scope="col">Items</th>
            <th scope="col">Total</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {data.data.map((o) => (
            <tr key={o.id}>
              <td>
                {o.channel === "shop" ? <span className="font-medium">{o.code}</span> : <Link href={`/order/${o.code}`} className="font-medium">{o.code}</Link>}
                <span className="block text-xs text-muted">{o.channel === "shop" ? "In shop" : o.delivery_type === "pickup" ? "Pickup" : "Delivery"}</span>
              </td>
              <td>{date(o.created_at, locale)}</td>
              <td>{o.items_count}</td>
              <td className="font-medium">{taka(o.total, locale)}</td>
              <td>
                <StatusDot status={o.status} label={o.status_label} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/* ---------------- Prescriptions ---------------- */
function PrescriptionsTab() {
  const locale = useLocale();
  const { data, isLoading } = useQuery({ queryKey: ["account", "prescriptions"], queryFn: () => apiGet<{ data: Prescription[] }>("/account/prescriptions") });
  if (isLoading) return <PageLoader />;
  if (!data?.data.length) {
    return <EmptyState icon={<ClipboardList size={28} />} title="No prescriptions yet" action={<Link href="/upload-prescription" className="btn-accent">Upload prescription</Link>} />;
  }
  const tone = { verified: "badge-stock", pending: "badge-warn", rejected: "badge-rx", expired: "badge-neutral" } as const;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {data.data.map((p) => (
        <article key={p.id} className="card-pad flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold">Prescription #{p.id}</span>
            <span className={tone[p.status]}>{p.status === "pending" ? "Waiting for check" : p.status}</span>
          </div>
          <span className="text-sm text-muted">Uploaded {date(p.created_at, locale)}{p.save_for_refill ? " · saved for refills" : ""}</span>
          {p.pharmacist_note && <p className="m-0 text-sm">Pharmacist: {p.pharmacist_note}</p>}
          {p.reject_reason && <p className="m-0 text-sm text-rx">{p.reject_reason}</p>}
          <div className="flex flex-wrap gap-2">
            {p.pages?.map((page, i) => (
              <a key={page.id} href={page.url} target="_blank" rel="noopener noreferrer" className="chip">
                View page {i + 1}
              </a>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

/* ---------------- Addresses ---------------- */
function AddressesTab() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({ queryKey: ["account", "addresses"], queryFn: () => apiGet<{ data: Address[] }>("/account/addresses") });
  const [editing, setEditing] = useState<Address | "new" | null>(null);
  if (isLoading) return <PageLoader />;

  async function remove(a: Address) {
    try {
      await apiSend("delete", `/account/addresses/${a.id}`);
      queryClient.invalidateQueries({ queryKey: ["account", "addresses"] });
      toast.success("Address removed");
    } catch (e) {
      toast.error((e as ApiError).message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => setEditing("new")}>
          Add address
        </Button>
      </div>
      {!data?.data.length ? (
        <EmptyState icon={<MapPin size={28} />} title="No saved addresses" description="Save your home or office for faster checkout." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {data.data.map((a) => (
            <article key={a.id} className="card-pad flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">{a.label ?? "Address"}</span>
                {a.is_default && <span className="badge-stock">Default</span>}
              </div>
              <span className="text-sm">
                {a.recipient_name} · {phone(a.phone)}
              </span>
              <span className="text-sm text-muted">
                {a.address_line}
                {a.landmark ? `, ${a.landmark}` : ""}
                {a.delivery_area ? ` — ${a.delivery_area.name}` : ""}
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setEditing(a)}>
                  Edit
                </Button>
                <Button variant="ghost" icon={<Trash2 size={16} aria-hidden="true" />} onClick={() => remove(a)}>
                  Remove
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      {editing && <AddressModal address={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function AddressModal({ address, onClose }: { address: Address | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const areas = useQuery({ queryKey: ["delivery-areas"], queryFn: () => apiGet<{ data: DeliveryArea[] }>("/store/delivery-areas") });
  const [form, setForm] = useState({
    label: address?.label ?? "Home",
    recipient_name: address?.recipient_name ?? "",
    phone: address?.phone ?? "",
    delivery_area_id: address?.delivery_area_id ? String(address.delivery_area_id) : "",
    address_line: address?.address_line ?? "",
    landmark: address?.landmark ?? "",
    is_default: address?.is_default ?? false,
  });
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await apiSend(address ? "put" : "post", address ? `/account/addresses/${address.id}` : "/account/addresses", { ...form, delivery_area_id: Number(form.delivery_area_id) || null });
      queryClient.invalidateQueries({ queryKey: ["account", "addresses"] });
      toast.success("Address saved");
      onClose();
    } catch (e) {
      setError(e as ApiError);
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={address ? "Edit address" : "Add address"} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>Save address</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Home, Office…" />
        <SelectField label="Area" value={form.delivery_area_id} onChange={(e) => setForm({ ...form, delivery_area_id: e.target.value })} error={error?.field("delivery_area_id")}>
          <option value="">Select area</option>
          {areas.data?.data.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </SelectField>
        <TextField label="Recipient name" value={form.recipient_name} onChange={(e) => setForm({ ...form, recipient_name: e.target.value })} error={error?.field("recipient_name")} />
        <TextField label="Mobile number" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} error={error?.field("phone")} />
        <TextField label="House, road" value={form.address_line} onChange={(e) => setForm({ ...form, address_line: e.target.value })} error={error?.field("address_line")} />
        <TextField label="Landmark" value={form.landmark} onChange={(e) => setForm({ ...form, landmark: e.target.value })} />
      </div>
      <Checkbox label="Use as my default address" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
    </Modal>
  );
}

/* ---------------- Monthly refills ---------------- */
type Refill = {
  id: number;
  interval_days: number;
  next_refill_on: string;
  delivery_type: string;
  status: "active" | "paused" | "cancelled";
  items: { id: number; packs: number; medicine: { id: number; name: string; strength: string | null; dosage_form: string | null } }[];
};

function RefillsTab() {
  const locale = useLocale();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({ queryKey: ["account", "refills"], queryFn: () => apiGet<{ data: Refill[] }>("/account/refills") });
  const [creating, setCreating] = useState(false);
  if (isLoading) return <PageLoader />;

  async function setStatus(r: Refill, status: Refill["status"]) {
    try {
      await apiSend("patch", `/account/refills/${r.id}`, { status });
      queryClient.invalidateQueries({ queryKey: ["account", "refills"] });
      toast.success(status === "active" ? "Reminders resumed" : status === "paused" ? "Reminders paused" : "Refill cancelled");
    } catch (e) {
      toast.error((e as ApiError).message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="notice-brand flex-col">
        <span className="font-bold">Never run out of your monthly medicines</span>
        <span className="text-sm text-ink-2">We SMS you a few days before the refill date and prepare it — delivered or ready at the counter.</span>
        <div>
          <Button icon={<Plus size={18} aria-hidden="true" />} onClick={() => setCreating(true)}>
            Set up a monthly refill
          </Button>
        </div>
      </div>
      {data?.data.map((r) => (
        <article key={r.id} className="card-pad flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold">Every {r.interval_days} days · next {date(r.next_refill_on, locale)}</span>
            <span className={r.status === "active" ? "badge-stock" : "badge-neutral"}>{r.status}</span>
          </div>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-sm">
            {r.items.map((i) => (
              <li key={i.id}>
                {[i.medicine.name, i.medicine.strength, i.medicine.dosage_form].filter(Boolean).join(" ")} × {i.packs}
              </li>
            ))}
          </ul>
          {r.status !== "cancelled" && (
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setStatus(r, r.status === "active" ? "paused" : "active")}>
                {r.status === "active" ? "Pause reminders" : "Resume"}
              </Button>
              <Button variant="ghost" onClick={() => setStatus(r, "cancelled")}>
                Cancel refill
              </Button>
            </div>
          )}
        </article>
      ))}
      {creating && <RefillModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function RefillModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const orders = useQuery({ queryKey: ["account", "orders", "with-items"], queryFn: () => apiGet<Paginated<Order>>("/account/orders") });
  const recent = orders.data?.data.filter((o) => o.status !== "cancelled").slice(0, 5) ?? [];
  const [orderCode, setOrderCode] = useState("");
  const order = useQuery({ queryKey: ["account", "order", orderCode], queryFn: () => apiGet<{ data: Order }>(`/account/orders/${orderCode}`), enabled: !!orderCode });
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [interval, setEvery] = useState("30");
  const [delivery, setDelivery] = useState("standard");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    const nextDate = new Date(Date.now() + Number(interval) * 86400000).toISOString().slice(0, 10);
    const items = Object.entries(picked).map(([medicine_id, packs]) => {
      const line = order.data?.data.items?.find((i) => i.medicine_id === Number(medicine_id));
      return { medicine_id: Number(medicine_id), pack_size_id: line?.pack_size_id ?? null, packs };
    });
    if (!items.length) {
      setError("Choose at least one medicine.");
      return;
    }
    setBusy(true);
    try {
      await apiSend("post", "/account/refills", { interval_days: Number(interval), next_refill_on: nextDate, delivery_type: delivery, items });
      queryClient.invalidateQueries({ queryKey: ["account", "refills"] });
      toast.success("Monthly refill set up", "We’ll remind you by SMS before it’s due.");
      onClose();
    } catch (e) {
      setError((e as ApiError).message);
      setBusy(false);
    }
  }

  const unique = Array.from(new Map((order.data?.data.items ?? []).map((i) => [i.medicine_id, i])).values());

  return (
    <Modal open onClose={onClose} title="Set up a monthly refill" description="Pick the medicines you take regularly from a past order." size="lg" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>Save refill</Button></>}>
      <SelectField label="From order" value={orderCode} onChange={(e) => { setOrderCode(e.target.value); setPicked({}); }}>
        <option value="">Choose an order</option>
        {recent.map((o) => (
          <option key={o.id} value={o.code}>
            {o.code} · {date(o.created_at)}
          </option>
        ))}
      </SelectField>
      {unique.length > 0 && (
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 text-sm font-medium">Medicines</legend>
          {unique.map((i) => (
            <div key={i.medicine_id} className="flex items-center gap-3">
              <Checkbox label={i.name} checked={i.medicine_id in picked} onChange={(e) => setPicked((p) => { const n = { ...p }; if (e.target.checked) n[i.medicine_id] = 1; else delete n[i.medicine_id]; return n; })} className="flex-1" />
              {i.medicine_id in picked && (
                <input className="input h-11 w-20" inputMode="numeric" aria-label={`Packs of ${i.name}`} value={picked[i.medicine_id]} onChange={(e) => setPicked({ ...picked, [i.medicine_id]: Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1) })} />
              )}
            </div>
          ))}
        </fieldset>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Every" value={interval} onChange={(e) => setEvery(e.target.value)}>
          <option value="15">15 days</option>
          <option value="30">30 days</option>
          <option value="60">60 days</option>
          <option value="90">90 days</option>
        </SelectField>
        <SelectField label="How do you want it?" value={delivery} onChange={(e) => setDelivery(e.target.value)}>
          <option value="standard">Home delivery</option>
          <option value="pickup">Pick up in shop</option>
        </SelectField>
      </div>
      {error && <p className="field-error m-0">{error}</p>}
    </Modal>
  );
}

/* ---------------- Profile ---------------- */
type Profile = { name: string; email: string | null; phone: string; delivery_area_id: number | null; sms_reminders: boolean; has_password: boolean };

function ProfileTab() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { refresh } = useAuth();
  const { data } = useQuery({ queryKey: ["account", "profile"], queryFn: () => apiGet<{ data: Profile }>("/account/profile") });
  const areas = useQuery({ queryKey: ["delivery-areas"], queryFn: () => apiGet<{ data: DeliveryArea[] }>("/store/delivery-areas") });
  if (!data) return <PageLoader />;
  return <ProfileForms key={JSON.stringify(data.data)} profile={data.data} areas={areas.data?.data ?? []} onSaved={() => { queryClient.invalidateQueries({ queryKey: ["account", "profile"] }); refresh(); toast.success("Saved"); }} />;
}

function ProfileForms({ profile, areas, onSaved }: { profile: Profile; areas: DeliveryArea[]; onSaved: () => void }) {
  const [form, setForm] = useState({ name: profile.name, email: profile.email ?? "", delivery_area_id: profile.delivery_area_id ? String(profile.delivery_area_id) : "", sms_reminders: profile.sms_reminders });
  const [pw, setPw] = useState({ current_password: "", password: "", password_confirmation: "" });
  const [error, setError] = useState<ApiError | null>(null);
  const [pwError, setPwError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState<"profile" | "password" | null>(null);

  async function saveProfile() {
    setBusy("profile");
    setError(null);
    try {
      await apiSend("put", "/account/profile", { ...form, email: form.email || null, delivery_area_id: Number(form.delivery_area_id) || null });
      onSaved();
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(null);
    }
  }

  async function savePassword() {
    setBusy("password");
    setPwError(null);
    try {
      await apiSend("put", "/account/password", pw);
      setPw({ current_password: "", password: "", password_confirmation: "" });
      onSaved();
    } catch (e) {
      setPwError(e as ApiError);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="card-pad flex flex-col gap-4">
        <h2 className="m-0 text-xl">Your details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={error?.field("name")} />
          <TextField label="Mobile number" value={phone(profile.phone)} disabled hint="Used to sign in. Call the shop to change it." />
          <TextField label="Email (optional)" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={error?.field("email")} />
          <SelectField label="Delivery area" value={form.delivery_area_id} onChange={(e) => setForm({ ...form, delivery_area_id: e.target.value })}>
            <option value="">Select area</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </SelectField>
        </div>
        <Checkbox label="Send me SMS reminders for monthly medicines" checked={form.sms_reminders} onChange={(e) => setForm({ ...form, sms_reminders: e.target.checked })} />
        <div>
          <Button loading={busy === "profile"} onClick={saveProfile}>
            Save details
          </Button>
        </div>
      </section>

      <section className="card-pad flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-xl">{profile.has_password ? "Change password" : "Set a password"}</h2>
          <p className="m-0 text-sm text-muted">Optional. With a password you can sign in without waiting for an SMS code.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {profile.has_password && <TextField label="Current password" type="password" autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} error={pwError?.field("current_password")} />}
          <TextField label="New password" type="password" autoComplete="new-password" hint="At least 8 characters" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} error={pwError?.field("password")} />
          <TextField label="Repeat new password" type="password" autoComplete="new-password" value={pw.password_confirmation} onChange={(e) => setPw({ ...pw, password_confirmation: e.target.value })} />
        </div>
        <div>
          <Button variant="outline" loading={busy === "password"} onClick={savePassword}>
            Save password
          </Button>
        </div>
      </section>
    </div>
  );
}
