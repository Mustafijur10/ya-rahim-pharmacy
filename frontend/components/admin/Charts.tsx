import { taka } from "@/lib/format";

/*
 * Charts drawn as SVG so sizes are SVG attributes, not CSS — the project keeps all
 * styling in styles/app.css and allows no inline style props. Colours come from classes.
 */

type Day = { label: string; shop: number; online: number };

/** "Sales — last 7 days, shop vs online" grouped bars. */
export function SalesBars({ days, locale = "en" }: { days: Day[]; locale?: string }) {
  const W = 640;
  const H = 220;
  const padL = 44;
  const padB = 28;
  const max = Math.max(1, ...days.flatMap((d) => [d.shop, d.online]));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const groupW = (W - padL) / days.length;
  const barW = Math.min(22, groupW / 3);
  const y = (v: number) => H - padB - (v / top) * (H - padB - 8);

  return (
    <figure className="m-0 flex flex-col gap-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`Sales by day: ${days.map((d) => `${d.label} shop ${taka(d.shop, locale)}, online ${taka(d.online, locale)}`).join("; ")}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="chart-axis">
              {t >= 1000 ? `${Math.round(t / 1000)}k` : t}
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          const cx = padL + groupW * i + groupW / 2;
          return (
            <g key={d.label + i}>
              <rect x={cx - barW - 2} y={y(d.shop)} width={barW} height={H - padB - y(d.shop)} rx={4} className="chart-bar-shop">
                <title>{`${d.label} · shop ${taka(d.shop, locale)}`}</title>
              </rect>
              <rect x={cx + 2} y={y(d.online)} width={barW} height={H - padB - y(d.online)} rx={4} className="chart-bar-online">
                <title>{`${d.label} · online ${taka(d.online, locale)}`}</title>
              </rect>
              <text x={cx} y={H - 8} textAnchor="middle" className="chart-axis">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/** In-shop / Online key shown at the top right of a chart panel. */
export function ShopOnlineLegend({ line = false }: { line?: boolean }) {
  return (
    <div className="flex gap-4 text-[13px] text-ink-2">
      <span className={`legend legend-shop ${line ? "legend-line" : ""}`}>In-shop</span>
      <span className={`legend legend-online ${line ? "legend-line" : ""}`}>Online</span>
    </div>
  );
}

function niceStep(max: number) {
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

/** A thin percentage bar (payments today). */
export function ShareBar({ percent, label }: { percent: number; label: string }) {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <svg viewBox="0 0 100 8" preserveAspectRatio="none" className="share-bar" role="img" aria-label={label}>
      <rect x="0" y="0" width="100" height="8" rx="4" className="share-bar-track" />
      <rect x="0" y="0" width={p} height="8" rx="4" className="share-bar-fill" />
    </svg>
  );
}

const hourLabel = (h: number, first: boolean, last: boolean) => {
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return first || last || h === 12 ? `${twelve}${h < 12 ? "am" : "pm"}` : String(twelve);
};

/** "Sales by hour — today": two lines (shop, online) with the busiest hour marked. */
export function HourlyLines({ hours, locale = "en" }: { hours: { hour: number; shop: number; online: number }[]; locale?: string }) {
  const W = 640;
  const H = 230;
  const padL = 44;
  const padR = 10;
  const top0 = 20;
  const base = 200;
  const max = Math.max(1, ...hours.flatMap((h) => [h.shop, h.online]));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const x = (i: number) => padL + (hours.length > 1 ? (i * (W - padL - padR)) / (hours.length - 1) : 0);
  const y = (v: number) => base - (v / top) * (base - top0);
  const busiest = hours.reduce((b, h, i) => (h.shop + h.online > hours[b].shop + hours[b].online ? i : b), 0);
  const hasSales = hours.some((h) => h.shop + h.online > 0);
  const series = [
    { key: "shop" as const, label: "In-shop", cls: "chart-line-shop" },
    { key: "online" as const, label: "Online", cls: "chart-line-online" },
  ];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`Sales by hour today. ${hasSales ? `Busiest hour ${hourLabel(hours[busiest].hour, true, true)}.` : "No sales yet."}`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className={t === 0 ? "chart-baseline" : "chart-grid"} />
          <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="chart-axis">
            {t >= 1000 ? `${+(t / 1000).toFixed(1)}k` : t}
          </text>
        </g>
      ))}
      {hours.map((h, i) =>
        i % 2 === 0 || i === hours.length - 1 ? (
          <text key={h.hour} x={x(i)} y={H - 10} textAnchor="middle" className="chart-axis">
            {hourLabel(h.hour, i === 0, i === hours.length - 1)}
          </text>
        ) : null,
      )}
      {hasSales && (
        <g>
          <line x1={x(busiest)} x2={x(busiest)} y1={top0} y2={base} className="chart-marker" />
          <text x={x(busiest) - 6} y={14} textAnchor={busiest > hours.length / 2 ? "end" : "start"} className="chart-axis chart-axis-strong">
            Busiest: {hourLabel(hours[busiest].hour, true, true).replace(/(am|pm)$/, " $1")}
          </text>
        </g>
      )}
      {series.map((s) => (
        <g key={s.key} className={s.cls}>
          <polyline points={hours.map((h, i) => `${x(i)},${y(h[s.key])}`).join(" ")} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {hours.map((h, i) => (
            <circle key={h.hour} cx={x(i)} cy={y(h[s.key])} r={4} strokeWidth={2}>
              <title>{`${hourLabel(h.hour, true, true)} — ${s.label}: ${taka(h[s.key], locale)}`}</title>
            </circle>
          ))}
        </g>
      ))}
    </svg>
  );
}

