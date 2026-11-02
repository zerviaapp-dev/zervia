import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getTranslations } from 'next-intl/server';
import { PROVIDER_AGREEMENT_VERSION } from '@/lib/provider-agreement';

/**
 * POST /api/provider/agreement
 * Records re-acceptance of the CURRENT Provider Agreement by an existing
 * provider (the re-acceptance gate). Same acceptance mechanics and
 * validation as onboarding (checkbox + initials), then updates
 * agreement_version + agreement_accepted_at (+ agreement_initials) on
 * the caller's own provider row. Uses fetch()/FormData from the client,
 * like the onboarding route.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const getStr = (key: string) => {
      const v = formData.get(key);
      return typeof v === 'string' ? v.trim() : '';
    };

    const locale = getStr('locale') || 'en';
    const t = await getTranslations({ locale, namespace: 'Provider' });

    const agreementAccepted = getStr('agreementAccepted');
    const agreementInitials = getStr('agreementInitials');
    if (agreementAccepted !== 'true') {
      return NextResponse.json(
        { ok: false, message: t('errorAgreementRequired') },
        { status: 400 }
      );
    }
    if (agreementInitials.length < 2 || agreementInitials.length > 10) {
      return NextResponse.json(
        { ok: false, message: t('errorAgreementInitials') },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json(
        { ok: false, message: 'Service unavailable' },
        { status: 503 }
      );
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, message: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { data: provider } = await supabase
      .from('providers')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!provider) {
      return NextResponse.json(
        { ok: false, code: 'not_a_provider', message: t('errorNotProvider') },
        { status: 403 }
      );
    }

    // Record acceptance of the current version. `agreement_initials` has
    // no migration yet (it rides the onboarding fallback): if the update
    // fails on that column, retry without it so version + timestamp —
    // the columns the gate reads — always land.
    const stamp = {
      agreement_version: PROVIDER_AGREEMENT_VERSION,
      agreement_accepted_at: new Date().toISOString(),
    };
    let error: { message: string } | null = null;
    {
      const r1 = await supabase
        .from('providers')
        .update({ ...stamp, agreement_initials: agreementInitials })
        .eq('id', provider.id);
      if (r1.error && /agreement_initials/.test(r1.error.message)) {
        const r2 = await supabase
          .from('providers')
          .update(stamp)
          .eq('id', provider.id);
        error = r2.error;
      } else {
        error = r1.error;
      }
    }
    if (error) {
      console.error('[agreement] Re-acceptance update failed:', error);
      return NextResponse.json(
        { ok: false, message: t('errorGeneric') },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      version: PROVIDER_AGREEMENT_VERSION,
    });
  } catch (e) {
    console.error('[agreement] Unhandled error:', e);
    return NextResponse.json(
      { ok: false, message: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
