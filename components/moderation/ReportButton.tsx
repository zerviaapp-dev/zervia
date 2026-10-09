'use client';

import { useActionState, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { reportListing, type ActionResult } from '@/lib/supabase/moderation-actions';

const initialState: ActionResult = { ok: false, message: '' };

const REASONS = ['spam', 'scam', 'inappropriate', 'fake', 'other'] as const;

/**
 * "Report listing" button for listing cards and the detail page.
 * Opens an accessible dialog with a reason picker; submits to the
 * rate-limited `reportListing` server action. Signed-out visitors are
 * pointed at login first (reporting requires an account — this keeps
 * the queue free of anonymous spam).
 */
export function ReportButton({
  listingId,
  providerId,
  signedIn,
}: {
  listingId: string;
  providerId?: string;
  signedIn: boolean;
}) {
  const t = useTranslations('Moderation');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(reportListing, initialState);

  if (!signedIn) {
    return (
      <a
        href={locale === 'en' ? '/login' : `/${locale}/login`}
        className="inline-flex min-h-[56px] items-center justify-center rounded-full border-2 border-brand-200 bg-white px-6 text-base font-semibold text-brand-700 hover:bg-brand-50"
      >
        {t('reportCta')}
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[56px] items-center justify-center rounded-full border-2 border-brand-200 bg-white px-6 text-base font-semibold text-brand-700 hover:bg-brand-50"
        aria-haspopup="dialog"
      >
        {t('reportCta')}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('reportDialogTitle')}
          className="fixed inset-0 z-50 flex items-end justify-center bg-brand-950/50 p-4 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-brand-900">
              {t('reportDialogTitle')}
            </h2>
            <p className="mt-1 text-sm text-brand-700">{t('reportDialogBody')}</p>

            {state.ok ? (
              <div className="mt-4 space-y-4">
                <p role="status" className="rounded-2xl bg-green-50 px-4 py-3 text-green-800">
                  {state.message}
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex min-h-[56px] w-full items-center justify-center rounded-full bg-brand-600 px-8 text-lg font-semibold text-white hover:bg-brand-700"
                >
                  {t('close')}
                </button>
              </div>
            ) : (
              <form action={formAction} className="mt-4 space-y-4">
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="listingId" value={listingId} />
                {providerId && (
                  <input type="hidden" name="providerId" value={providerId} />
                )}

                <fieldset>
                  <legend className="mb-2 text-base font-semibold text-brand-900">
                    {t('reasonLabel')}
                  </legend>
                  <div className="space-y-2">
                    {REASONS.map((reason) => (
                      <label
                        key={reason}
                        className="flex min-h-[56px] cursor-pointer items-center gap-3 rounded-2xl border-2 border-brand-100 px-4 has-checked:border-brand-600 has-checked:bg-brand-50"
                      >
                        <input
                          type="radio"
                          name="reason"
                          value={reason}
                          required
                          className="h-5 w-5 accent-brand-600"
                        />
                        <span className="text-base text-brand-900">
                          {t(`reason_${reason}`)}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div>
                  <label
                    htmlFor="report-details"
                    className="mb-2 block text-base font-semibold text-brand-900"
                  >
                    {t('detailsLabel')}
                  </label>
                  <textarea
                    id="report-details"
                    name="details"
                    rows={3}
                    maxLength={2000}
                    placeholder={t('detailsPlaceholder')}
                    className="w-full rounded-2xl border-2 border-brand-100 px-4 py-3 text-base text-brand-900 placeholder:text-brand-300 focus:border-brand-600 focus:outline-none"
                  />
                </div>

                {!state.ok && state.message && (
                  <p role="alert" className="text-sm font-medium text-red-600">
                    {state.message}
                  </p>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="inline-flex min-h-[56px] flex-1 items-center justify-center rounded-full border-2 border-brand-200 bg-white px-6 text-base font-semibold text-brand-700"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    type="submit"
                    className="inline-flex min-h-[56px] flex-1 items-center justify-center rounded-full bg-brand-600 px-6 text-base font-semibold text-white hover:bg-brand-700"
                  >
                    {t('submitReport')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
