import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SupportForm } from '@/components/SupportForm';
import { Panel } from '@/components/Panel';

type SupportPageProps = {
  params: Promise<{ locale: string }>;
};

const FAQ_COUNT = 6;

/**
 * Public support page: FAQ + contact form.
 * FAQ uses native <details> accordions — no JavaScript needed, works
 * everywhere including with JS disabled. The contact form POSTs to
 * /api/support, which stores messages for the Zervia team.
 */
export default async function SupportPage({ params }: SupportPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('Support');

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10">
      <div className="text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-brand-950 sm:text-5xl">
          {t('title')}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-slate-600">
          {t('subtitle')}
        </p>
      </div>

      {/* FAQ */}
      <section className="mt-10">
        <h2 className="text-2xl font-extrabold text-brand-950">
          {t('faqTitle')}
        </h2>
        <div className="mt-4 space-y-3">
          {Array.from({ length: FAQ_COUNT }, (_, i) => i + 1).map((n) => (
            <Panel key={n} className="!p-0 overflow-hidden">
              <details className="group">
                <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left text-lg font-bold text-brand-900 [&::-webkit-details-marker]:hidden">
                  {t(`faqQ${n}`)}
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-2xl font-bold text-brand-600 transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="px-5 pb-5 text-base leading-relaxed text-slate-600">
                  {t(`faqA${n}`)}
                </p>
              </details>
            </Panel>
          ))}
        </div>
      </section>

      {/* Contact form */}
      <section className="mt-12">
        <div className="text-center">
          <h2 className="text-2xl font-extrabold text-brand-950">
            {t('contactTitle')}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-lg text-slate-600">
            {t('contactSubtitle')}
          </p>
        </div>
        <div className="mt-6">
          <SupportForm />
        </div>
      </section>
    </div>
  );
}
