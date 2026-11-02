/**
 * Type-ahead search suggestions for the marketplace search boxes.
 *
 * Liz's live test (Oct 20, 2026): a customer typing "Tuto" in Discover
 * saw nothing until they pressed Search — the box must suggest while
 * they type. Suggestions are built from data we already own:
 *   - the category list (lib/categories)
 *   - each category's subcategories
 *   - the plain-language phrases seeded in migration 0023
 *     (search_synonyms — "math tutor", "leaky faucet", …)
 * Labels are resolved by the caller (i18n), so this module stays pure
 * and unit-checkable.
 */
import { categories, subcategories, type Category } from './categories';

/** Plain-language phrases from migration 0023, plus the bare stems a
 *  customer actually types first ("tutor", "cleaner", "plumber"). */
export const SEARCH_PHRASES: readonly { phrase: string; category: Category }[] = [
  // stems
  { phrase: 'tutor', category: 'tutoring' },
  { phrase: 'cleaner', category: 'cleaning' },
  { phrase: 'plumber', category: 'plumbing' },
  { phrase: 'electrician', category: 'electrical' },
  { phrase: 'babysitter', category: 'caregiving' },
  { phrase: 'chef', category: 'cooking' },
  { phrase: 'massage', category: 'massage' },
  { phrase: 'personal trainer', category: 'fitness' },
  // 0023 seed phrases
  { phrase: 'house cleaning', category: 'cleaning' },
  { phrase: 'deep clean', category: 'cleaning' },
  { phrase: 'spring cleaning', category: 'cleaning' },
  { phrase: 'move out cleaning', category: 'cleaning' },
  { phrase: 'maid service', category: 'cleaning' },
  { phrase: 'carpet cleaning', category: 'cleaning' },
  { phrase: 'fix door', category: 'handyman' },
  { phrase: 'furniture assembly', category: 'handyman' },
  { phrase: 'tv mounting', category: 'handyman' },
  { phrase: 'drywall repair', category: 'handyman' },
  { phrase: 'painting', category: 'handyman' },
  { phrase: 'leaky faucet', category: 'plumbing' },
  { phrase: 'clogged drain', category: 'plumbing' },
  { phrase: 'blocked toilet', category: 'plumbing' },
  { phrase: 'toilet repair', category: 'plumbing' },
  { phrase: 'water heater', category: 'plumbing' },
  { phrase: 'burst pipe', category: 'plumbing' },
  { phrase: 'light fixture', category: 'electrical' },
  { phrase: 'ceiling fan', category: 'electrical' },
  { phrase: 'power outlet', category: 'electrical' },
  { phrase: 'smoke detector', category: 'electrical' },
  { phrase: 'math tutor', category: 'tutoring' },
  { phrase: 'math help', category: 'tutoring' },
  { phrase: 'homework help', category: 'tutoring' },
  { phrase: 'english tutor', category: 'tutoring' },
  { phrase: 'science tutor', category: 'tutoring' },
  { phrase: 'exam prep', category: 'tutoring' },
  { phrase: 'piano lessons', category: 'tutoring' },
  { phrase: 'guitar lessons', category: 'tutoring' },
  { phrase: 'language lessons', category: 'tutoring' },
  { phrase: 'child care', category: 'caregiving' },
  { phrase: 'nanny', category: 'caregiving' },
  { phrase: 'elder care', category: 'caregiving' },
  { phrase: 'pet sitting', category: 'caregiving' },
  { phrase: 'dog walking', category: 'caregiving' },
  { phrase: 'haircut', category: 'beauty' },
  { phrase: 'manicure', category: 'beauty' },
  { phrase: 'pedicure', category: 'beauty' },
  { phrase: 'makeup artist', category: 'beauty' },
  { phrase: 'facial', category: 'beauty' },
  { phrase: 'back pain', category: 'massage' },
  { phrase: 'deep tissue', category: 'massage' },
  { phrase: 'sports massage', category: 'massage' },
  { phrase: 'workout coach', category: 'fitness' },
  { phrase: 'yoga class', category: 'fitness' },
  { phrase: 'private chef', category: 'cooking' },
  { phrase: 'meal prep', category: 'cooking' },
  { phrase: 'catering', category: 'cooking' },
  { phrase: 'computer repair', category: 'tech' },
  { phrase: 'laptop repair', category: 'tech' },
  { phrase: 'cracked screen', category: 'tech' },
  { phrase: 'wifi setup', category: 'tech' },
  { phrase: 'data recovery', category: 'tech' },
  { phrase: 'moving help', category: 'moving' },
  { phrase: 'lawn mowing', category: 'yard' },
  { phrase: 'snow removal', category: 'yard' },
  { phrase: 'grocery run', category: 'errands' },
];

