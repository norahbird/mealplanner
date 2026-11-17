import { SECTIONS, type Data, type GroceryItem, type Ingredient, type PlanEntry } from '../data/types';
import { addDaysISO, relativeDay, shortDay, todayISO } from './dates';
import { cap, matchKey } from './names';
import { sumAmounts } from './units';

export interface GroceryRow {
  key: string;
  ingredient: Ingredient | null;
  name: string;
  section: string;
  amount: string;
  /** "Chili · Mon, Tacos · Wed" */
  usedFor: string;
  /** Earliest day a planned meal needs it. */
  neededBy: string | null;
  /** Saved list row: manual additions, "need it" overrides and checked-off items. */
  item: GroceryItem | null;
  /** Needed by the plan (as opposed to added by hand). */
  fromPlan: boolean;
  flag: 'low' | 'expires' | null;
  flagText: string;
}

export interface GroceryList {
  toBuy: GroceryRow[];
  inCart: GroceryRow[];
  have: (GroceryRow & { reason: string })[];
  /** Running low but not needed by the plan. */
  lowExtras: Ingredient[];
  mealCount: number;
}

/** Servings a planned dinner has to make: its own plus any leftovers that come from it. */
export function servingsToCook(entry: PlanEntry, data: Data): number {
  let total = entry.servings;
  for (const e of Object.values(data.entries)) if (e.leftover_of === entry.id) total += e.servings;
  return total;
}

export function sectionOrder(section: string): number {
  const i = (SECTIONS as readonly string[]).indexOf(section);
  return i === -1 ? SECTIONS.length : i;
}

export function sortRows<T extends GroceryRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => sectionOrder(a.section) - sectionOrder(b.section) || a.name.localeCompare(b.name));
}

export function buildGroceryList(data: Data, days: number): GroceryList {
  const from = todayISO();
  const to = addDaysISO(from, days - 1);
  const needs = new Map<
    string,
    { ingredient: Ingredient | null; name: string; amounts: { qty: number | null; unit: string }[]; uses: { title: string; date: string }[] }
  >();

  const meals = Object.values(data.entries).filter(
    (e) => e.kind === 'recipe' && !e.done && e.date >= from && e.date <= to && e.recipe_id && data.recipes[e.recipe_id],
  );
  for (const entry of meals) {
    const recipe = data.recipes[entry.recipe_id!];
    const scale = servingsToCook(entry, data) / Math.max(1, recipe.servings);
    for (const line of recipe.ingredients) {
      const ingredient = line.ingredient_id ? data.ingredients[line.ingredient_id] ?? null : null;
      const key = ingredient ? ingredient.id : `name:${matchKey(line.name)}`;
      const need = needs.get(key) ?? { ingredient, name: ingredient?.name ?? line.name, amounts: [], uses: [] };
      need.amounts.push({ qty: line.qty === null ? null : line.qty * scale, unit: line.unit });
      if (!need.uses.some((u) => u.title === recipe.title && u.date === entry.date)) need.uses.push({ title: recipe.title, date: entry.date });
      needs.set(key, need);
    }
  }

  const items = Object.values(data.grocery);
  const itemFor = new Map<string, GroceryItem>();
  for (const item of items) if (item.ingredient_id) itemFor.set(item.ingredient_id, item);

  const toBuy: GroceryRow[] = [];
  const inCart: GroceryRow[] = [];
  const have: (GroceryRow & { reason: string })[] = [];
  const used = new Set<string>();

  for (const [key, need] of needs) {
    const ing = need.ingredient;
    const item = ing ? itemFor.get(ing.id) ?? null : null;
    if (item) used.add(item.id);
    const uses = [...need.uses].sort((a, b) => a.date.localeCompare(b.date));
    const neededBy = uses[0]?.date ?? null;
    const row: GroceryRow = {
      key,
      ingredient: ing,
      name: cap(need.name),
      section: ing?.section ?? 'Other',
      amount: sumAmounts(need.amounts, true),
      usedFor: uses.map((u) => `${u.title} · ${shortDay(u.date)}`).join(', '),
      neededBy,
      item,
      fromPlan: true,
      flag: null,
      flagText: '',
    };
    if (item?.checked) inCart.push(row);
    else if (item?.forced) toBuy.push(row);
    else if (ing?.staple) have.push({ ...row, reason: 'Always have' });
    else if (ing?.status === 'have') {
      if (ing.use_by && neededBy && ing.use_by < neededBy) {
        toBuy.push({ ...row, flag: 'expires', flagText: `Yours is only good until ${relativeDay(ing.use_by)}` });
      } else {
        have.push({ ...row, reason: ing.use_by ? `Good until ${relativeDay(ing.use_by)}` : 'On hand' });
      }
    } else if (ing?.status === 'low') toBuy.push({ ...row, flag: 'low', flagText: 'Running low' });
    else toBuy.push(row);
  }

  for (const item of items) {
    if (used.has(item.id)) continue;
    const ing = item.ingredient_id ? data.ingredients[item.ingredient_id] ?? null : null;
    const row: GroceryRow = {
      key: `item:${item.id}`,
      ingredient: ing,
      name: cap(ing?.name ?? item.name),
      section: ing?.section ?? item.section,
      amount: item.amount,
      usedFor: '',
      neededBy: null,
      item,
      fromPlan: false,
      flag: ing?.status === 'low' ? 'low' : null,
      flagText: ing?.status === 'low' ? 'Running low' : '',
    };
    (item.checked ? inCart : toBuy).push(row);
  }

  const listed = new Set([...toBuy, ...inCart].map((r) => r.ingredient?.id).filter(Boolean));
  const lowExtras = Object.values(data.ingredients)
    .filter((i) => i.status === 'low' && !listed.has(i.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { toBuy: sortRows(toBuy), inCart: sortRows(inCart), have: sortRows(have), lowExtras, mealCount: meals.length };
}

export function groupBySection<T extends GroceryRow>(rows: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const r of rows) groups.set(r.section, [...(groups.get(r.section) ?? []), r]);
  return [...groups.entries()].sort((a, b) => sectionOrder(a[0]) - sectionOrder(b[0]));
}
