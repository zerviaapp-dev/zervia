import { Link } from '@/i18n/routing';

type CardProps = {
  title: string;
  text: string;
  /** When provided, the whole card becomes a link. */
  href?: string;
  className?: string;
};

/**
 * White feature card on the brand's soft blue surfaces.
 * With href, renders as a full-card link with hover affordance and
 * keyboard focus styling — a large, senior-friendly tap target.
 */
export function Card({ title, text, href, className = '' }: CardProps) {
  const cls =
    `rounded-2xl border border-brand-100 bg-white p-6 ` +
    `shadow-[0_2px_16px_rgba(11,91,211,0.08)] ${className}`.trim();

  const inner = (
    <>
      <h3 className="text-xl font-bold text-brand-900">{title}</h3>
      <p className="mt-2 text-base leading-relaxed text-slate-600">{text}</p>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={
          `${cls} block transition-shadow hover:shadow-[0_4px_24px_rgba(11,91,211,0.16)] ` +
          `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600`
        }
      >
        {inner}
      </Link>
    );
  }

  return <div className={cls}>{inner}</div>;
}
