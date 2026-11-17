import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon, Segmented, Sheet, Stepper } from '../components/ui';
import { updateRecipe } from '../data/actions';
import { useData } from '../data/store';
import type { Meal, RecipeLine } from '../data/types';
import { addDaysISO, todayISO } from '../utils/dates';
import { cap, pluralize } from '../utils/names';
import { formatAmount } from '../utils/units';
import { AddMealSheet } from './PlanPage';

export function lineText(line: RecipeLine, name: string, scale = 1): string {
  const qty = line.qty === null ? null : line.qty * scale;
  const amount = formatAmount(qty, line.unit);
  const shownName = !line.unit && qty !== null && qty > 1 ? pluralize(name) : name;
  return [amount, shownName].filter(Boolean).join(' ') + (line.note ? `, ${line.note}` : '');
}

export default function RecipeViewPage() {
  const { id } = useParams();
  const data = useData();
  const navigate = useNavigate();
  const recipe = id ? data.recipes[id] : undefined;
  const [servings, setServings] = useState<number | null>(null);
  const [planning, setPlanning] = useState(false);

  if (!recipe) {
    return (
      <div className="page">
        <p className="page-status">
          This recipe doesn't exist (it may have been deleted). <Link to="/recipes">All recipes</Link>
        </p>
      </div>
    );
  }

  const shownServings = servings ?? recipe.servings;
  const scale = shownServings / Math.max(1, recipe.servings);
  const steps = recipe.steps
    .split('\n')
    .map((s) => s.replace(/^\s*(\d+[.)]|step \d+:?)\s*/i, '').trim())
    .filter(Boolean);

  return (
    <div className="page recipe-page">
      <div className="back-row">
        <button className="btn-link back-link" onClick={() => navigate(-1)}>
          <Icon name="back" size={18} /> Back
        </button>
        <Link to={`/recipes/${recipe.id}/edit`} className="btn-secondary">
          Edit
        </Link>
      </div>

      <h1 className="recipe-title">{recipe.title}</h1>
      <div className="recipe-meta">
        <div className="rating" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              role="radio"
              aria-checked={recipe.rating === n}
              aria-label={`${n} star${n > 1 ? 's' : ''}`}
              className={`star${(recipe.rating ?? 0) >= n ? ' is-on' : ''}`}
              onClick={() => updateRecipe(recipe.id, { rating: recipe.rating === n ? null : n })}
            >
              ★
            </button>
          ))}
        </div>
        {recipe.tags.length > 0 && <span className="muted">{recipe.tags.join(', ')}</span>}
        {recipe.source_url && (
          <a href={recipe.source_url} target="_blank" rel="noreferrer" className="source-link">
            <Icon name="link" size={16} /> Source
          </a>
        )}
      </div>

      <button className="btn btn-block" onClick={() => setPlanning(true)}>
        Add to plan
      </button>

      <section className="recipe-section">
        <div className="section-title-row">
          <h2>Ingredients</h2>
          <div className="servings-control">
            <span className="muted">Serves</span>
            <Stepper value={shownServings} onChange={setServings} label="servings" max={40} />
          </div>
        </div>
        <ul className="ingredient-list">
          {recipe.ingredients.map((line) => {
            const ing = line.ingredient_id ? data.ingredients[line.ingredient_id] : undefined;
            const status = ing?.staple ? 'staple' : ing?.status ?? null;
            return (
              <li key={line.id}>
                <span className={`have-dot status-${status ?? 'none'}`} title={status ? cap(status) : 'Not on hand'} />
                <span>{lineText(line, ing?.name ?? line.name, scale)}</span>
              </li>
            );
          })}
        </ul>
        <p className="legend muted small">
          <span className="have-dot status-have" /> have <span className="have-dot status-low" /> low{' '}
          <span className="have-dot status-none" /> need
        </p>
      </section>

      {steps.length > 0 && (
        <section className="recipe-section">
          <h2>Steps</h2>
          <ol className="step-list">
            {steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </section>
      )}

      {recipe.notes.trim() && (
        <section className="recipe-section">
          <h2>Notes</h2>
          <p className="notes">{recipe.notes}</p>
        </section>
      )}

      {planning && <PlanRecipeSheet recipeId={recipe.id} onClose={() => setPlanning(false)} />}
    </div>
  );
}

/** Picks a day and meal, then hands over to the regular add-meal sheet with the recipe chosen. */
function PlanRecipeSheet({ recipeId, onClose }: { recipeId: string; onClose: () => void }) {
  const data = useData();
  const recipe = data.recipes[recipeId];
  const today = todayISO();
  const firstFreeDinner =
    Array.from({ length: 14 }, (_, i) => addDaysISO(today, i)).find(
      (d) => !Object.values(data.entries).some((e) => e.date === d && e.meal === 'dinner'),
    ) ?? today;
  const [date, setDate] = useState(firstFreeDinner);
  const [meal, setMeal] = useState<Meal>('dinner');
  const [chosen, setChosen] = useState(false);

  if (chosen) return <AddMealSheet date={date} meal={meal} presetRecipe={recipe} onClose={onClose} />;

  return (
    <Sheet
      title={`Plan ${recipe.title}`}
      onClose={onClose}
      footer={
        <button className="btn btn-block" onClick={() => setChosen(true)}>
          Next
        </button>
      }
    >
      <div className="field">
        <label htmlFor="plan-date">Day</label>
        <input id="plan-date" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </div>
      <div className="field">
        <div className="field-label">Meal</div>
        <Segmented
          label="Meal"
          value={meal}
          onChange={setMeal}
          options={[
            { value: 'lunch', label: 'Lunch' },
            { value: 'dinner', label: 'Dinner' },
          ]}
        />
      </div>
    </Sheet>
  );
}
