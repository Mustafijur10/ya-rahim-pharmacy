import { Activity, Droplet, HeartPulse, Leaf, Pill, Sun, Syringe, Thermometer, Stethoscope, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  pill: Pill,
  activity: Activity,
  heart: HeartPulse,
  droplet: Droplet,
  syringe: Syringe,
  thermometer: Thermometer,
  leaf: Leaf,
  sun: Sun,
};

/** Coloured category tile; colours cycle through the 8 tones from the design (cat-tone-0…7 in app.css). */
export default function CategoryIcon({ icon, index, size = 26 }: { icon?: string | null; index: number; size?: number }) {
  const Icon = (icon && ICONS[icon]) || Stethoscope;
  return (
    <span className={`cat-icon cat-tone-${index % 8}`} aria-hidden="true">
      <Icon size={size} strokeWidth={1.9} />
    </span>
  );
}
