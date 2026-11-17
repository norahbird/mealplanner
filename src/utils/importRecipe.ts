import type { ImportedRecipe } from '../../api/import-recipe';
import { supabase } from '../lib/supabaseClient';

export type { ImportedRecipe };

/** Asks Meal Planner's server function to read the recipe on a web page. */
export async function importRecipeFromUrl(url: string): Promise<ImportedRecipe> {
  if (!navigator.onLine) throw new Error("You're offline. Importing a link needs an internet connection.");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in again to import recipes.');
  let resp: Response;
  try {
    resp = await fetch(`${import.meta.env.BASE_URL}api/import-recipe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ url }),
    });
  } catch {
    throw new Error("Couldn't reach Meal Planner's server. Check your connection and try again.");
  }
  const body = (await resp.json().catch(() => null)) as { recipe?: ImportedRecipe; message?: string } | null;
  if (resp.ok && body?.recipe) return body.recipe;
  if (resp.status === 404 && !body) throw new Error("Importing links isn't available on this copy of the app.");
  throw new Error(body?.message ?? `Import failed (${resp.status}).`);
}