/** "Sales by category": donut with the day's total in the middle, legend beside it. */
export function CategoryDonut({ items, locale = "en" }: { items: { name: string; total: number }[]; locale?: string }) {
  const total = items.reduce((s, i) => s + i.total, 0);
  const r = 70;
  const C = 2 * Math.PI * r;
  const lens = items.map((it) => (total ? (it.total / total) * C : 0));
  const segs = items.map((it, i) => ({
    ...it,
    i,
    len: lens[i],
    offset: lens.slice(0, i).reduce((s, l) => s + l, 0),
    pct: total ? Math.round((it.total / total) * 100) : 0,
  }));

  return (
    <div className="donut">
      <svg viewBox="0 0 200 200" width={180} height={180} role="img" aria-label={`Today’s sales by category: ${segs.map((s) => `${s.name} ${s.pct}%`).join(", ") || "no sales yet"}`}>
        <circle cx={100} cy={100} r={r} fill="none" strokeWidth={26} className="donut-track" />
        {segs.map((s) =>
          s.len > 0 ? (
            <circle key={s.name} cx={100} cy={100} r={r} fill="none" strokeWidth={26} className={`series-${s.i}`} strokeDasharray={`${Math.max(0, s.len - (segs.length > 1 ? 2 : 0))} ${C}`} strokeDashoffset={-s.offset} transform="rotate(-90 100 100)">
              <title>{`${s.name}: ${s.pct}% · ${taka(s.total, locale)}`}</title>
            </circle>
          ) : null,
        )}
        <text x={100} y={96} textAnchor="middle" className="donut-value">
          {taka(total, locale)}
        </text>
        <text x={100} y={116} textAnchor="middle" className="chart-axis">
          today
        </text>
      </svg>
      <ul className="donut-legend">
        {segs.map((s) => (
          <li key={s.name}>
            <span className={`legend-swatch series-bg-${s.i}`} aria-hidden="true" />
            <span className="text-ink-2">{s.name}</span>
            <b>{s.pct}%</b>
            <span className="donut-amount">{taka(s.total, locale)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "Top-selling medicines": horizontal bars scaled to the best seller. */
export function TopBars({ items }: { items: { id: number; name: string; packs: number; pack: string }[] }) {
  const max = Math.max(1, ...items.map((i) => i.packs));
  return (
    <ul className="top-bars">
      {items.map((it) => {
        const label = `${+it.packs.toFixed(1)} ${it.pack}`;
        return (
          <li key={it.id}>
            <span className="truncate text-ink-2" title={it.name}>
              {it.name}
            </span>
            <svg viewBox="0 0 100 14" preserveAspectRatio="none" className="top-bar" role="img" aria-label={`${it.name}: ${label}`}>
              <rect x={0} y={0} width={100} height={14} rx={4} className="share-bar-track" />
              <rect x={0} y={0} width={(it.packs / max) * 100} height={14} rx={2} className="top-bar-fill" />
            </svg>
            <b className="text-right font-medium">{label}</b>
          </li>
        );
      })}
    </ul>
  );
}

/** "Monthly sales target": half-circle gauge. */
export function TargetGauge({ percent }: { percent: number }) {
  const f = Math.max(0, Math.min(1, percent / 100));
  const ang = Math.PI * f;
  const ex = 100 - 80 * Math.cos(ang);
  const ey = 100 - 80 * Math.sin(ang);
  return (
    <svg viewBox="0 0 200 116" width={240} role="img" aria-label={`${Math.round(percent)}% of this month’s sales target reached`}>
      <path d="M20 100 A80 80 0 0 1 180 100" fill="none" strokeWidth={18} strokeLinecap="round" className="gauge-track" />
      {f > 0 && <path d={`M20 100 A80 80 0 0 1 ${ex.toFixed(1)} ${ey.toFixed(1)}`} fill="none" strokeWidth={18} strokeLinecap="round" className="gauge-fill" />}
      <text x={100} y={88} textAnchor="middle" className="gauge-value">
        {Math.round(percent)}%
      </text>
      <text x={100} y={108} textAnchor="middle" className="chart-axis">
        of target
      </text>
    </svg>
  );
}
