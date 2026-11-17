import { addDaysISO, todayISO } from '../utils/dates';
import { normalizeName } from '../utils/names';
import { commit, getState, newId, nowISO, type Op } from './store';
import type {
  GroceryItem,
  HouseholdSettings,
  Ingredient,
  Meal,
  PlanEntry,
  Recipe,
  Status,
  StorageLocation,
} from './types';

type Row = { id: string } & Record<string, unknown>;
const asRow = (x: object) => x as unknown as Row;

function householdId(): string {
  const id = getState().data.household?.id;
  if (!id) throw new Error('Not loaded yet');
  return id;
}

export function settings(): Required<Omit<HouseholdSettings, 'seeded'>> & HouseholdSettings {
  const s = getState().data.household?.settings ?? {};
  return { people: 1, weekStart: 1, shopDays: 7, ...s };
}

export function updateSettings(patch: Partial<HouseholdSettings>) {
  const current = getState().data.household?.settings ?? {};
  commit([{ type: 'settings', settings: { ...current, ...patch } }]);
}

// ---- Ingredients / on hand ----------------------------------------------------------------

export function defaultLocation(section: string): StorageLocation {
  if (['Produce', 'Meat & Seafood', 'Dairy & Eggs'].includes(section)) return 'fridge';
  if (section === 'Frozen') return 'freezer';
  return 'pantry';
}

export function estimateUseBy(ing: Pick<Ingredient, 'shelf_life_days'>): string | null {
  return ing.shelf_life_days ? addDaysISO(todayISO(), ing.shelf_life_days) : null;
}

export function newIngredient(name: string, patch: Partial<Ingredient> = {}): Ingredient {
  const section = patch.section ?? 'Other';
  return {
    id: newId(),
    household_id: householdId(),
    name: normalizeName(name),
    section,
    location: defaultLocation(section),
    shelf_life_days: null,
    staple: false,
    status: null,
    use_by: null,
    updated_at: nowISO(),
    ...patch,
  };
}

export function insertIngredientOp(ing: Ingredient): Op {
  return { type: 'insert', table: 'ingredients', rows: [asRow(ing)] };
}

export function addIngredient(ing: Ingredient) {
  commit([insertIngredientOp(ing)]);
}

function ingredientUpdate(id: string, patch: Partial<Ingredient>): Op {
  return { type: 'update', table: 'ingredients', id, values: { ...patch, updated_at: nowISO() } };
}

export function updateIngredient(id: string, patch: Partial<Ingredient>) {
  commit([ingredientUpdate(id, patch)]);
}

/** Sets have / low / out. Marking something "have" that wasn't guesses a fresh use-by date. */
export function setStatus(id: string, status: Status | null, opts: { bought?: boolean } = {}) {
  const ing = getState().data.ingredients[id];
  if (!ing) return;
  const patch: Partial<Ingredient> = { status };
  if (status === 'have' && (opts.bought || ing.status === 'out' || ing.status === null)) {
    patch.use_by = estimateUseBy(ing);
  }
  if (status === 'out' || status === null) patch.use_by = null;
  commit([ingredientUpdate(id, patch)]);
}

export function recipesUsing(ingredientId: string): Recipe[] {
  return Object.values(getState().data.recipes).filter((r) => r.ingredients.some((l) => l.ingredient_id === ingredientId));
}

export function deleteIngredient(id: string) {
  const grocery = Object.values(getState().data.grocery).filter((g) => g.ingredient_id === id);
  const ops: Op[] = [];
  if (grocery.length) ops.push({ type: 'delete', table: 'grocery', ids: grocery.map((g) => g.id) });
  ops.push({ type: 'delete', table: 'ingredients', ids: [id] });
  commit(ops);
}

// ---- Recipes ------------------------------------------------------------------------------

export function blankRecipe(): Recipe {
  const now = nowISO();
  return {
    id: newId(),
    household_id: householdId(),
    title: '',
    servings: 2,
    ingredients: [],
    steps: '',
    tags: [],
    source_url: null,
    notes: '',
    rating: null,
    created_at: now,
    updated_at: now,
  };
}

/** Saves a recipe, creating any new ingredients it uses first. */
export function saveRecipe(recipe: Recipe, newIngredients: Ingredient[]) {
  const exists = Boolean(getState().data.recipes[recipe.id]);
  const ops: Op[] = newIngredients.map(insertIngredientOp);
  const saved = { ...recipe, updated_at: nowISO() };
  if (exists) {
    const { id, household_id: _h, created_at: _c, ...values } = saved;
    ops.push({ type: 'update', table: 'recipes', id, values });
  } else {
    ops.push({ type: 'insert', table: 'recipes', rows: [asRow(saved)] });
  }
  // Keep planned meals' titles in step with the recipe.
  for (const e of Object.values(getState().data.entries)) {
    if (e.recipe_id === recipe.id && e.title !== recipe.title) {
      ops.push({ type: 'update', table: 'entries', id: e.id, values: { title: recipe.title, updated_at: nowISO() } });
    }
  }
  commit(ops);
}

export function updateRecipe(id: string, patch: Partial<Recipe>) {
  commit([{ type: 'update', table: 'recipes', id, values: { ...patch, updated_at: nowISO() } }]);
}

export function deleteRecipe(id: string) {
  const ops: Op[] = [];
  for (const e of Object.values(getState().data.entries)) {
    if (e.recipe_id === id) ops.push({ type: 'update', table: 'entries', id: e.id, values: { recipe_id: null, updated_at: nowISO() } });
  }
  ops.push({ type: 'delete', table: 'recipes', ids: [id] });
  commit(ops);
}

// ---- Plan ---------------------------------------------------------------------------------

