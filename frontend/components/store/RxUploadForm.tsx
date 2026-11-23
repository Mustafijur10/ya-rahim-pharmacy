"use client";

import { CheckCircle2, FileUp, Trash2, Upload } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import Button from "@/components/ui/Button";
import { Checkbox, TextField, TextareaField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Feedback";
import { Link } from "@/i18n/navigation";
import { ApiError, apiSend } from "@/lib/api";

const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

/**
 * "Order with your prescription": upload a photo, our pharmacist calls back with items and price.
 * Works for guests (name + mobile) and signed-in customers.
 */
export default function RxUploadForm({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const isCustomer = !!user && !user.is_staff;
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [delivery, setDelivery] = useState<"delivery" | "pickup">("delivery");
  const [saveForRefill, setSaveForRefill] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setError(null);
    const next = [...files];
    for (const f of Array.from(list)) {
      if (!ACCEPT.split(",").includes(f.type)) {
        setError(`${f.name}: only JPG, PNG, WEBP or PDF.`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        setError(`${f.name} is larger than 10 MB.`);
        continue;
      }
      if (next.length < MAX_FILES) next.push(f);
    }
    setFiles(next);
  }

  async function submit() {
    if (!files.length) {
      setError("Add a photo of your prescription first.");
      return;
    }
    setBusy(true);
    setError(null);
    setFieldErrors(null);
    const form = new FormData();
    files.forEach((f) => form.append("files[]", f));
    if (!isCustomer) {
      form.append("name", name);
      form.append("phone", phone);
    }
    form.append("delivery_type", delivery);
    if (note) form.append("note", note);
    form.append("save_for_refill", saveForRefill ? "1" : "0");

    try {
      await apiSend("post", "/store/prescription-requests", form);
      setDone(true);
    } catch (e) {
      const err = e as ApiError;
      setFieldErrors(err);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-start gap-3" role="status">
        <CheckCircle2 size={36} className="text-brand dark:text-brand-line" aria-hidden="true" />
        <h3 className="m-0 text-xl">Prescription received</h3>
        <p className="m-0 text-ink-2">Our pharmacist will call {isCustomer ? "you" : phone} shortly to confirm the medicines and price. We also sent you an SMS.</p>
        {isCustomer && (
          <Link href="/account?tab=prescriptions" className="btn-outline">
            See my prescriptions
          </Link>
        )}
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label
        htmlFor={inputId}
        className="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addFiles(e.dataTransfer.files);
        }}
      >
        <Upload size={28} aria-hidden="true" />
        <span className="font-medium">Take a photo or upload your prescription</span>
        <span className="text-sm text-muted">JPG, PNG or PDF · up to 10 MB · max {MAX_FILES} pages</span>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPT}
          capture="environment"
          multiple
          className="sr-only"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {files.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="file-row">
              <FileUp size={18} aria-hidden="true" className="flex-none text-brand dark:text-brand-line" />
              <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
              <span className="text-xs text-muted">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
              <button type="button" className="btn-icon btn-ghost" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!compact || files.length > 0 ? (
        <>
          {!isCustomer && (
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Your name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} error={fieldErrors?.field("name")} />
              <TextField label="Mobile number" type="tel" inputMode="tel" autoComplete="tel" placeholder="01712345678" required value={phone} onChange={(e) => setPhone(e.target.value)} error={fieldErrors?.field("phone")} />
            </div>
          )}
          <fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0">
            <legend className="mb-2 text-sm font-medium">How do you want it?</legend>
            {(
              [
                ["delivery", "Home delivery"],
                ["pickup", "Pick up in shop"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className={`choice min-h-11 flex-1 items-center py-2 ${delivery === value ? "choice-selected" : ""}`}>
                <input type="radio" name="rx-delivery" className="checkbox" checked={delivery === value} onChange={() => setDelivery(value)} />
                {label}
              </label>
            ))}
          </fieldset>
          {!compact && <TextareaField label="Note for the pharmacist (optional)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}
          {isCustomer && <Checkbox label="Save this prescription for monthly refills and SMS reminders" checked={saveForRefill} onChange={(e) => setSaveForRefill(e.target.checked)} />}
        </>
      ) : null}

      {error && <Notice tone="rx">{error}</Notice>}

      <Button type="submit" variant="accent" size="lg" loading={busy} icon={<FileUp size={20} aria-hidden="true" />} block>
        Send to pharmacist
      </Button>
      {!isCustomer && (
        <p className="m-0 text-center text-sm text-muted">
          Have an account? <Link href="/login?next=/upload-prescription">Log in</Link> to keep it in your history.
        </p>
      )}
    </form>
  );
}
