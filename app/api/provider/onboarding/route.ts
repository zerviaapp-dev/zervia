import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getTranslations } from 'next-intl/server';
import { PROVIDER_AGREEMENT_VERSION } from '@/lib/provider-agreement';
import { isCategory, isPriceType } from '@/lib/categories';

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

    // Government ID verification is mandatory. The IdUploader writes
    // to the private `verification-docs` bucket under `<userId>/id.<ext>`,
    // so the server re-checks storage rather than trusting the client.
    const { data: idFiles, error: idListError } = await supabase.storage
      .from('verification-docs')
      .list(userId);
    if (idListError || !idFiles || idFiles.length === 0) {
      return NextResponse.json({ ok: false, message: t('errorIdRequired') }, { status: 400 });
    }
    // The path is required — never null for a valid onboarding.
    const idDocumentPath: string = `${userId}/${idFiles[0].name}`;

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
      const withAgreement = {
        ...baseRow,
        agreement_version: PROVIDER_AGREEMENT_VERSION,
        agreement_accepted_at: new Date().toISOString(),
        agreement_initials: agreementInitials,
      };
      const r1 = await supabase.from('providers').insert(withAgreement).select('id').single();
      if (r1.error && /agreement_version|agreement_accepted_at|agreement_initials/.test(r1.error.message)) {
        const r2 = await supabase.from('providers').insert(baseRow).select('id').single();
        provider = r2.data;
        providerError = r2.error;
      } else {
        provider = r1.data;
        providerError = r1.error;
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
