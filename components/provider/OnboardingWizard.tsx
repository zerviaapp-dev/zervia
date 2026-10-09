'use client';

import { useActionState, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { submitOnboarding, type ActionResult } from '@/lib/supabase/provider-actions';
import { categoryGroups, priceTypes, type Category, type PriceType } from '@/lib/categories';
import { locales, localeNames, type Locale } from '@/lib/locales';
import { Field } from '@/components/auth/Field';
import { SubmitButton } from '@/components/auth/SubmitButton';
import { Panel } from '@/components/Panel';
import { IdUploader } from '@/components/provider/IdUploader';

const initialState: ActionResult = { ok: false, message: '' };

type WizardState = {
  businessName: string;
  businessDescription: string;
  category: Category | '';
  serviceTitle: string;
  serviceDescription: string;
  price: string;
  priceType: PriceType;
  country: string;
  city: string;
  phone: string;
  whatsapp: string;
  languages: Locale[];
};

/**
 * 5-step provider onboarding: business info → category → first service →
 * contact + languages → review → submit. Creates a `pending` provider row
 * plus the first listing as a draft; an admin approves before anything
 * goes public. Every step validates client-side; the server validates again.
 */
export function OnboardingWizard({
  countries,
  defaultCountry,
  defaultLocale,
}: {
  countries: { code: string; name: string }[];
  defaultCountry: string;
  defaultLocale: Locale;
}) {
  const t = useTranslations('Provider');
  const tc = useTranslations('Categories');
  const tcg = useTranslations('CategoryGroups');
  const locale = useLocale();
  const [state, formAction] = useActionState(submitOnboarding, initialState);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<WizardState>({
    businessName: '',
    businessDescription: '',
    category: '',
    serviceTitle: '',
    serviceDescription: '',
    price: '',
    priceType: 'quote',
    country: defaultCountry,
    city: '',
    phone: '',
    whatsapp: '',
    languages: [defaultLocale],
  });

  const set = <K extends keyof WizardState>(key: K, value: WizardState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      const next = { ...e };
      delete next[key as string];
      return next;
    });
  };

  const toggleLanguage = (code: Locale) => {
    setForm((f) => ({
      ...f,
      languages: f.languages.includes(code)
        ? f.languages.filter((l) => l !== code)
        : [...f.languages, code],
    }));
  };

  /** Client-side validation for the current step. */
  function validateStep(): boolean {
    const e: Record<string, string> = {};
    if (step === 0) {
      if (form.businessName.trim().length < 2 || form.businessName.trim().length > 120)
        e.businessName = t('errorBusinessName');
      if (form.businessDescription.length > 2000)
        e.businessDescription = t('errorDescriptionTooLong');
    }
    if (step === 1 && !form.category) e.category = t('errorCategory');
    if (step === 2) {
      const title = form.serviceTitle.trim();
      if (title.length < 3 || title.length > 120) e.serviceTitle = t('errorTitle');
      if (form.serviceDescription.length > 2000)
        e.serviceDescription = t('errorDescriptionTooLong');
      if (form.price !== '' && !/^\d+(\.\d{1,2})?$/.test(form.price.trim()))
        e.price = t('errorPrice');
      if (form.price.trim() === '' && form.priceType !== 'quote')
        e.price = t('errorPriceRequired');
    }
    if (step === 3 && !form.country) e.country = t('errorCountry');
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const next = () => {
    if (validateStep()) {
      setStep((s) => Math.min(s + 1, 4));
      window.scrollTo({ top: 0 });
    }
  };
  const back = () => {
    setStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0 });
  };

  const stepTitles = [
    t('stepBusiness'),
    t('stepCategory'),
    t('stepService'),
    t('stepContact'),
    t('stepReview'),
  ];

  const inputClass = 'auth-input w-full rounded-2xl px-4 py-4 text-base';

  return (
    <div>
      {/* Stepper */}
      <ol className="mb-6 flex items-center gap-2" aria-label={t('onboardingTitle')}>
        {stepTitles.map((title, i) => (
          <li key={title} className="flex-1">
            <div
              className={`h-2 rounded-full ${i <= step ? 'bg-brand-600' : 'bg-brand-100'}`}
              title={title}
            />
          </li>
        ))}
      </ol>
      <h1 className="text-3xl font-bold text-brand-900">{t('onboardingTitle')}</h1>
      <p className="mt-1 text-base font-semibold text-brand-700">
        {t('stepOf', { current: step + 1, total: 5 })} — {stepTitles[step]}
      </p>

      <form action={formAction} className="mt-6 space-y-5">
        <input type="hidden" name="locale" value={locale} />
        {/* Carry every field through hidden inputs so the server action
            receives the full payload regardless of the visible step. */}
        <input type="hidden" name="businessName" value={form.businessName} />
        <input type="hidden" name="businessDescription" value={form.businessDescription} />
        <input type="hidden" name="category" value={form.category} />
        <input type="hidden" name="title" value={form.serviceTitle} />
        <input type="hidden" name="description" value={form.serviceDescription} />
        <input type="hidden" name="price" value={form.price} />
        <input type="hidden" name="priceType" value={form.priceType} />
        <input type="hidden" name="country" value={form.country} />
        <input type="hidden" name="city" value={form.city} />
        <input type="hidden" name="phone" value={form.phone} />
        <input type="hidden" name="whatsapp" value={form.whatsapp} />
        {form.languages.map((l) => (
          <input key={l} type="hidden" name="languages" value={l} />
        ))}

        {step === 0 && (
          <Panel>
            <div className="space-y-5">
              <Field label={t('businessName')} error={errors.businessName} htmlFor="businessName">
                <input
                  id="businessName"
                  value={form.businessName}
                  onChange={(e) => set('businessName', e.target.value)}
                  placeholder={t('businessNameHint')}
                  className={inputClass}
                  maxLength={120}
                />
              </Field>
              <Field
                label={t('businessDescription')}
                error={errors.businessDescription}
                htmlFor="businessDescription"
              >
                <textarea
                  id="businessDescription"
                  value={form.businessDescription}
                  onChange={(e) => set('businessDescription', e.target.value)}
                  placeholder={t('businessDescriptionHint')}
                  className={`${inputClass} min-h-[120px]`}
                  maxLength={2000}
                />
              </Field>
            </div>
          </Panel>
        )}

        {step === 1 && (
          <Panel>
            <Field label={t('categoryLabel')} error={errors.category} htmlFor="category">
              <div className="space-y-5" id="category">
                {categoryGroups.map((group) => (
                  <fieldset key={group.key}>
                    <legend className="mb-2 text-sm font-bold uppercase tracking-wide text-brand-500">
                      {tcg(group.key)}
                    </legend>
                    <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label={tcg(group.key)}>
                      {group.categories.map((c) => (
                        <button
                          key={c}
                          type="button"
                          role="radio"
                          aria-checked={form.category === c}
                          onClick={() => set('category', c)}
                          className={`min-h-[56px] rounded-2xl border-2 px-4 py-3 text-base font-semibold transition-colors ${
                            form.category === c
                              ? 'border-brand-600 bg-brand-600 text-white'
                              : 'border-brand-100 bg-white text-brand-800 hover:border-brand-300'
                          }`}
                        >
                          {tc(c)}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>
            </Field>
          </Panel>
        )}

        {step === 2 && (
          <Panel>
            <div className="space-y-5">
              <Field label={t('serviceTitle')} error={errors.serviceTitle} htmlFor="serviceTitle">
                <input
                  id="serviceTitle"
                  value={form.serviceTitle}
                  onChange={(e) => set('serviceTitle', e.target.value)}
                  placeholder={t('serviceTitleHint')}
                  className={inputClass}
                  maxLength={120}
                />
              </Field>
              <Field
                label={t('serviceDescription')}
                error={errors.serviceDescription}
                htmlFor="serviceDescription"
              >
                <textarea
                  id="serviceDescription"
                  value={form.serviceDescription}
                  onChange={(e) => set('serviceDescription', e.target.value)}
                  placeholder={t('serviceDescriptionHint')}
                  className={`${inputClass} min-h-[120px]`}
                  maxLength={2000}
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={`${t('price')} (${t('priceOptional')})`} error={errors.price} htmlFor="price">
                  <input
                    id="price"
                    inputMode="decimal"
                    value={form.price}
                    onChange={(e) => set('price', e.target.value)}
                    placeholder={t('priceHint')}
                    className={inputClass}
                  />
                </Field>
                <Field label={t('priceType')} htmlFor="priceType">
                  <select
                    id="priceType"
                    value={form.priceType}
                    onChange={(e) => set('priceType', e.target.value as PriceType)}
                    className={inputClass}
                  >
                    {priceTypes.map((p) => (
                      <option key={p} value={p}>
                        {t(`price${p[0].toUpperCase()}${p.slice(1)}`)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          </Panel>
        )}

        {step === 3 && (
          <Panel>
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <Field label={t('countryLabel')} error={errors.country} htmlFor="country">
                  <select
                    id="country"
                    value={form.country}
                    onChange={(e) => set('country', e.target.value)}
                    className={inputClass}
                  >
                    <option value="">{t('countryHint')}</option>
                    {countries.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t('cityLabel')} htmlFor="city">
                  <input
                    id="city"
                    value={form.city}
                    onChange={(e) => set('city', e.target.value)}
                    placeholder={t('cityHint')}
                    className={inputClass}
                    maxLength={120}
                  />
                </Field>
              </div>
              <Field label={t('phone')} htmlFor="phone">
                <input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  placeholder={t('phoneHint')}
                  className={inputClass}
                  maxLength={40}
                />
              </Field>
              <Field label={t('whatsapp')} htmlFor="whatsapp">
                <input
                  id="whatsapp"
                  type="tel"
                  value={form.whatsapp}
                  onChange={(e) => set('whatsapp', e.target.value)}
                  placeholder={t('whatsappHint')}
                  className={inputClass}
                  maxLength={40}
                />
              </Field>
              <Field label={t('languagesLabel')} htmlFor="languages">
                <p className="mb-3 text-sm text-brand-700">{t('languagesHint')}</p>
                <div className="flex flex-wrap gap-2" id="languages">
                  {locales.map((l) => (
                    <button
                      key={l}
                      type="button"
                      aria-pressed={form.languages.includes(l)}
                      onClick={() => toggleLanguage(l)}
                      className={`min-h-[44px] rounded-full border-2 px-4 text-sm font-semibold transition-colors ${
                        form.languages.includes(l)
                          ? 'border-brand-600 bg-brand-600 text-white'
                          : 'border-brand-100 bg-white text-brand-800'
                      }`}
                    >
                      {localeNames[l]}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          </Panel>
        )}

        {step === 4 && (
          <Panel>
            <h2 className="text-xl font-bold text-brand-900">{t('reviewTitle')}</h2>
            <dl className="mt-4 space-y-3 text-base">
              <div>
                <dt className="font-semibold text-brand-900">{t('reviewBusiness')}</dt>
                <dd className="text-brand-800">
                  {form.businessName} · {form.category ? tc(form.category) : '—'}
                  {form.businessDescription ? ` — ${form.businessDescription}` : ''}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-brand-900">{t('reviewService')}</dt>
                <dd className="text-brand-800">
                  {form.serviceTitle}
                  {form.price.trim() !== ''
                    ? ` — ${form.price.trim()} (${t(`price${form.priceType[0].toUpperCase()}${form.priceType.slice(1)}`)})`
                    : ` — ${t('priceQuote')}`}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-brand-900">{t('reviewContact')}</dt>
                <dd className="text-brand-800">
                  {[form.city, form.country].filter(Boolean).join(', ')}
                  {form.phone ? ` · ${form.phone}` : ''}
                  {form.whatsapp ? ` · WhatsApp ${form.whatsapp}` : ''}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-brand-900">{t('languagesLabel')}</dt>
                <dd className="text-brand-800">
                  {form.languages.map((l) => localeNames[l]).join(', ') || '—'}
                </dd>
              </div>
            </dl>
            <p className="mt-4 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-800">
              {t('reviewNote')}
            </p>
            {/* Optional ID verification: speeds up admin approval. The photo
                goes to a private bucket — never publicly visible. */}
            <div className="mt-4">
              <IdUploader alreadyProvided={false} />
            </div>
          </Panel>
        )}

        {state.message ? (
          <p
            role={state.ok ? 'status' : 'alert'}
            className={`rounded-2xl px-4 py-3 text-sm font-medium ${
              state.ok
                ? 'bg-brand-50 text-brand-800'
                : 'bg-red-50 text-red-700'
            }`}
          >
            {state.message}
          </p>
        ) : null}

        <div className="flex gap-3">
          {step > 0 && (
            <button
              type="button"
              onClick={back}
              className="inline-flex min-h-[56px] flex-1 items-center justify-center rounded-full border-2 border-brand-600 bg-white px-8 text-lg font-semibold text-brand-700"
            >
              {t('back')}
            </button>
          )}
          {step < 4 ? (
            <button
              type="button"
              onClick={next}
              className="inline-flex min-h-[56px] flex-1 items-center justify-center rounded-full bg-brand-600 px-8 text-lg font-semibold text-white hover:bg-brand-700"
            >
              {t('next')}
            </button>
          ) : (
            <div className="flex-1">
              <SubmitButton>{t('submit')}</SubmitButton>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
