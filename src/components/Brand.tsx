/** The clinilytics brand mark: a light rounded tile with a short orange bar
 *  over a longer dark bar. Rendered inline so it scales crisply and needs no
 *  asset path (works under any basePath). Mirrors public app/icon.svg. */
export function BrandMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label="clinilytics"
    >
      <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="7.5" fill="#f7f4ec" stroke="#e3ded0" strokeWidth="1.5" />
      <rect x="8" y="10.5" width="10" height="3.6" rx="1.8" fill="#d6873c" />
      <rect x="8" y="17.9" width="16" height="3.6" rx="1.8" fill="#26241f" />
    </svg>
  );
}
