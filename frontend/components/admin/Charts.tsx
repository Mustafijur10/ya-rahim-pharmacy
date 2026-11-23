"use client";

import type { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";
import { useMemo } from "react";
import { useTheme } from "@/components/providers/ThemeProvider";
import { taka } from "@/lib/format";

/*
 * Dashboard charts (ApexCharts). Colours are read from the CSS variables in styles/app.css
 * (--color-chart-1…5, --color-muted, --color-line), so the palette still lives in one file
 * and follows the light/dark theme.
 */
const ApexChart = dynamic(() => import("react-apexcharts"), { ssr: false, loading: () => <div className="chart-loading" aria-hidden="true" /> });

type Palette = { series: string[]; muted: string; line: string; ink: string; surface: string; dark: boolean };

function usePalette(): Palette {
  const { resolved } = useTheme();
  return useMemo(() => {
    const fallback = ["#8E4FB8", "#E0603F", "#2A9D8F", "#D9A21B", "#4F7FD9"];
    if (typeof window === "undefined") return { series: fallback, muted: "#655C6B", line: "#ECE6F0", ink: "#221A29", surface: "#F6F2F8", dark: resolved === "dark" };
    const css = getComputedStyle(document.documentElement);
    const v = (name: string, fb: string) => css.getPropertyValue(name).trim() || fb;
    return {
      series: fallback.map((fb, i) => v(`--color-chart-${i + 1}`, fb)),
      muted: v("--color-muted", "#655C6B"),
      line: v("--color-line", "#ECE6F0"),
      ink: v("--color-ink", "#221A29"),
      surface: v("--color-surface", "#F6F2F8"),
      dark: resolved === "dark",
    };
  }, [resolved]);
}

function base(p: Palette): ApexOptions {
  return {
    chart: { fontFamily: "inherit", foreColor: p.muted, toolbar: { show: false }, zoom: { enabled: false }, background: "transparent", parentHeightOffset: 0, animations: { speed: 400 } },
    theme: { mode: p.dark ? "dark" : "light" },
    grid: { borderColor: p.line, strokeDashArray: 0, padding: { left: 4, right: 8 } },
    dataLabels: { enabled: false },
    legend: { show: false },
    tooltip: { theme: p.dark ? "dark" : "light" },
    states: { hover: { filter: { type: "darken" } } },
  };
}

const short = (v: number) => (v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : `${Math.round(v)}`);

/** "Sales — last 7/30 days": grouped columns, shop vs online. */
export function SalesBars({ days, locale = "en" }: { days: { label: string; shop: number; online: number }[]; locale?: string }) {
  const p = usePalette();
  const options: ApexOptions = {
    ...base(p),
    colors: [p.series[0], p.series[1]],
    plotOptions: { bar: { columnWidth: days.length > 10 ? "70%" : "45%", borderRadius: 4, borderRadiusApplication: "end" } },
    xaxis: { categories: days.map((d) => d.label), axisBorder: { color: p.line }, axisTicks: { show: false }, labels: { rotate: 0, hideOverlappingLabels: true } },
    yaxis: { labels: { formatter: short } },
    tooltip: { ...base(p).tooltip, shared: true, intersect: false, y: { formatter: (v) => taka(v, locale) } },
  };
  return (
    <ApexChart
      type="bar"
      height={260}
      options={options}
      series={[
        { name: "In-shop", data: days.map((d) => d.shop) },
        { name: "Online", data: days.map((d) => d.online) },
      ]}
    />
  );
}

const hourName = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "am" : "pm"}`;

/** "Sales by hour — today": smooth lines with the busiest hour marked. */
export function HourlyLines({ hours, locale = "en" }: { hours: { hour: number; shop: number; online: number }[]; locale?: string }) {
  const p = usePalette();
  const busiest = hours.reduce((b, h, i) => (h.shop + h.online > hours[b].shop + hours[b].online ? i : b), 0);
  const hasSales = hours.some((h) => h.shop + h.online > 0);
  const options: ApexOptions = {
    ...base(p),
    colors: [p.series[0], p.series[1]],
    stroke: { curve: "monotoneCubic", width: 3 },
    fill: { type: "gradient", gradient: { shadeIntensity: 0, opacityFrom: 0.28, opacityTo: 0.02, stops: [0, 95] } },
    markers: { size: 0, hover: { size: 5 } },
    xaxis: { categories: hours.map((h) => hourName(h.hour)), axisBorder: { color: p.line }, axisTicks: { show: false }, tickAmount: 6, labels: { rotate: 0 } },
    yaxis: { labels: { formatter: short } },
    tooltip: { ...base(p).tooltip, shared: true, intersect: false, y: { formatter: (v) => taka(v, locale) } },
    annotations: hasSales
      ? {
          xaxis: [
            {
              x: hourName(hours[busiest].hour),
              borderColor: p.muted,
              strokeDashArray: 4,
              label: { text: `Busiest: ${hourName(hours[busiest].hour)}`, orientation: "horizontal", borderWidth: 0, style: { background: p.ink, color: p.dark ? "#221A29" : "#FFFFFF", fontSize: "11px" } },
            },
          ],
        }
      : undefined,
  };
  return (
    <ApexChart
      type="area"
      height={260}
      options={options}
      series={[
        { name: "In-shop", data: hours.map((h) => h.shop) },
        { name: "Online", data: hours.map((h) => h.online) },
      ]}
    />
  );
}

/** "Sales by category": donut with today's total in the middle. */
export function CategoryDonut({ items, locale = "en" }: { items: { name: string; total: number }[]; locale?: string }) {
  const p = usePalette();
  const total = items.reduce((s, i) => s + i.total, 0);
  const options: ApexOptions = {
    ...base(p),
    colors: p.series,
    labels: items.map((i) => i.name),
    stroke: { width: 2, colors: [p.dark ? "#2B1638" : "#FFFFFF"] },
    legend: { show: true, position: "bottom", fontSize: "13px", labels: { colors: p.ink }, markers: { size: 6, shape: "square" }, itemMargin: { horizontal: 8, vertical: 4 }, formatter: (name, o) => `${name} · ${Math.round(((items[o?.seriesIndex ?? 0]?.total ?? 0) / (total || 1)) * 100)}%` },
    plotOptions: {
      pie: {
        donut: {
          size: "68%",
          labels: {
            show: true,
            value: { fontSize: "20px", fontWeight: 700, color: p.ink, formatter: (v) => taka(Number(v), locale) },
            total: { show: true, label: "Today", fontSize: "12px", color: p.muted, formatter: () => taka(total, locale) },
          },
        },
      },
    },
    tooltip: { ...base(p).tooltip, y: { formatter: (v) => `${taka(v ?? 0, locale)} · ${Math.round(((v ?? 0) / (total || 1)) * 100)}%` } },
  };
  return <ApexChart type="donut" height={300} options={options} series={items.map((i) => i.total)} />;
}

/** "Top-selling medicines": horizontal bars in packs. */
export function TopBars({ items }: { items: { id: number; name: string; packs: number; pack: string }[] }) {
  const p = usePalette();
  const options: ApexOptions = {
    ...base(p),
    colors: [p.series[0]],
    plotOptions: { bar: { horizontal: true, barHeight: "55%", borderRadius: 4, borderRadiusApplication: "end", distributed: false } },
    dataLabels: { enabled: true, textAnchor: "middle", style: { fontSize: "12px", fontWeight: 600, colors: ["#FFFFFF"] }, formatter: (v, o) => `${v} ${items[o?.dataPointIndex ?? 0]?.pack ?? ""}` },
    xaxis: { categories: items.map((i) => i.name), labels: { show: false }, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { labels: { maxWidth: 160, style: { fontSize: "13px", colors: [p.ink] } } },
    grid: { ...base(p).grid, xaxis: { lines: { show: false } }, yaxis: { lines: { show: false } } },
    tooltip: { ...base(p).tooltip, y: { formatter: (v, o) => `${v} ${items[o?.dataPointIndex ?? 0]?.pack ?? ""}`, title: { formatter: () => "" } } },
  };
  return <ApexChart type="bar" height={Math.max(180, items.length * 48)} options={options} series={[{ name: "Sold", data: items.map((i) => i.packs) }]} />;
}

/** "Monthly sales target": half-circle radial gauge. */
export function TargetGauge({ percent }: { percent: number }) {
  const p = usePalette();
  const options: ApexOptions = {
    ...base(p),
    colors: [p.series[0]],
    plotOptions: {
      radialBar: {
        startAngle: -90,
        endAngle: 90,
        hollow: { size: "62%" },
        track: { background: p.surface, strokeWidth: "100%" },
        dataLabels: {
          name: { show: true, offsetY: 22, fontSize: "12px", color: p.muted },
          value: { offsetY: -14, fontSize: "30px", fontWeight: 700, color: p.ink, formatter: () => `${Math.round(percent)}%` },
        },
      },
    },
    fill: { type: "gradient", gradient: { shade: "light", type: "horizontal", gradientToColors: [p.series[1]], stops: [0, 100] } },
    stroke: { lineCap: "round" },
    labels: ["of target"],
  };
  return <ApexChart type="radialBar" height={260} options={options} series={[Math.min(100, Math.max(0, percent))]} />;
}

/** In-shop / Online key shown at the top right of a chart panel. */
export function ShopOnlineLegend() {
  return (
    <div className="flex gap-4 text-[13px] text-ink-2">
      <span className="legend legend-shop">In-shop</span>
      <span className="legend legend-online">Online</span>
    </div>
  );
}

/** A thin percentage bar (payments today). */
export function ShareBar({ percent, label }: { percent: number; label: string }) {
  const v = Math.max(0, Math.min(100, percent));
  return (
    <svg viewBox="0 0 100 8" preserveAspectRatio="none" className="share-bar" role="img" aria-label={label}>
      <rect x="0" y="0" width="100" height="8" rx="4" className="share-bar-track" />
      <rect x="0" y="0" width={v} height="8" rx="4" className="share-bar-fill" />
    </svg>
  );
}
