import type { Ingredient } from '../data/types';
import { matchKey, normalizeName } from './names';
import { isKnownUnit, normalizeUnit, numberValue, QTY_RE, replaceUnicodeFractions } from './units';

export interface ParsedLine {
  qty: number | null;
  unit: string;
  name: string;
  note: string;
}

// Words that describe an ingredient rather than name it; moved to the note for new ingredients.
const DESCRIPTORS = new Set([
  'large', 'small', 'medium', 'extra-large', 'fresh', 'freshly', 'chopped', 'minced', 'diced', 'sliced',
  'grated', 'shredded', 'finely', 'roughly', 'thinly', 'peeled', 'packed', 'softened', 'melted', 'cold',
  'warm', 'ripe', 'whole', 'boneless', 'skinless', 'organic', 'uncooked', 'cooked', 'raw', 'heaping', 'level',
]);

/** Splits a recipe line like "1 ½ cups chopped onion, divided" into quantity, unit, name and note. */
export function parseLine(raw: string): ParsedLine | null {
  let s = replaceUnicodeFractions(raw)
    .replace(/^[\s\-–•*·▢□☐]+/, '')
    .trim();
  if (!s) return null;

  let qty: number | null = null;
  const m = s.match(QTY_RE);
  if (m) {
    qty = Math.max(numberValue(m[1]), m[2] ? numberValue(m[2]) : 0);
    s = s.slice(m[0].length).trim();
  }

  const notes: string[] = [];
  s = s
    .replace(/\(([^)]*)\)/g, (_, inner: string) => {
      notes.push(inner.trim());
      return ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();

  let unit = '';
  const words = s.split(' ');
  const two = words.slice(0, 2).join(' ');
  const unitAllowed = (rest: string[]) => qty !== null || rest[0]?.toLowerCase() === 'of';
  if (words.length > 2 && /^(fl\.? oz|fluid ounces?)$/i.test(two)) {
    unit = 'fl oz';
    s = words.slice(2).join(' ');
  } else if (words.length > 1 && isKnownUnit(words[0]) && unitAllowed(words.slice(1))) {
    unit = normalizeUnit(words[0]);
    s = words.slice(1).join(' ');
  }
  s = s.replace(/^of\s+/i, '');

  const comma = s.indexOf(',');
  if (comma >= 0) {
    notes.push(s.slice(comma + 1).trim());
    s = s.slice(0, comma).trim();
  }
  s = s
    .replace(/\s*\b(to taste|for serving|for garnish|optional|as needed|plus more.*)$/i, (found) => {
      notes.push(found.trim());
      return '';
    })
    .trim();

  return { qty, unit, name: s, note: notes.filter(Boolean).join(', ') };
}

/**
 * Finds the saved ingredient a line refers to: the longest ingredient name that appears in it
 * ("boneless chicken breasts" → chicken breast). Returns the leftover words too.
 */
export function matchIngredient(text: string, ingredients: Ingredient[]): { ingredient: Ingredient; rest: string } | null {
  const padded = ` ${matchKey(text)} `;
  let best: { ingredient: Ingredient; key: string } | null = null;
  for (const ingredient of ingredients) {
    const key = matchKey(ingredient.name);
    if (key && padded.includes(` ${key} `) && (!best || key.length > best.key.length)) best = { ingredient, key };
  }
  if (!best) return null;
  return { ingredient: best.ingredient, rest: padded.replace(` ${best.key} `, ' ').trim() };
}

export function findExact(name: string, ingredients: Ingredient[]): Ingredient | undefined {
  const key = matchKey(name);
  return ingredients.find((i) => matchKey(i.name) === key);
}

/** A clean name for a new ingredient: descriptive words moved to the note. */
export function cleanNewName(name: string): { name: string; extraNote: string } {
  const words = normalizeName(name).split(' ');
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const w of words) (DESCRIPTORS.has(w) && kept.length === 0 ? dropped : kept).push(w);
  if (kept.length === 0) return { name: normalizeName(name), extraNote: '' };
  return { name: kept.join(' '), extraNote: dropped.join(' ') };
}

export function joinNote(...parts: string[]): string {
  return parts.map((p) => p.trim()).filter(Boolean).join(', ');
}

const SECTION_HINTS: [RegExp, string][] = [
  [/\bfrozen\b/, 'Frozen'],
  // Checked before the meat words, so "chicken stock" isn't filed under meat.
  [/\b(stock|broth|bouillon)\b/, 'Canned & Jarred'],
  [/\b(vinegar|sauce)\b/, 'Condiments & Sauces'],
  [/\b(wine|beer|cider|vermouth|sherry|brandy|rum|vodka)\b/, 'Drinks'],
  [/\b(chicken|beef|pork|lamb|turkey|fish|salmon|shrimp|prawns?|bacon|sausages?|steak|cod|chorizo|mince)\b/, 'Meat & Seafood'],
  [/\b(cheese|milk|cream|yogh?urt|butter|eggs?|ricotta|mascarpone|halloumi|paneer)\b/, 'Dairy & Eggs'],
  [/\b(powder|seasoning|spice|extract|dried \w+|ground \w+|cardamom|cloves|coriander seeds?|garam masala)\b/, 'Spices & Baking'],
  [/\b(canned|tinned|beans|chickpeas|broth|stock)\b/, 'Canned & Jarred'],
  [/\b(sauce|vinegar|mustard|ketchup|mayo\w*|paste|chutney|dressing)\b/, 'Condiments & Sauces'],
  [/\b(bread|buns?|rolls?|tortillas?|bagels?|baguette|pitas?)\b/, 'Bakery'],
  [/\b(flour|sugar|rice|pasta|noodles|oats|oil|nuts?|seeds|lentils|quinoa|cereal|chocolate)\b/, 'Pantry'],
  [/\b(lettuce|greens|herbs?|onions?|garlic|peppers?|tomato\w*|potato\w*|carrots?|squash|apples?|lemons?|limes?|berries|cilantro|parsley|basil|mint|scallions?|cabbage|celery|mushrooms?|spinach|kale|fruit|ginger|chilli?e?s?|avocados?|cucumbers?|zucchini|courgettes?|aubergines?|eggplants?)\b/, 'Produce'],
];

/** A best guess at the store section for a new ingredient. */
export function guessSection(name: string): string {
  const n = normalizeName(name);
  for (const [re, section] of SECTION_HINTS) if (re.test(n)) return section;
  return 'Other';
}

/**
 * Text copied from a photo (Live Text) or a PDF keeps the page's line wraps, so one step
 * arrives as several lines. This rejoins lines into whole steps: a new step starts after a
 * line ending in . ! ? or :, or at a line that starts with a number ("2." or "Step 2").
 */
export function joinWrappedLines(text: string): string {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      if (out.length && out[out.length - 1] !== '') out.push('');
      continue;
    }
    const last = out[out.length - 1];
    const startsStep = /^(\d+[.)]|step\s+\d+|[-•*])\s*/i.test(line);
    if (last === undefined || last === '' || startsStep || /[.!?:)]["'”’]?$/.test(last)) out.push(line);
    else if (/[a-z]-$/i.test(last) && /^[a-z]/.test(line)) out[out.length - 1] = last.slice(0, -1) + line;
    else out[out.length - 1] = `${last} ${line}`;
  }
  return out.filter((l) => l !== '').join('\n');
}
