/** The clinilytics brand mark: a light rounded tile with three stacked rounded
 *  bars — a short orange bar on top and two dark bars below (a list/menu motif).
 *  Rendered inline so it scales crisply and needs no asset path (works under any
 *  basePath). Mirrors public app/icon.svg. */
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
      <rect x="8" y="9" width="10" height="3" rx="1.5" fill="#d6873c" />
      <rect x="8" y="14.5" width="16" height="3" rx="1.5" fill="#26241f" />
      <rect x="8" y="20" width="13" height="3" rx="1.5" fill="#26241f" />
    </svg>
  );
}