export type Suggestion =
  | { kind: 'search'; id: string; query: string }
  | { kind: 'category'; id: string; category: Category; label: string }
  | {
      kind: 'subcategory';
      id: string;
      category: Category;
      subcategory: string;
      label: string;
      categoryLabel: string;
    }
  | { kind: 'phrase'; id: string; phrase: string; category: Category; categoryLabel: string };

function norm(s: string): string {
  return s.toLowerCase().trim();
}

/** How well a candidate matches the typed text. -1 = no match. */
function score(query: string, candidate: string): number {
  const q = norm(query);
  const c = norm(candidate);
  if (!q) return -1;
  if (c.startsWith(q)) return 100;
  if (c.split(/[\s/]+/).some((w) => w.startsWith(q))) return 90;
  if (c.includes(q)) return 70;
  // Stem tolerance: "tutori" / "tutoring" vs "tutor" style near-misses —
  // a candidate that is a prefix of the query also counts.
  if (q.length >= 4 && q.startsWith(c)) return 60;
  return -1;
}

export interface SuggestionLabels {
  categoryLabel: (category: Category) => string;
  subcategoryLabel: (category: Category, subcategory: string) => string;
}

/**
 * Build the drop-down list for what the customer has typed so far.
 * Always starts with the plain "search for this text" action, then the
 * best-matching category, its service types, and plain-language phrases.
 * Capped at `limit` rows so the drop-down never covers the filters.
 */
export function buildSuggestions(
  rawQuery: string,
  labels: SuggestionLabels,
  limit = 8,
): Suggestion[] {
  const query = rawQuery.trim();
  if (query.length < 2) return [];
  const out: Suggestion[] = [{ kind: 'search', id: 'search', query }];

  const scoredCategories = categories
    .map((category) => ({
      category,
      label: labels.categoryLabel(category),
      s: Math.max(score(query, labels.categoryLabel(category)), score(query, category.replace(/_/g, ' '))),
    }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s);

  const topCategory = scoredCategories[0];

  for (const { category, label } of scoredCategories.slice(0, 2)) {
    out.push({ kind: 'category', id: `cat-${category}`, category, label });
  }

  // Service types: those that match the text themselves, plus — when a
  // category itself matches (typing "Tuto") — that category's types, so
  // the customer can go straight to Math / Test prep / Homework help.
  const subSeen = new Set<string>();
  const pushSub = (category: Category, subcategory: string) => {
    if (subSeen.has(subcategory) || out.length >= limit) return;
    subSeen.add(subcategory);
    out.push({
      kind: 'subcategory',
      id: `sub-${subcategory}`,
      category,
      subcategory,
      label: labels.subcategoryLabel(category, subcategory),
      categoryLabel: labels.categoryLabel(category),
    });
  };
  for (const category of categories) {
    for (const sub of subcategories[category]) {
      if (score(query, labels.subcategoryLabel(category, sub)) >= 90) {
        pushSub(category, sub);
      }
    }
  }
  if (topCategory && topCategory.s >= 90) {
    for (const sub of subcategories[topCategory.category].slice(0, 4)) {
      pushSub(topCategory.category, sub);
    }
  }

  // Plain-language phrases that match, or that belong to a matched
  // category ("Tuto" → "math tutor", "homework help").
  for (const p of SEARCH_PHRASES) {
    if (out.length >= limit) break;
    const phraseScore = score(query, p.phrase);
    const inTopCategory = topCategory && p.category === topCategory.category;
    if (phraseScore >= 90 || (inTopCategory && phraseScore >= 0) || (inTopCategory && topCategory.s >= 100)) {
      if (out.some((o) => o.kind === 'phrase' && o.phrase === p.phrase)) continue;
      out.push({
        kind: 'phrase',
        id: `phrase-${p.phrase}`,
        phrase: p.phrase,
        category: p.category,
        categoryLabel: labels.categoryLabel(p.category),
      });
    }
  }

  return out.slice(0, limit);
}