export function newEntry(fields: Pick<PlanEntry, 'date' | 'meal' | 'kind'> & Partial<PlanEntry>): PlanEntry {
  const now = nowISO();
  return {
    id: newId(),
    household_id: householdId(),
    recipe_id: null,
    leftover_of: null,
    title: '',
    servings: settings().people,
    done: false,
    created_at: now,
    updated_at: now,
    ...fields,
  };
}

export function addEntries(entries: PlanEntry[]) {
  commit([{ type: 'insert', table: 'entries', rows: entries.map(asRow) }]);
}

export function updateEntry(id: string, patch: Partial<PlanEntry>) {
  commit([{ type: 'update', table: 'entries', id, values: { ...patch, updated_at: nowISO() } }]);
}

export function leftoversOf(entryId: string): PlanEntry[] {
  return Object.values(getState().data.entries)
    .filter((e) => e.leftover_of === entryId)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function deleteEntry(id: string) {
  const children = leftoversOf(id).map((e) => e.id);
  const ops: Op[] = [];
  if (children.length) ops.push({ type: 'delete', table: 'entries', ids: children });
  ops.push({ type: 'delete', table: 'entries', ids: [id] });
  commit(ops);
}

/** Adds a leftovers lunch the day after a dinner. */
export function leftoversLunchFor(dinner: PlanEntry, meal: Meal = 'lunch', date = addDaysISO(dinner.date, 1)): PlanEntry {
  return newEntry({ date, meal, kind: 'leftovers', leftover_of: dinner.id, title: dinner.title, servings: settings().people });
}

/** Marks a meal cooked and updates what's left of its ingredients. */
export function markCooked(entryId: string, statuses: Record<string, Status | null>) {
  const ops: Op[] = [{ type: 'update', table: 'entries', id: entryId, values: { done: true, updated_at: nowISO() } }];
  const data = getState().data;
  for (const [id, status] of Object.entries(statuses)) {
    const ing = data.ingredients[id];
    if (!ing || ing.status === status) continue;
    const patch: Partial<Ingredient> = { status };
    if (status === 'out') patch.use_by = null;
    ops.push(ingredientUpdate(id, patch));
  }
  commit(ops);
}

// ---- Grocery list -------------------------------------------------------------------------

function newGroceryItem(fields: Partial<GroceryItem>): GroceryItem {
  const now = nowISO();
  return {
    id: newId(),
    household_id: householdId(),
    ingredient_id: null,
    name: '',
    amount: '',
    section: 'Other',
    forced: false,
    checked: false,
    created_at: now,
    updated_at: now,
    ...fields,
  };
}

function groceryUpdate(id: string, patch: Partial<GroceryItem>): Op {
  return { type: 'update', table: 'grocery', id, values: { ...patch, updated_at: nowISO() } };
}

/** Puts an item on the list by hand (or, for an ingredient, even though you have it). */
export function addToList(fields: { ingredient?: Ingredient; name?: string; amount?: string; section?: string }) {
  const ing = fields.ingredient;
  const existing = ing ? Object.values(getState().data.grocery).find((g) => g.ingredient_id === ing.id) : undefined;
  if (existing) {
    commit([groceryUpdate(existing.id, { forced: true, checked: false, amount: fields.amount ?? existing.amount })]);
    return;
  }
  const item = newGroceryItem({
    ingredient_id: ing?.id ?? null,
    name: ing?.name ?? fields.name ?? '',
    amount: fields.amount ?? '',
    section: ing?.section ?? fields.section ?? 'Other',
    forced: true,
  });
  commit([{ type: 'insert', table: 'grocery', rows: [asRow(item)] }]);
}

export function setChecked(row: { item: GroceryItem | null; ingredient: Ingredient | null; name: string; amount: string; section: string }, checked: boolean) {
  if (row.item) {
    if (!checked && !row.item.forced && row.ingredient) commit([{ type: 'delete', table: 'grocery', ids: [row.item.id] }]);
    else commit([groceryUpdate(row.item.id, { checked })]);
    return;
  }
  if (!checked) return;
  const item = newGroceryItem({
    ingredient_id: row.ingredient?.id ?? null,
    name: row.ingredient?.name ?? row.name,
    amount: row.amount,
    section: row.section,
    checked: true,
  });
  commit([{ type: 'insert', table: 'grocery', rows: [asRow(item)] }]);
}

export function removeFromList(itemId: string) {
  commit([{ type: 'delete', table: 'grocery', ids: [itemId] }]);
}

/** "I already have this": marks it on hand and takes it off the list. */
export function alreadyHave(row: { item: GroceryItem | null; ingredient: Ingredient | null }) {
  const ops: Op[] = [];
  if (row.item) ops.push({ type: 'delete', table: 'grocery', ids: [row.item.id] });
  if (row.ingredient) {
    const ing = row.ingredient;
    const stale = ing.use_by && ing.use_by < todayISO();
    ops.push(ingredientUpdate(ing.id, { status: 'have', use_by: stale ? null : ing.use_by }));
  }
  commit(ops);
}

/** After shopping: everything checked off goes on hand with a fresh use-by date, and leaves the list. */
export function finishShopping(): number {
  const data = getState().data;
  const checked = Object.values(data.grocery).filter((g) => g.checked);
  if (checked.length === 0) return 0;
  const ops: Op[] = [];
  for (const g of checked) {
    const ing = g.ingredient_id ? data.ingredients[g.ingredient_id] : undefined;
    if (ing) ops.push(ingredientUpdate(ing.id, { status: 'have', use_by: estimateUseBy(ing) }));
  }
  ops.push({ type: 'delete', table: 'grocery', ids: checked.map((g) => g.id) });
  commit(ops);
  return checked.length;
}
