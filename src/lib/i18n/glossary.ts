/**
 * Centralized Glossary & Protected Terms
 * Terms that should not be blindly translated into foreign words
 */

export interface ProtectedTerm {
  term: string;
  description: string;
  category: 'brand' | 'game' | 'currency' | 'platform';
  neverTranslate: boolean;
}

export const CANONICAL_PROTECTED_TERMS: ProtectedTerm[] = [
  {
    term: 'Event Game Studio',
    description: 'Platform Brand Name',
    category: 'brand',
    neverTranslate: true,
  },
  {
    term: 'EventGameStudio',
    description: 'Platform Brand Name',
    category: 'brand',
    neverTranslate: true,
  },
  {
    term: 'Catch The Brand',
    description: 'Game Title: Arcade catcher game',
    category: 'game',
    neverTranslate: false, // can have localized subtitle/display name, but keep brand token intact
  },
  {
    term: 'Brand Memory Match',
    description: 'Game Title: Card matching puzzle game',
    category: 'game',
    neverTranslate: false,
  },
  {
    term: 'Formula Reaction Lights',
    description: 'Game Title: F1 reflex starting light reaction test',
    category: 'game',
    neverTranslate: false,
  },
  {
    term: 'Reaction Time',
    description: 'Game Title / category alias for reaction reflex game',
    category: 'game',
    neverTranslate: false,
  },
  {
    term: 'Event Trivia Speed Quiz',
    description: 'Game Title: Timed trivia challenge',
    category: 'game',
    neverTranslate: false,
  },
  {
    term: 'RM',
    description: 'Malaysian Ringgit currency symbol',
    category: 'currency',
    neverTranslate: true,
  },
  {
    term: 'MYR',
    description: 'Malaysian Ringgit currency code',
    category: 'currency',
    neverTranslate: true,
  },
  {
    term: 'Stripe',
    description: 'Payment gateway brand',
    category: 'platform',
    neverTranslate: true,
  },
  {
    term: 'HitPay',
    description: 'Payment gateway brand',
    category: 'platform',
    neverTranslate: true,
  },
  {
    term: 'DuitNow',
    description: 'Payment rail name',
    category: 'platform',
    neverTranslate: true,
  },
];

export const PROTECTED_TERMS = CANONICAL_PROTECTED_TERMS;

/**
 * Returns a list of terms that must be preserved verbatim in translation prompts.
 */
export function getNeverTranslateTerms(additionalGlossary?: string[]): string[] {
  const base = CANONICAL_PROTECTED_TERMS.filter((t) => t.neverTranslate).map((t) => t.term);
  if (!additionalGlossary || additionalGlossary.length === 0) {
    return base;
  }
  return Array.from(new Set([...base, ...additionalGlossary]));
}

/**
 * Format protected terms for an LLM system prompt.
 */
export function getProtectedTermsForPrompt(): string {
  return CANONICAL_PROTECTED_TERMS.map(
    (pt) => `- "${pt.term}": ${pt.description} (${pt.neverTranslate ? 'DO NOT translate or transliterate' : 'Brand name, keep recognizable'})`
  ).join('\n');
}

/**
 * Extracts protected terms that appear in the given text.
 */
export function extractProtectedTermsInText(text: string): ProtectedTerm[] {
  if (!text) return [];
  return CANONICAL_PROTECTED_TERMS.filter((pt) => text.includes(pt.term));
}
