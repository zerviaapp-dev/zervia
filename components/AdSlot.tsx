type AdSlotProps = {
  /** Translated "Advertisement" label (FTC/ASC compliance — always shown). */
  label: string;
  /** Stable slot identifier for future ad-network wiring (Liz's later decision). */
  slot: string;
  format?: 'banner' | 'card' | 'leaderboard';
  className?: string;
};

/**
 * Advertisement placeholder slot.
 *
 * PLACEHOLDER ONLY — no ad network is wired (no AdSense, no scripts, no
 * cookies, no tracking). Network choice and application are Liz's later
 * decision; this component only reserves clean, honestly-labelled space.
 *
 * Compliance + honesty rules (Liz, Oct 29, 2026):
 * - Every slot carries a tiny but unmistakable "Advertisement" label —
 *   legally required (FTC/ASC), never omitted.
 * - Slots are visually DISTINCT from provider listings: dashed slate
 *   border on a flat slate wash, never a white card, never amber like
 *   paid Spotlights. No dark patterns — an ad must never read as an
 *   organic result.
 */
export function AdSlot({ label, slot, format = 'banner', className = '' }: AdSlotProps) {
  const box =
    format === 'card'
      ? 'min-h-[240px]'
      : format === 'leaderboard'
        ? 'min-h-[110px]'
        : 'min-h-[96px]';
  return (
    <div
      role="complementary"
      aria-label={label}
      data-ad-slot={slot}
      className={`relative flex w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-5 ${box} ${className}`.trim()}
    >
      <span className="absolute left-3 top-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </span>
      {/* Generic image-placeholder glyph — no text, no translation risk. */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
        className="h-8 w-8 text-slate-300"
      >
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="9" cy="10" r="1.5" />
        <path d="M21 15l-5-5-6 6" />
      </svg>
    </div>
  );
}
