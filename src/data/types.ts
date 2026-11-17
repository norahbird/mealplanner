export type StorageLocation = 'fridge' | 'freezer' | 'pantry';
export type Status = 'have' | 'low' | 'out';
export type Meal = 'lunch' | 'dinner';

export const SECTIONS = [
  'Produce',
  'Meat & Seafood',
  'Dairy & Eggs',
  'Bakery',
  'Pantry',
  'Canned & Jarred',
  'Spices & Baking',
  'Condiments & Sauces',
  'Frozen',
  'Drinks',
  'Household',
  'Other',
] as const;

export const LOCATIONS: { value: StorageLocation; label: string }[] = [
  { value: 'fridge', label: 'Fridge' },
  { value: 'freezer', label: 'Freezer' },
  { value: 'pantry', label: 'Pantry' },
];

export interface Ingredient {
  id: string;
  household_id: string;
  /** Lowercase, e.g. "chicken breast". */
  name: string;
  section: string;
  location: StorageLocation;
  /** Typical days it keeps once bought, used to guess a use-by date. Null for long-life items. */
  shelf_life_days: number | null;
  staple: boolean;
  /** Null when not tracked on the On hand list. */
  status: Status | null;
  use_by: string | null;
  updated_at: string;
}

export interface RecipeLine {
  id: string;
  ingredient_id: string | null;
  /** The ingredient's name when the line was saved, shown if the ingredient is later deleted. */
  name: string;
  qty: number | null;
  unit: string;
  note: string;
}

export interface Recipe {
  id: string;
  household_id: string;
  title: string;
  servings: number;
  ingredients: RecipeLine[];
  steps: string;
  tags: string[];
  source_url: string | null;
  notes: string;
  rating: number | null;
  created_at: string;
  updated_at: string;
}

export interface PlanEntry {
  id: string;
  household_id: string;
  /** yyyy-MM-dd */
  date: string;
  meal: Meal;
  kind: 'recipe' | 'leftovers' | 'note';
  recipe_id: string | null;
  /** For leftovers: the dinner they come from. Its shopping covers these servings too. */
  leftover_of: string | null;
  title: string;
  servings: number;
  /** Cooked (recipes) or eaten (leftovers, notes). Done meals drop off the grocery list. */
  done: boolean;
  created_at: string;
  updated_at: string;
}

export interface GroceryItem {
  id: string;
  household_id: string;
  ingredient_id: string | null;
  name: string;
  amount: string;
  section: string;
  /** Added to the list by hand even though the plan doesn't need it (or you have it). */
  forced: boolean;
  checked: boolean;
  created_at: string;
  updated_at: string;
}

export interface HouseholdSettings {
  /** Default servings for a new meal. */
  people?: number;
  /** 1 = Monday, 0 = Sunday. */
  weekStart?: 0 | 1;
  /** Days ahead the grocery list covers. */
  shopDays?: number;
  seeded?: boolean;
}

export interface Household {
  id: string;
  name: string;
  settings: HouseholdSettings;
}

export interface Data {
  household: Household | null;
  ingredients: Record<string, Ingredient>;
  recipes: Record<string, Recipe>;
  entries: Record<string, PlanEntry>;
  grocery: Record<string, GroceryItem>;
}

export type TableKey = 'ingredients' | 'recipes' | 'entries' | 'grocery';

export const TABLES: Record<TableKey, string> = {
  ingredients: 'meal_ingredients',
  recipes: 'meal_recipes',
  entries: 'meal_plan_entries',
  grocery: 'meal_grocery_items',
};
