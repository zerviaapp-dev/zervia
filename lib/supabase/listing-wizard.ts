'use server';

import { getTranslations } from 'next-intl/server';

/**
 * "AI-assisted" listing draft generation. Rule-based smart templating:
 * takes the provider's 5 plain-language answers and produces a polished
 * title, description, category guess, and price suggestion the provider
 * can edit before publishing. No external LLM — instant and free.
 */

export type WizardAnswers = {
  service: string; // Q1: What service do you offer?
  included: string; // Q2: What's included in a typical job?
  price: string; // Q3: Typical price (number or range text)
  availability: string; // Q4: When are you usually available?
  skills: string; // Q5: Special skills, experience, certifications?
};

export type ListingDraft = {
  title: string;
  description: string;
  category: string;
  priceType: 'fixed' | 'hourly' | 'quote';
  price: string;
};

const CATEGORY_KEYWORDS: { category: string; words: string[] }[] = [
  { category: 'cleaning', words: ['clean', 'housekeep', 'maid', 'dust', 'mop', 'vacuum', 'tidy', 'laundry'] },
  { category: 'handyman', words: ['repair', 'fix', 'handyman', 'furniture', 'assemble', 'mount', 'install', 'drywall', 'paint'] },
  { category: 'plumbing', words: ['plumb', 'pipe', 'leak', 'faucet', 'toilet', 'drain', 'water heater'] },
  { category: 'electrical', words: ['electric', 'wiring', 'outlet', 'light', 'switch', 'breaker', 'ceiling fan'] },
  { category: 'tutoring', words: ['tutor', 'teach', 'lesson', 'math', 'homework', 'piano', 'language', 'exam'] },
  { category: 'caregiving', words: ['pet', 'dog', 'cat', 'walk', 'sit', 'groom', 'elder', 'senior', 'caregiv', 'companion', 'child', 'babysit', 'nanny', 'kid'] },
  { category: 'moving', words: ['move', 'moving', 'haul', 'furniture move', 'delivery', 'truck'] },
  { category: 'yard', words: ['lawn', 'garden', 'yard', 'mow', 'hedge', 'landscape', 'leaf', 'gutter', 'pressure wash'] },
  { category: 'errands', words: ['errand', 'grocery', 'shop', 'pickup', 'deliver'] },
];

function guessCategory(service: string, included: string): string {
  const hay = `${service} ${included}`.toLowerCase();
  let best = 'handyman';
  let bestScore = 0;
  for (const { category, words } of CATEGORY_KEYWORDS) {
    const score = words.filter((w) => hay.includes(w)).length;
    if (score > bestScore) {
      bestScore = score;
      best = category;
    }
  }
  return best;
}

function clean(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

export async function generateListingDraft(
  answers: WizardAnswers,
  locale: string
): Promise<ListingDraft> {
  const t = await getTranslations({ locale, namespace: 'Tiers' });
  const service = clean(answers.service);
  const included = clean(answers.included);
  const skills = clean(answers.skills);
  const availability = clean(answers.availability);

  const category = guessCategory(service, included);

  // Price: extract first number; "/hr" or "hour" → hourly, else fixed if a
  // single number, quote if none found.
  const priceText = answers.price.toLowerCase();
  const numMatch = priceText.match(/[\d,]+(?:\.\d{1,2})?/);
  const priceType: ListingDraft['priceType'] = /hour|\/hr|hr\b/.test(priceText)
    ? 'hourly'
    : numMatch
      ? 'fixed'
      : 'quote';
  const price = numMatch ? numMatch[0].replace(/,/g, '') : '';

  const title =
    service.length <= 60
      ? service.charAt(0).toUpperCase() + service.slice(1)
      : service.slice(0, 57).trimEnd() + '…';

  const lines: string[] = [];
  if (included) lines.push(`✓ ${t('draftIncludes')}: ${included}`);
  if (availability) lines.push(`✓ ${t('draftAvailability')}: ${availability}`);
  if (skills) lines.push(`✓ ${t('draftExperience')}: ${skills}`);
  lines.push('', t('draftClosing'));

  return {
    title,
    description: lines.join('\n'),
    category,
    priceType,
    price,
  };
}
