/**
 * Community tier labelling (spec §3a): the exact "Community Provider —
 * Identity not verified by Zervia" label as a chip (cards) or banner
 * (profile / listing detail). Presentational — callers pass the
 * translated strings so this works in server and client components.
 * The full disclaimer is the chip's tooltip and the banner body.
 */
export function CommunityTierNotice({
  label,
  disclaimer,
  variant = 'chip',
}: {
  label: string;
  disclaimer?: string;
  variant?: 'chip' | 'banner';
}) {
  if (variant === 'chip') {
    return (
      <span
        title={disclaimer ?? label}
        className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900"
      >
        ⚠ {label}
      </span>
    );
  }
  return (
    <div
      role="note"
      className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4"
    >
      <p className="text-base font-bold text-amber-900">⚠ {label}</p>
      {disclaimer ? (
        <p className="mt-2 text-sm leading-relaxed text-amber-900">{disclaimer}</p>
      ) : null}
    </div>
  );
}
