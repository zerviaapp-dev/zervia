'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/Button';
import { requestReview } from '@/lib/supabase/review-actions';

/**
 * "Ask for review" button for providers on completed bookings.
 * One nudge max — the server action guards duplicates.
 */
export function RequestReviewButton({
  bookingId,
  locale,
}: {
  bookingId: string;
  locale: string;
}) {
  const t = useTranslations('Bookings');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setMessage(null);
    const fd = new FormData();
    fd.set('locale', locale);
    fd.set('bookingId', bookingId);
    try {
      const res = await requestReview({ ok: false, message: '' }, fd);
      setDone(res.ok);
      setMessage(res.message);
    } catch {
      setDone(false);
      setMessage(t('errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p role="status" className="text-base font-semibold text-emerald-700">
        ✓ {message ?? t('reviewRequestSent')}
      </p>
    );
  }

  return (
    <div>
      <Button variant="secondary" onClick={onClick} disabled={busy}>
        {busy ? t('reviewRequestSending') : `⭐ ${t('askForReview')}`}
      </Button>
      {message && !done ? (
        <p role="alert" className="mt-2 text-base font-medium text-red-600">
          {message}
        </p>
      ) : null}
    </div>
  );
}
