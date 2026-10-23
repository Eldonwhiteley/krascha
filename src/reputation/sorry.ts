// Finds an apology in one prompt: sorry, forgive me, my bad. One typed after
// the board caught you cheating gets you forgiven, so the match is loose on
// purpose, typos and all.

import { stripIgnored } from './clean.js';
import { buildForms, findMatches, tokenize, typoEntries } from './detect.js';
import { APOLOGY_LEXICON } from './lexicon.js';

// Exact forms come first, so a typo never beats a real spelling.
const FORMS = buildForms([...APOLOGY_LEXICON, ...typoEntries(APOLOGY_LEXICON)]);

/** Whether the prompt says sorry in any of the ways Krascha accepts. */
export function isApology(text: string): boolean {
  return findMatches(FORMS, tokenize(stripIgnored(text))).length > 0;
}
