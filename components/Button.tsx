import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from 'react';

type BaseProps = {
  variant?: 'primary' | 'secondary';
  children: ReactNode;
  className?: string;
};

type AnchorButtonProps = BaseProps & {
  /** When provided, renders an anchor instead of a button. */
  href: string;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'children' | 'href'>;

type NativeButtonProps = BaseProps & {
  href?: undefined;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'>;

type ButtonProps = AnchorButtonProps | NativeButtonProps;

/**
 * Brand button. Large tap target (min 56px) for senior-friendly,
 * one-tap use. Primary = solid brand blue, secondary = white with
 * a blue outline. Renders an <a> when href is given, <button> otherwise,
 * with correctly typed passthrough props for each.
 */
export function Button({
  variant = 'primary',
  href,
  children,
  className = '',
  ...rest
}: ButtonProps) {
  const base =
    'inline-flex min-h-[56px] items-center justify-center rounded-full px-8 py-4 ' +
    'text-lg font-semibold transition-colors ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';
  const styles =
    variant === 'primary'
      ? 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800'
      : 'border-2 border-brand-600 bg-white text-brand-700 hover:bg-brand-50 active:bg-brand-100';
  const cls = `${base} ${styles} ${className}`.trim();

  if (href) {
    const anchorProps = rest as Omit<
      AnchorHTMLAttributes<HTMLAnchorElement>,
      'className' | 'children' | 'href'
    >;
    return (
      <a href={href} className={cls} {...anchorProps}>
        {children}
      </a>
    );
  }
  const buttonProps = rest as Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    'className' | 'children'
  >;
  return (
    <button type="button" className={cls} {...buttonProps}>
      {children}
    </button>
  );
}
