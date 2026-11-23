import Link from "next/link";

type LogoProps = {
  size?: "sm" | "md" | "lg";
  /** Mark only: use below ~140px wide (brand guide). */
  markOnly?: boolean;
  /** Force black-theme colours, e.g. on the dark sidebar or rider app header. */
  onDark?: boolean;
  href?: string | null;
  className?: string;
};

/** The Ya Rahim mark: outlined rounded square, cross and coral smile (brand Option D). */
export function LogoMark({ className = "logo-mark", title = "Ya Rahim Pharmacy" }: { className?: string; title?: string }) {
  const a11y = title ? { role: "img", "aria-label": title } : { "aria-hidden": true as const };

  return (
    <svg className={className} viewBox="0 0 100 100" {...a11y}>
      <rect className="logo-mark-frame" x="3" y="3" width="94" height="94" rx="26" fill="none" strokeWidth="3" />
      <path className="logo-mark-cross" d="M50 25v44M28 47h44" fill="none" strokeWidth="11" strokeLinecap="round" />
      <path className="logo-mark-smile" d="M23 66A32 32 0 0 0 73 70" fill="none" strokeWidth="7" strokeLinecap="round" />
    </svg>
  );
}

export default function Logo({ size = "md", markOnly = false, onDark = false, href = "/", className = "" }: LogoProps) {
  const classes = ["logo", `logo-${size}`, onDark ? "logo-on-dark" : "", className].filter(Boolean).join(" ");

  const content = (
    <>
      <LogoMark title={markOnly ? "Ya Rahim Pharmacy" : ""} />
      {!markOnly && (
        <span className="logo-text">
          <span className="logo-names">
            <span className="logo-word">YA RAHIM</span>
            <span className="logo-divider" aria-hidden="true" />
            <span className="logo-arabic" lang="ar" dir="rtl">
              يا رحيم
            </span>
          </span>
          <span className="logo-pharmacy" aria-label="Pharmacy">
            {"PHARMACY".split("").map((letter, i) => (
              <span key={i} aria-hidden="true">
                {letter}
              </span>
            ))}
          </span>
        </span>
      )}
    </>
  );

  if (href === null) {
    return (
      <span className={classes} role={markOnly ? undefined : "img"} aria-label={markOnly ? undefined : "Ya Rahim Pharmacy"}>
        {content}
      </span>
    );
  }

  return (
    <Link href={href} className={classes} aria-label="Ya Rahim Pharmacy — home">
      {content}
    </Link>
  );
}
