"use client";

import { useId, useState } from "react";
import type { MedicineDetail } from "@/lib/types";

/** Overview / Indications / Side effects / Precautions / Storage (ARIA tabs with arrow-key support). */
export default function ProductInfoTabs({ medicine }: { medicine: MedicineDetail }) {
  const baseId = useId();
  const info = medicine.info;
  const tabs = [
    { key: "overview", label: "Overview", body: info?.overview ?? medicine.description },
    { key: "indications", label: "Indications", body: info?.indications },
    { key: "side_effects", label: "Side effects", body: info?.side_effects },
    { key: "precautions", label: "Precautions", body: info?.precautions },
    { key: "storage", label: "Storage", body: info?.storage },
  ];
  const [active, setActive] = useState(0);

  return (
    <section className="card overflow-hidden">
      <div
        role="tablist"
        aria-label="Medicine information"
        className="tabs"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") setActive((active + 1) % tabs.length);
          if (e.key === "ArrowLeft") setActive((active - 1 + tabs.length) % tabs.length);
        }}
      >
        {tabs.map((t, i) => (
          <button
            key={t.key}
            id={`${baseId}-tab-${i}`}
            role="tab"
            type="button"
            aria-selected={i === active}
            aria-controls={`${baseId}-panel`}
            tabIndex={i === active ? 0 : -1}
            className={`tab ${i === active ? "tab-active" : ""}`}
            onClick={() => setActive(i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-tab-${active}`} className="flex flex-col gap-4 p-6 leading-relaxed text-ink-2">
        <p className="m-0 whitespace-pre-line">{tabs[active].body || "Ask our pharmacist for details about this medicine."}</p>
        {active === 0 && (
          <dl className="info-list">
            {medicine.dosage_form && (
              <>
                <dt>Dosage form</dt>
                <dd>{medicine.dosage_form}</dd>
              </>
            )}
            {medicine.strength && (
              <>
                <dt>Strength</dt>
                <dd>{medicine.strength}</dd>
              </>
            )}
            <dt>How to take</dt>
            <dd>As directed by your physician</dd>
            {info?.therapeutic_class && (
              <>
                <dt>Therapeutic class</dt>
                <dd>{info.therapeutic_class}</dd>
              </>
            )}
          </dl>
        )}
        <p className="m-0 text-sm text-muted">Information is for reference only and does not replace advice from your doctor or pharmacist.</p>
      </div>
    </section>
  );
}
