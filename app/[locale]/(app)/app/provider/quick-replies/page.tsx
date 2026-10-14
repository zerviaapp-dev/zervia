import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { QuickReplyManager } from '@/components/provider/QuickReplyManager';
import { NotConfigured } from '@/components/auth/NotConfigured';
import { createClient } from '@/lib/supabase/server';
import { localizedPath } from '@/lib/locale-path';

/** Provider settings: manage quick-reply (auto-reply) templates. */
export default async function QuickRepliesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Provider' });
  const supabase = await createClient();

  if (!supabase) {
    return <NotConfigured />;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(localizedPath('/login', locale));
  }

  const { data: provider } = await supabase
    .from('providers')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!provider) {
    redirect(localizedPath('/app/provider', locale));
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold text-brand-900">{t('qrTitle')}</h1>
        <p className="mt-1 text-base text-brand-700">{t('qrSubtitle')}</p>
      </div>
      <QuickReplyManager />
    </div>
  );
}
