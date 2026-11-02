type ZMarkProps = {
  /** Pixel size of the square mark. */
  size?: number;
  className?: string;
};

/**
 * The Zervia "Z" mark: a white Z on a brand-blue rounded square.
 * Used in the header, hero, and as the app icon basis.
 */
export function ZMark({ size = 48, className = '' }: ZMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Zervia"
      className={className}
    >
      <rect width="64" height="64" rx="16" fill="#0b5bd3" />
      <path
        d="M18 20h28L24 44h22"
        stroke="#ffffff"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
