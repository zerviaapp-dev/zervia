import { getTranslations } from 'next-intl/server';

/**
 * Anti-scammer safety banner shown on buy/sell and rental category pages.
 * Reminds users: meet in public, pay through Zervia, never wire money.
 */
export async function SafetyBanner({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'Safety' });
  const tips = [
    { icon: '🤝', text: t('tipMeet') },
    { icon: '💳', text: t('tipPay') },
    { icon: '🚫', text: t('tipWire') },
    { icon: '🚩', text: t('tipReport') },
  ];
  return (
    <section
      aria-label={t('title')}
      className="rounded-3xl border-2 border-amber-200 bg-amber-50 p-5"
    >
      <h2 className="flex items-center gap-2 text-base font-extrabold text-amber-900">
        <span aria-hidden="true">🛡️</span> {t('title')}
      </h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {tips.map((tip) => (
          <li
            key={tip.text}
            className="flex items-start gap-2 text-sm font-medium text-amber-900"
          >
            <span aria-hidden="true" className="shrink-0">
              {tip.icon}
            </span>
            {tip.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
