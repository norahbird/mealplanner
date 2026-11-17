// Vercel serverless function: POST /api/import-recipe { url } → { recipe } or { error, message }.
//
// Most recipe sites publish a structured copy of the recipe (schema.org "Recipe" JSON-LD) for
// search engines. This fetches the page and reads that, so no AI or paid service is involved.
// It runs on the server because browsers can't fetch other sites' pages directly. Only signed-in
// Meal Planner users can call it, so it can't be used as an open proxy.

export interface ImportedRecipe {
  title: string;
  servings: number | null;
  ingredients: string[];
  steps: string[];
  tags: string[];
  notes: string;
  source_url: string;
}

type ErrorCode = 'bad_url' | 'blocked' | 'no_recipe' | 'fetch_failed' | 'timeout' | 'auth' | 'method';

class ImportError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public status = 422,
  ) {
    super(message);
  }
}

// ---- Reading the recipe out of a page -------------------------------------------------------

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', frac12: '½', frac14: '¼', frac34: '¾',
  frac13: '⅓', frac23: '⅔', frac18: '⅛', deg: '°', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', hellip: '…', eacute: 'é', egrave: 'è', ntilde: 'ñ', times: '×', reg: '®',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (match, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[e.toLowerCase()] ?? match;
  });
}

/** Text with tags removed and entities decoded (twice: some sites double-encode). Keeps line breaks. */
function cleanText(value: unknown): string {
  if (typeof value !== 'string') return '';
  const text = value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|div|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(decodeEntities(text))
    .replace(/[ \t ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function cleanLine(value: unknown): string {
  return cleanText(value).replace(/\s*\n\s*/g, ' ').trim();
}

function isRecipe(node: unknown): node is Record<string, unknown> {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
  const type = (node as Record<string, unknown>)['@type'];
  return type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'));
}

function findRecipe(node: unknown, depth = 0): Record<string, unknown> | null {
  if (!node || typeof node !== 'object' || depth > 8) return null;
  if (isRecipe(node)) return node;
  const children = Array.isArray(node) ? node : Object.values(node as Record<string, unknown>);
  for (const child of children) {
    const found = findRecipe(child, depth + 1);
    if (found) return found;
  }
  return null;
}

function parseJsonLd(raw: string): unknown {
  const text = raw
    .trim()
    .replace(/^<!--|-->$/g, '')
    .replace(/^\s*\/\/\s*<!\[CDATA\[|\/\/\s*\]\]>\s*$/g, '')
    .trim();
  try {
    return JSON.parse(text);
  } catch {
    // Some sites leave raw line breaks or tabs inside strings, which strict JSON doesn't allow.
    try {
      return JSON.parse(text.replace(/[\u0000-\u001f]+/g, ' '));
    } catch {
      return null;
    }
  }
}

function servingsFrom(yieldValue: unknown): number | null {
  const values = Array.isArray(yieldValue) ? yieldValue : [yieldValue];
  for (const v of values) {
    const n = typeof v === 'number' ? v : Number(String(v ?? '').match(/\d+/)?.[0]);
    if (Number.isFinite(n) && n > 0) return Math.min(40, Math.round(n));
  }
  return null;
}

function stepsFrom(node: unknown, out: string[]) {
  if (!node) return;
  if (typeof node === 'string') {
    for (const line of cleanText(node).split('\n')) if (line.trim()) out.push(line.trim());
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((n) => stepsFrom(n, out));
    return;
  }
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (obj['@type'] === 'HowToSection' || Array.isArray(obj.itemListElement)) {
      const start = out.length;
      stepsFrom(obj.itemListElement, out);
      const name = cleanLine(obj.name).replace(/:$/, '');
      if (name && out.length > start) out[start] = `${name}: ${out[start]}`;
      return;
    }
    const text = cleanLine(obj.text ?? obj.name ?? obj.description);
    if (text) out.push(text);
  }
}

function listFrom(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((v) => (typeof v === 'string' ? v.split(',') : [])).map((s) => cleanLine(s).toLowerCase());
}

/** "PT1H30M" → "1 hr 30 min" */
function durationText(value: unknown): string {
  const m = typeof value === 'string' ? value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/i) : null;
  if (!m) return '';
  const minutes = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  if (!minutes) return '';
  const h = Math.floor(minutes / 60);
  const min = minutes % 60;
  return [h ? `${h} hr` : '', min ? `${min} min` : ''].filter(Boolean).join(' ');
}

/** The recipe on a page, or null if the page doesn't publish one. */
export function recipeFromHtml(html: string, pageUrl: string): ImportedRecipe | null {
  const scripts = html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi);
  let recipe: Record<string, unknown> | null = null;
  for (const [, raw] of scripts) {
    recipe = findRecipe(parseJsonLd(raw));
    if (recipe) break;
  }
  if (!recipe) return null;

  const rawIngredients = recipe.recipeIngredient ?? recipe.ingredients;
  const ingredients = (Array.isArray(rawIngredients) ? rawIngredients : cleanText(rawIngredients).split('\n'))
    .map(cleanLine)
    .filter(Boolean);
  const steps: string[] = [];
  stepsFrom(recipe.recipeInstructions, steps);
  if (ingredients.length === 0 && steps.length === 0) return null;

  const tags = [...new Set([...listFrom(recipe.recipeCategory), ...listFrom(recipe.recipeCuisine)])]
    .filter((t) => t && t.length <= 30)
    .slice(0, 5);
  const times = [
    ['Prep', durationText(recipe.prepTime)],
    ['Cook', durationText(recipe.cookTime)],
    ['Total', durationText(recipe.totalTime)],
  ]
    .filter(([, t]) => t)
    .map(([label, t]) => `${label} ${t}`);

  const title = cleanLine(recipe.name) || cleanLine(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]) || 'Imported recipe';
  return {
    title,
    servings: servingsFrom(recipe.recipeYield),
    ingredients,
    steps,
    tags,
    notes: times.join(' · '),
    source_url: pageUrl,
  };
}

