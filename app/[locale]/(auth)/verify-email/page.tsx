import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { ZMark } from '@/components/ZMark';
import { ResendConfirmationForm } from '@/components/auth/ResendConfirmationForm';

/** Shown right after signup: "check your email to verify" + resend option. */
export default function VerifyEmailPage() {
  const t = useTranslations('Auth');
  return (
    <div className="mx-auto w-full max-w-md text-center">
      <div className="mx-auto mb-4 w-fit">
        <ZMark />
      </div>
      <h1 className="text-3xl font-bold text-brand-900">{t('verifyTitle')}</h1>
      <p className="mt-3 text-base text-brand-800">{t('verifyText')}</p>
      <p className="mt-2 text-sm text-brand-700">{t('verifyHint')}</p>
      <ResendConfirmationForm />
      <p className="mt-6 text-base">
        <Link href="/login" className="font-semibold text-brand-700 underline">
          {t('backToLogin')}
        </Link>
      </p>
    </div>
  );
}
