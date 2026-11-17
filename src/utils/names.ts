export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function singularWord(w: string): string {
  if (w.length <= 3 || /(ss|us|is)$/.test(w)) return w;
  if (w === 'leaves') return 'leaf';
  if (w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (/(oes|ches|shes|xes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s')) return w.slice(0, -1);
  return w;
}

/** Rough singular form used only for matching ("Tomatoes" and "tomato" match). */
export function matchKey(s: string): string {
  return normalizeName(s)
    .replace(/[^a-z0-9ñé\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(singularWord)
    .join(' ');
}

/** "onion" → "onions", for "2 onions". Leaves names that already end in s alone. */
export function pluralize(name: string): string {
  if (/s$/i.test(name)) return name;
  if (/[^aeiou]y$/i.test(name)) return name.slice(0, -1) + 'ies';
  if (/(ch|sh|x)$/i.test(name) || /(tomato|potato)$/i.test(name)) return name + 'es';
  return name + 's';
}
