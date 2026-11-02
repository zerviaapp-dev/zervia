'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/Button';
import { Panel } from '@/components/Panel';
import { ListingForm, type ListingDefaults } from '@/components/provider/ListingForm';
import {
  generateListingDraft,
  type WizardAnswers,
} from '@/lib/supabase/listing-wizard';
import { countries } from '@/lib/countries';

const STEPS = ['service', 'included', 'price', 'availability', 'skills'] as const;

/**
 * Guided listing creation: 5 plain-language questions → smart draft →
 * provider edits in the standard form → publishes. Removes the
 * blank-form friction (FB's one-photo-listing lesson).
 */
export function GuidedListingWizard({
  locale,
  defaultCountry,
  defaultCity,
  defaultCategory,
}: {
  locale: string;
  defaultCountry: string;
  defaultCity: string;
  defaultCategory: string;
}) {
  const t = useTranslations('Tiers');
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<WizardAnswers>({
    service: '',
    included: '',
    price: '',
    availability: '',
    skills: '',
  });
  const [draft, setDraft] = useState<ListingDefaults | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const key = STEPS[step];

  function setAnswer(value: string) {
    setAnswers((a) => ({ ...a, [key]: value }));
    setError('');
  }

  async function finish() {
    if (!answers.service.trim()) {
      setError(t('wizardNeedService'));
      return;
    }
    setGenerating(true);
    setError('');
    try {
      const d = await generateListingDraft(answers, locale);
      setDraft({
        title: d.title,
        description: d.description,
        category: d.category || defaultCategory,
        subcategory: '',
        price: d.price,
        priceType: d.priceType,
        country: defaultCountry,
        city: defaultCity,
        status: 'draft',
        photos: [],
      });
    } catch {
      setError(t('wizardError'));
    } finally {
      setGenerating(false);
    }
  }

  if (draft) {
    return (
      <div className="space-y-4">
        <Panel>
          <p className="text-base font-semibold text-brand-900">
            ✨ {t('wizardDraftReady')}
          </p>
          <p className="mt-1 text-base text-brand-700">{t('wizardDraftHint')}</p>
          <button
            type="button"
            onClick={() => setDraft(null)}
            className="mt-2 inline-flex min-h-[44px] items-center text-base font-semibold text-brand-700 underline"
          >
            {t('wizardBackToAnswers')}
          </button>
        </Panel>
        <ListingForm defaults={draft} countries={countries} isEdit={false} />
      </div>
    );
  }

  return (
    <Panel>
      {/* Progress */}
      <ol className="flex gap-2" aria-label={t('wizardProgress')}>
        {STEPS.map((s, i) => (
          <li
            key={s}
            className={`h-2 flex-1 rounded-full ${i <= step ? 'bg-brand-600' : 'bg-brand-100'}`}
          />
        ))}
      </ol>
      <p className="mt-2 text-sm font-medium text-brand-600">
        {t('wizardStepOf', { step: step + 1, total: STEPS.length })}
      </p>

      <label
        htmlFor="wizard-answer"
        className="mt-4 block text-xl font-bold text-brand-900"
      >
        {t(`wizardQ_${key}`)}
      </label>
      <p className="mt-1 text-base text-brand-600">{t(`wizardQ_${key}_hint`)}</p>

      {key === 'price' ? (
        <input
          id="wizard-answer"
          type="text"
          inputMode="decimal"
          value={answers[key]}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder={t('wizardQ_price_placeholder')}
          className="mt-3 block min-h-[56px] w-full rounded-2xl border-2 border-brand-200 bg-white px-4 text-lg text-brand-900"
        />
      ) : (
        <textarea
          id="wizard-answer"
          value={answers[key]}
          onChange={(e) => setAnswer(e.target.value)}
          rows={key === 'service' ? 2 : 3}
          placeholder={t(`wizardQ_${key}_placeholder`)}
          className="mt-3 block w-full rounded-2xl border-2 border-brand-200 bg-white px-4 py-3 text-lg text-brand-900"
        />
      )}

      {error ? (
        <p role="alert" className="mt-2 text-base font-medium text-red-600">
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        {step > 0 ? (
          <Button variant="secondary" onClick={() => setStep(step - 1)}>
            {t('wizardBack')}
          </Button>
        ) : null}
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep(step + 1)}>{t('wizardNext')}</Button>
        ) : (
          <Button onClick={finish} disabled={generating}>
            {generating ? t('wizardGenerating') : t('wizardFinish')}
          </Button>
        )}
      </div>
    </Panel>
  );
}
