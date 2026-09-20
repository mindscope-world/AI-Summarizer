/**
 * A cheap, model-free check that a summary sticks to its source. It cannot prove a summary is
 * right, but it reliably catches the classic failure: an invented number or name.
 */

// Words that are capitalised only because they start a sentence or are generic.
const COMMON_CAPITALISED = new Set(
  'The This That These Those There Their They However Therefore Thus Moreover Furthermore Overall Finally First Second Third Also Both Each Many Some Most Such Other Another In On At For From With Without Within Between Among During After Before While When Where Which What Who Whom Whose How Why If Although Because Since Unless Until Yet But And Nor Not Only Even Still Then Here Once Just Like Key Main Summary Section Document Source Report Study Paper Chapter Table Figure'.split(
    ' ',
  ),
);

/** Normalises numbers so "12,450", "12450" and "12,450." compare equal. */
function numberKey(raw: string): string {
  return raw.replace(/,/g, '').replace(/\.$/, '');
}

function numbersIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.match(/\d[\d,]*(?:\.\d+)?%?/g) ?? []) out.add(numberKey(m));
  return out;
}

/** Capitalised words that are not at the start of a sentence: likely names, places, organisations, products. */
function properNouns(text: string): string[] {
  const found: string[] = [];
  const re = /(^|[.!?:;\n]\s+|\s)(\p{Lu}[\p{L}'-]{3,})/gu;
  for (const m of text.matchAll(re)) {
    const startsSentence = m[1] === '' || /[.!?:;\n]/.test(m[1]);
    if (startsSentence) continue;
    if (COMMON_CAPITALISED.has(m[2])) continue;
    found.push(m[2]);
  }
  return found;
}

export interface GroundingOptions {
  /** Skip name checks when the summary is in a different language than the source (translation changes spellings). */
  checkNames: boolean;
}

/** Figures and names that appear in the summary but nowhere in the source, most important first. */
export function findUngroundedTerms(summary: string, source: string, {checkNames}: GroundingOptions): string[] {
  const missing: string[] = [];

  const sourceNumbers = numbersIn(source);
  for (const raw of summary.match(/\d[\d,]*(?:\.\d+)?%?/g) ?? []) {
    const key = numberKey(raw);
    const bare = key.replace('%', '');
    if (Number(bare) <= 10 && !key.endsWith('%')) continue; // small counts are usually the model's own ("3 key points")
    if (!sourceNumbers.has(key) && !sourceNumbers.has(bare) && !missing.includes(raw)) missing.push(raw);
  }

  if (checkNames) {
    const haystack = source.toLowerCase();
    for (const noun of properNouns(summary)) {
      if (!haystack.includes(noun.toLowerCase()) && !missing.includes(noun)) missing.push(noun);
    }
  }
  return missing;
}

/** A user-facing warning, or null if everything checked out. */
export function groundingWarning(missing: string[]): string | null {
  if (!missing.length) return null;
  const shown = missing.slice(0, 8).join(', ');
  const more = missing.length > 8 ? ` and ${missing.length - 8} more` : '';
  return `The summary mentions figures or names that were not found in the source (${shown}${more}). Check them against the source document before relying on them.`;
}
