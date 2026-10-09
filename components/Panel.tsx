import type { ReactNode } from 'react';

type PanelProps = {
  children: ReactNode;
  className?: string;
};

/** Generic white content panel for logged-in screens (brand surface). */
export function Panel({ children, className = '' }: PanelProps) {
  return (
    <div
      className={
        `rounded-3xl border border-brand-100 bg-white p-6 shadow-[0_2px_16px_rgba(11,91,211,0.08)] sm:p-8 ${className}`.trim()
      }
    >
      {children}
    </div>
  );
}
