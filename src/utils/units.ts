const ALIASES: Record<string, string> = {
  teaspoon: 'tsp', teaspoons: 'tsp', tsp: 'tsp', tsps: 'tsp',
  tablespoon: 'tbsp', tablespoons: 'tbsp', tbsp: 'tbsp', tbsps: 'tbsp', tbs: 'tbsp', tbl: 'tbsp',
  cup: 'cup', cups: 'cup', c: 'cup',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml',
  l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  'fl oz': 'fl oz', 'fluid ounce': 'fl oz', 'fluid ounces': 'fl oz',
  g: 'g', gr: 'g', gram: 'g', grams: 'g',
  kg: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  clove: 'clove', cloves: 'clove',
  can: 'can', cans: 'can', tin: 'can', tins: 'can',
  bunch: 'bunch', bunches: 'bunch',
  pinch: 'pinch', pinches: 'pinch', dash: 'dash', dashes: 'dash',
  slice: 'slice', slices: 'slice',
  package: 'package', packages: 'package', pkg: 'package', packet: 'package', packets: 'package',
  head: 'head', heads: 'head',
  stalk: 'stalk', stalks: 'stalk', sprig: 'sprig', sprigs: 'sprig',
  handful: 'handful', handfuls: 'handful',
  piece: 'piece', pieces: 'piece',
  jar: 'jar', jars: 'jar', bag: 'bag', bags: 'bag', box: 'box', boxes: 'box',
  stick: 'stick', sticks: 'stick', bottle: 'bottle', bottles: 'bottle', container: 'container', containers: 'container',
};

export const UNIT_SUGGESTIONS = [
  'tsp', 'tbsp', 'cup', 'ml', 'l', 'g', 'kg', 'oz', 'lb', 'clove', 'can', 'bunch', 'pinch',
  'slice', 'package', 'head', 'stalk', 'sprig', 'handful', 'piece', 'jar', 'stick',
];

const VOLUME: Record<string, number> = { tsp: 4.92892, tbsp: 14.7868, 'fl oz': 29.5735, cup: 236.588, ml: 1, l: 1000 };
const MASS: Record<string, number> = { g: 1, oz: 28.3495, lb: 453.592, kg: 1000 };
const METRIC = new Set(['ml', 'l', 'g', 'kg']);
const NO_PLURAL = new Set(['tsp', 'tbsp', 'ml', 'l', 'g', 'kg', 'oz', 'lb', 'fl oz']);

export function normalizeUnit(raw: string): string {
  const t = raw.trim();
  if (t === 'T' || t === 'Tb' || t === 'Tbs') return 'tbsp';
  if (t === 't') return 'tsp';
  const k = t.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
  return ALIASES[k] ?? k;
}

export function isKnownUnit(word: string): boolean {
  const k = word.trim().toLowerCase().replace(/\./g, '');
  return k in ALIASES || word === 'T';
}

const UNICODE_FRACTIONS: Record<string, string> = {
  '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4',
  '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8', '⅕': '1/5',
};

export function replaceUnicodeFractions(s: string): string {
  return s.replace(/(\d)?\s*([½⅓⅔¼¾⅛⅜⅝⅞⅕])/g, (_, d: string | undefined, f: string) =>
    (d ? d + ' ' : '') + UNICODE_FRACTIONS[f],
  );
}

const NUM = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|\.\d+)`;
/** A leading quantity, optionally a range ("2-3", "2 to 3"). */
export const QTY_RE = new RegExp(String.raw`^(${NUM})(?:\s*(?:-|–|to)\s*(${NUM}))?`);

export function numberValue(s: string): number {
  const t = s.trim();
  if (/\s/.test(t)) {
    const [whole, frac] = t.split(/\s+/);
    return Number(whole) + numberValue(frac);
  }
  if (t.includes('/')) {
    const [a, b] = t.split('/');
    return Number(a) / Number(b);
  }
  return parseFloat(t);
}

/** Parses a typed quantity like "1 1/2", "½" or "0.5". Null if empty or not a number. */
export function parseQty(text: string): number | null {
  const t = replaceUnicodeFractions(text).trim();
  if (!t) return null;
  const m = t.match(QTY_RE);
  if (!m || m[0].length !== t.length) return null;
  const value = Math.max(numberValue(m[1]), m[2] ? numberValue(m[2]) : 0);
  return Number.isFinite(value) && value > 0 ? value : null;
}

const FRACTIONS: [number, string][] = [
  [0, ''], [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'],
  [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞'], [1, ''],
];

function round(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

export function formatQty(n: number, unit = ''): string {
  if (METRIC.has(unit)) {
    if (unit === 'kg' || unit === 'l') return String(round(n, 2));
    return String(n >= 10 ? Math.round(n) : round(n, 1));
  }
  if (n >= 10) return String(round(n, n % 1 === 0.5 ? 1 : 0));
  if (n < 1 / 16) return String(round(n, 2));
  let whole = Math.floor(n);
  const rest = n - whole;
  let best = FRACTIONS[0];
  for (const f of FRACTIONS) if (Math.abs(rest - f[0]) < Math.abs(rest - best[0])) best = f;
  if (best[0] === 1) whole += 1;
  const frac = best[0] === 1 ? '' : best[1];
  if (!whole) return frac || '0';
  return frac ? `${whole} ${frac}` : String(whole);
}

export function unitLabel(unit: string, qty: number | null): string {
  if (!unit || NO_PLURAL.has(unit) || qty === null || qty <= 1) return unit;
  if (/(ch|sh|x)$/.test(unit)) return unit + 'es';
  return unit + 's';
}

export function formatAmount(qty: number | null, unit: string): string {
  if (qty === null) return unit;
  return `${formatQty(qty, unit)} ${unitLabel(unit, qty)}`.trim();
}

/**
 * Adds up amounts for the grocery list: 2 tbsp + 1 cup → "1 ⅛ cups"; units that can't be combined
 * are listed together. With roundUpCounts, things bought whole (½ lime, ⅓ can) round up to 1.
 */
export function sumAmounts(amounts: { qty: number | null; unit: string }[], roundUpCounts = false): string {
  const groups = new Map<string, { table: Record<string, number> | null; total: number; units: Set<string> }>();
  for (const a of amounts) {
    if (a.qty === null) continue;
    const unit = normalizeUnit(a.unit);
    const table = unit in VOLUME ? VOLUME : unit in MASS ? MASS : null;
    const key = table === VOLUME ? 'volume' : table === MASS ? 'mass' : `u:${unit}`;
    const g = groups.get(key) ?? { table, total: 0, units: new Set<string>() };
    g.total += table ? a.qty * table[unit] : a.qty;
    g.units.add(unit);
    groups.set(key, g);
  }
  const parts: string[] = [];
  for (const g of groups.values()) {
    if (g.table) {
      const table = g.table;
      const display = [...g.units].sort((a, b) => table[b] - table[a])[0];
      parts.push(formatAmount(g.total / table[display], display));
    } else {
      parts.push(formatAmount(roundUpCounts ? Math.ceil(g.total - 1e-6) : g.total, [...g.units][0]));
    }
  }
  return parts.join(' + ');
}
