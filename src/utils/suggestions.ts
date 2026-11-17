import type { Data, Recipe } from '../data/types';
import { daysUntil } from './dates';

export interface RecipeFit {
  /** Higher = better use of what you have, especially things to use soon. */
  score: number;
  haveCount: number;
  /** Ingredients that count (staples aren't). */
  total: number;
  /** Names of ingredients it uses that should be used within 3 days. */
  useSoon: string[];
}

export function recipeFit(recipe: Recipe, data: Data): RecipeFit {
  const seen = new Set<string>();
  const fit: RecipeFit = { score: 0, haveCount: 0, total: 0, useSoon: [] };
  for (const line of recipe.ingredients) {
    const ing = line.ingredient_id ? data.ingredients[line.ingredient_id] : undefined;
    if (ing && seen.has(ing.id)) continue;
    if (ing) seen.add(ing.id);
    if (ing?.staple) continue;
    fit.total++;
    if (ing && (ing.status === 'have' || ing.status === 'low')) {
      fit.haveCount++;
      fit.score += 1;
      if (ing.use_by && daysUntil(ing.use_by) <= 3) {
        fit.score += 2;
        fit.useSoon.push(ing.name);
      }
    }
  }
  return fit;
}

export function fitLabel(fit: RecipeFit): string {
  if (fit.total === 0) return '';
  const parts = [`Have ${fit.haveCount} of ${fit.total}`];
  if (fit.useSoon.length) parts.push(`uses up ${fit.useSoon.slice(0, 2).join(', ')}`);
  return parts.join(' · ');
}