// ---- Fetching the page ----------------------------------------------------------------------

const MAX_BYTES = 5 * 1024 * 1024;

function checkUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ImportError('bad_url', "That doesn't look like a web address. Copy the link from the recipe page and paste it here.", 400);
  }
  const host = url.hostname.toLowerCase();
  const isIp = /^[\d.]+$/.test(host) || host.includes(':') || host.startsWith('[');
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    isIp ||
    host === 'localhost' ||
    !host.includes('.') ||
    /\.(local|internal|localhost)$/.test(host)
  ) {
    throw new ImportError('bad_url', "That doesn't look like a recipe page's web address.", 400);
  }
  return url;
}

async function readLimited(resp: Response): Promise<string> {
  if (!resp.body) return '';
  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  void reader.cancel().catch(() => {});
  return new TextDecoder().decode(Buffer.concat(chunks));
}

async function fetchPage(start: URL): Promise<{ html: string; url: string }> {
  let url = start;
  for (let hop = 0; hop < 5; hop++) {
    let resp: Response;
    try {
      resp = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
    } catch (err) {
      if ((err as Error).name === 'TimeoutError') throw new ImportError('timeout', `${url.hostname} took too long to answer. Try again in a moment.`);
      throw new ImportError('fetch_failed', `Couldn't reach ${url.hostname}. Check the link and try again.`);
    }
    const location = resp.headers.get('location');
    if (resp.status >= 300 && resp.status < 400 && location) {
      url = checkUrl(new URL(location, url).toString());
      continue;
    }
    if ([401, 403, 429, 451, 503].includes(resp.status)) {
      throw new ImportError('blocked', `${url.hostname} didn't let Meal Planner read the page.`);
    }
    if (!resp.ok) throw new ImportError('fetch_failed', `Couldn't load that page (${url.hostname} answered ${resp.status}).`);
    const type = resp.headers.get('content-type') ?? '';
    if (type && !/html|xml/i.test(type)) throw new ImportError('no_recipe', "That link isn't a web page with a recipe on it.");
    return { html: await readLimited(resp), url: url.toString() };
  }
  throw new ImportError('fetch_failed', 'That link redirects too many times.');
}

// ---- Who's asking ---------------------------------------------------------------------------

async function isSignedIn(authHeader: string | undefined): Promise<boolean> {
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!token || !supabaseUrl || !anonKey) return false;
  try {
    const resp = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

// ---- Handler --------------------------------------------------------------------------------

interface Req {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}
interface Res {
  status(code: number): Res;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
}

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'POST') throw new ImportError('method', 'Use POST.', 405);
    const auth = req.headers.authorization;
    if (!(await isSignedIn(Array.isArray(auth) ? auth[0] : auth))) {
      throw new ImportError('auth', 'Sign in again to import recipes.', 401);
    }
    const body = typeof req.body === 'string' ? (JSON.parse(req.body || '{}') as unknown) : req.body;
    const raw = body && typeof body === 'object' && 'url' in body ? String((body as { url: unknown }).url ?? '') : '';
    const page = await fetchPage(checkUrl(raw));
    const recipe = recipeFromHtml(page.html, page.url);
    if (!recipe) {
      throw new ImportError('no_recipe', "Couldn't find a recipe on that page. Some sites don't include the details Meal Planner reads.");
    }
    res.status(200).json({ recipe });
  } catch (err) {
    if (err instanceof ImportError) {
      res.status(err.status).json({ error: err.code, message: err.message });
    } else {
      console.error('import-recipe failed', err);
      res.status(500).json({ error: 'fetch_failed', message: 'Something went wrong importing that page.' });
    }
  }
}
