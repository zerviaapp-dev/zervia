import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getTranslations } from 'next-intl/server';
import { PROVIDER_AGREEMENT_VERSION } from '@/lib/provider-agreement';
import { isCategory, isLicensedCategory, isPriceType } from '@/lib/categories';
import {
  COMMUNITY_ALLOWED_CATEGORIES,
  checkCommunityGate,
  isProviderTier,
  type ProviderTier,
} from '@/lib/provider-tiers';

/**
 * POST /api/provider/onboarding
 * Creates a provider profile + first listing. Returns JSON.
 * Uses fetch() from client to avoid useActionState crashes.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const getStr = (key: string) => {
      const v = formData.get(key);
      return typeof v === 'string' ? v.trim() : '';
    };
    const getStrArr = (key: string): string[] => {
      return formData.getAll(key).filter((v): v is string => typeof v === 'string');
    };

    const locale = getStr('locale') || 'en';
    const t = await getTranslations({ locale, namespace: 'Provider' });

    // Basic validation
    const businessName = getStr('businessName');
    const category = getStr('category');
    const title = getStr('title');
    const price = getStr('price');
    const priceType = getStr('priceType');
    const country = getStr('country');
    const city = getStr('city');
    const phone = getStr('phone');
    // Two-tier launch (Oct 21, 2026): providerTier = 'community' selects
    // the non-verified Community path; anything else is Verified.
    const tierRaw = getStr('providerTier');
    const providerTier: ProviderTier = isProviderTier(tierRaw) ? tierRaw : 'verified';
    const agreementAccepted = getStr('agreementAccepted');
    const agreementInitials = getStr('agreementInitials').trim();

    if (!businessName || businessName.length < 2) {
      return NextResponse.json({ ok: false, message: 'Business name is required.' }, { status: 400 });
    }
    if (!category || !isCategory(category)) {
      return NextResponse.json({ ok: false, message: 'Valid category is required.' }, { status: 400 });
    }
    if (!title || title.length < 3) {
      return NextResponse.json({ ok: false, message: 'Service title is required.' }, { status: 400 });
    }
    if (agreementAccepted !== 'true') {
      return NextResponse.json({ ok: false, message: t('errorAgreementRequired') }, { status: 400 });
    }
    if (agreementInitials.length < 2 || agreementInitials.length > 10) {
      return NextResponse.json({ ok: false, message: t('errorAgreementInitials') }, { status: 400 });
    }

    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ ok: false, message: 'Service unavailable' }, { status: 503 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, message: 'Not authenticated' }, { status: 401 });
    }
    const userId = user.id;

    // Community gate (spec §1): confirmed email (the email-OTP flow
    // confirms it), a phone number, the Provider Agreement attestation
    // (validated above), a low-risk category, and Canada only. NO
    // government ID is required — and nothing may claim one was checked.
    if (providerTier === 'community') {
      const gate = checkCommunityGate({
        emailConfirmedAt: user.email_confirmed_at ?? null,
        phone,
        agreementAccepted: agreementAccepted === 'true',
      });
      if (!gate.ok) {
        return NextResponse.json(
          {
            ok: false,
            message: t(
              gate.reason === 'email_unconfirmed'
                ? 'errorCommunityEmail'
                : gate.reason === 'phone_required'
                  ? 'errorCommunityPhone'
                  : 'errorAgreementRequired'
            ),
          },
          { status: 400 }
        );
      }
      if (!COMMUNITY_ALLOWED_CATEGORIES.has(category)) {
        return NextResponse.json({ ok: false, message: t('errorCommunityCategory') }, { status: 400 });
      }
      if ((country || 'CA').toUpperCase() !== 'CA') {
        return NextResponse.json({ ok: false, message: t('errorCommunityCountry') }, { status: 400 });
      }
    }

    // Already a provider?
    const { data: existing } = await supabase
      .from('providers')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ ok: false, message: t('errorAlreadyProvider') }, { status: 400 });
    }

    // Parse price
    let priceCents: number | null = null;
    if (price) {
      const p = parseFloat(price);
      if (!isNaN(p) && p >= 0) priceCents = Math.round(p * 100);
    }
    const validPriceType = isPriceType(priceType) ? priceType : 'quote';

    // Government ID verification is mandatory for VERIFIED providers.
    // Community providers skip it by design (their listings carry the
    // "Identity not verified by Zervia" label everywhere). The
    // IdUploader writes to the private `verification-docs` bucket under
    // `<userId>/id.<ext>`, so the server re-checks storage rather than
    // trusting the client.
    let idDocumentPath: string | null = null;
    if (providerTier === 'verified') {
      const { data: idFiles, error: idListError } = await supabase.storage
        .from('verification-docs')
        .list(userId);
      if (idListError || !idFiles || idFiles.length === 0) {
        return NextResponse.json({ ok: false, message: t('errorIdRequired') }, { status: 400 });
      }
      // The path is required — never null for a valid Verified onboarding.
      idDocumentPath = `${userId}/${idFiles[0].name}`;
    }

    const baseRow = {
      user_id: userId,
      business_name: businessName,
      category,
      description: getStr('businessDescription') || null,
      country: country || 'CA',
      city: city || null,
      phone: phone || null,
      whatsapp: getStr('whatsapp') || null,
      languages: getStrArr('languages'),
      status: 'pending',
      id_document_path: idDocumentPath,
    };

    let provider: { id: string } | null = null;
    let providerError: unknown = null;
    {
      // provider_tier rides the same degrade-safely fallback chain:
      // if migration 0052 is not applied yet the insert retries without
      // it (the row then defaults to Verified behaviour in the UI —
      // recorded as an owner action in the handover, never silently).
      const withAgreement = {
        ...baseRow,
        agreement_version: PROVIDER_AGREEMENT_VERSION,
        agreement_accepted_at: new Date().toISOString(),
        agreement_initials: agreementInitials,
        provider_tier: providerTier,
      };
      const r1 = await supabase.from('providers').insert(withAgreement).select('id').single();
      if (r1.error && /provider_tier/.test(r1.error.message)) {
        if (providerTier === 'community') {
          // FAIL CLOSED for Community: without the tier column the row
          // would be unlabelled today and default to 'verified' when
          // 0052 lands — an unverified provider wearing a Verified
          // label. Refuse until the owner applies migration 0052.
          return NextResponse.json(
            { ok: false, code: 'migration_pending', message: t('errorGeneric') },
            { status: 503 }
          );
        }
        const { provider_tier: _tier, ...noTier } = withAgreement;
        const r1b = await supabase.from('providers').insert(noTier).select('id').single();
        provider = r1b.data;
        providerError = r1b.error;
      } else if (r1.error && /agreement_version|agreement_accepted_at|agreement_initials/.test(r1.error.message)) {
        const r2 = await supabase.from('providers').insert(baseRow).select('id').single();
        provider = r2.data;
        providerError = r2.error;
      } else {
        provider = r1.data;
        providerError = r1.error;
      }
    }

    // Connector fields (migration 0048): best-effort update after the
    // provider row exists; ignored if the columns are not applied yet.
    if (!providerError && provider) {
      // Community providers get NO external contact links (§7b) — the
      // first contact happens inside Zervia.
      const extUrl = providerTier === 'community' ? '' : getStr('externalBookingUrl').slice(0, 500);
      const patch: Record<string, string | null> = {};
      if (extUrl) {
        try {
          const u = new URL(extUrl);
          if (u.protocol === 'http:' || u.protocol === 'https:') patch.external_booking_url = extUrl;
        } catch { /* invalid URL ignored at onboarding; enforced at listing activation */ }
      }
      if (isLicensedCategory(category)) {
        patch.legal_licence_number = getStr('legalLicenceNumber').slice(0, 120) || null;
        patch.legal_jurisdictions = getStr('legalJurisdictions').slice(0, 200) || null;
      }
      if (Object.keys(patch).length > 0) {
        try { await supabase.from('providers').update(patch).eq('id', provider.id); } catch { /* pending 0048 */ }
      }
    }

    if (providerError || !provider) {
      console.error('[onboarding] Provider insert failed:', providerError);
      return NextResponse.json({ ok: false, message: t('errorGeneric') }, { status: 500 });
    }

    const { error: listingError } = await supabase.from('listings').insert({
      provider_id: provider.id,
      title,
      description: getStr('description') || null,
      category,
      subcategory: getStr('subcategory') || null,
      price_cents: priceCents,
      price_type: validPriceType,
      country: country || 'CA',
      city: city || null,
      status: 'draft',
    });

    if (listingError) {
      console.error('[onboarding] Listing insert failed:', listingError);
      return NextResponse.json({ ok: false, message: t('errorGeneric') }, { status: 500 });
    }

    return NextResponse.json({ ok: true, providerId: provider.id });
  } catch (e) {
    console.error('[onboarding] Unhandled error:', e);
    return NextResponse.json(
      { ok: false, message: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
