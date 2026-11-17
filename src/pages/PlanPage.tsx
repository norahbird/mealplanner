import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import SettingsSheet from '../components/SettingsSheet';
import { Icon, PageHeader, Segmented, Sheet, Stepper, Toggle } from '../components/ui';
import {
  addEntries,
  deleteEntry,
  leftoversLunchFor,
  leftoversOf,
  markCooked,
  newEntry,
  settings,
  updateEntry,
} from '../data/actions';
import { useData } from '../data/store';
import type { Data, Meal, PlanEntry, Recipe, Status } from '../data/types';
import {
  addDaysISO,
  dayLabel,
  daysUntil,
  freshness,
  relativeDay,
  shortDate,
  shortDay,
  todayISO,
  weekStartISO,
} from '../utils/dates';
import { servingsToCook } from '../utils/grocery';
import { cap } from '../utils/names';
import { fitLabel, recipeFit } from '../utils/suggestions';

const MEALS: Meal[] = ['lunch', 'dinner'];
const mealLabel = (m: Meal) => (m === 'lunch' ? 'Lunch' : 'Dinner');

export function entryTitle(e: PlanEntry, data: Data): string {
  if (e.kind === 'recipe') return (e.recipe_id && data.recipes[e.recipe_id]?.title) || e.title || 'Recipe';
  if (e.kind === 'leftovers') {
    const parent = e.leftover_of ? data.entries[e.leftover_of] : undefined;
    return `Leftovers: ${parent ? entryTitle(parent, data) : e.title}`;
  }
  return e.title;
}

export default function PlanPage() {
  const data = useData();
  const { weekStart, people } = settings();
  const [weekOf, setWeekOf] = useState(() => weekStartISO(todayISO(), weekStart));
  const [adding, setAdding] = useState<{ date: string; meal: Meal } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => setWeekOf((w) => weekStartISO(w, weekStart)), [weekStart]);

  const today = todayISO();
  const thisWeek = weekStartISO(today, weekStart);
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(weekOf, i));

  const slots = useMemo(() => {
    const map = new Map<string, PlanEntry[]>();
    for (const e of Object.values(data.entries)) {
      const key = `${e.date}|${e.meal}`;
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    for (const list of map.values()) list.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return map;
  }, [data.entries]);

  const useSoon = Object.values(data.ingredients)
    .filter((i) => (i.status === 'have' || i.status === 'low') && i.use_by && daysUntil(i.use_by) <= 3)
    .sort((a, b) => a.use_by!.localeCompare(b.use_by!));

  return (
    <div className="page plan-page">
      <PageHeader title="Plan">
        <button className="icon-btn" onClick={() => setShowSettings(true)} aria-label="Settings">
          <Icon name="gear" />
        </button>
      </PageHeader>

      <div className="week-nav">
        <button className="icon-btn" onClick={() => setWeekOf(addDaysISO(weekOf, -7))} aria-label="Previous week">
          <Icon name="back" />
        </button>
        <div className="week-nav-label">
          <strong>
            {shortDate(days[0])} – {shortDate(days[6])}
          </strong>
          {weekOf !== thisWeek && (
            <button className="btn-link" onClick={() => setWeekOf(thisWeek)}>
              Back to this week
            </button>
          )}
        </div>
        <button className="icon-btn" onClick={() => setWeekOf(addDaysISO(weekOf, 7))} aria-label="Next week">
          <Icon name="next" />
        </button>
      </div>

      {useSoon.length > 0 && (
        <Link to="/on-hand" className="use-soon-strip">
          <span className="use-soon-title">Use soon</span>
          {useSoon.slice(0, 6).map((i) => (
            <span key={i.id} className={`pill fresh-${freshness(i.use_by)}`}>
              {cap(i.name)} · {relativeDay(i.use_by!)}
            </span>
          ))}
        </Link>
      )}

      <div className="day-grid">
        {days.map((date) => (
          <section key={date} className={`day-card${date === today ? ' is-today' : ''}${date < today ? ' is-past' : ''}`}>
            <h2 className="day-title">
              {dayLabel(date)}
              {date === today && <span className="badge">Today</span>}
            </h2>
            {MEALS.map((meal) => {
              const entries = slots.get(`${date}|${meal}`) ?? [];
              return (
                <div className="meal-row" key={meal}>
                  <span className="meal-label">{mealLabel(meal)}</span>
                  <div className="meal-items">
                    {entries.map((e) => {
                      const total = e.kind === 'recipe' ? servingsToCook(e, data) : e.servings;
                      return (
                        <button
                          key={e.id}
                          className={`meal-chip kind-${e.kind}${e.done ? ' is-done' : ''}`}
                          onClick={() => setEditing(e.id)}
                        >
                          {e.kind === 'leftovers' && <Icon name="leftovers" size={16} />}
                          <span className="meal-chip-title">{entryTitle(e, data)}</span>
                          {e.kind !== 'note' && total !== people && <span className="meal-chip-meta">×{total}</span>}
                          {e.done && <Icon name="check" size={16} />}
                        </button>
                      );
                    })}
                    <button
                      className={`add-chip${entries.length ? ' add-chip--compact' : ''}`}
                      onClick={() => setAdding({ date, meal })}
                      aria-label={`Add ${meal} on ${dayLabel(date)}`}
                    >
                      <Icon name="plus" size={18} />
                      {entries.length === 0 && <span>Add</span>}
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </div>

      {adding && <AddMealSheet date={adding.date} meal={adding.meal} onClose={() => setAdding(null)} />}
      {editing && <EntrySheet entryId={editing} onClose={() => setEditing(null)} />}
      {showSettings && <SettingsSheet onClose={() => setShowSettings(false)} />}
    </div>
  );
}

// ---- Adding a meal ------------------------------------------------------------------------

type AddTab = 'recipe' | 'leftovers' | 'other';

function leftoverCandidates(data: Data, date: string): PlanEntry[] {
  const earliest = addDaysISO(date, -4);
  return Object.values(data.entries)
    .filter((e) => e.kind === 'recipe' && e.date < date && e.date >= earliest)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function AddMealSheet({
  date,
  meal,
  onClose,
  presetRecipe,
}: {
  date: string;
  meal: Meal;
  onClose: () => void;
  presetRecipe?: Recipe;
}) {
  const data = useData();
  const { people } = settings();
  const candidates = leftoverCandidates(data, date);
  const [tab, setTab] = useState<AddTab>(meal === 'lunch' && candidates.length > 0 && !presetRecipe ? 'leftovers' : 'recipe');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Recipe | null>(presetRecipe ?? null);
  const [servings, setServings] = useState(people);
  const [extraLunch, setExtraLunch] = useState(false);
  const [note, setNote] = useState('');

  const recipes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.values(data.recipes)
      .filter((r) => !q || r.title.toLowerCase().includes(q) || r.tags.some((t) => t.toLowerCase().includes(q)))
      .map((r) => ({ recipe: r, fit: recipeFit(r, data) }))
      .sort((a, b) => b.fit.score - a.fit.score || a.recipe.title.localeCompare(b.recipe.title));
  }, [data, query]);

  function addRecipe() {
    if (!selected) return;
    const dinner = newEntry({ date, meal, kind: 'recipe', recipe_id: selected.id, title: selected.title, servings });
    addEntries(extraLunch ? [dinner, leftoversLunchFor(dinner)] : [dinner]);
    onClose();
  }

  function addLeftovers(from: PlanEntry) {
    addEntries([newEntry({ date, meal, kind: 'leftovers', leftover_of: from.id, title: entryTitle(from, data), servings: people })]);
    onClose();
  }

  function addNote(text: string) {
    if (!text.trim()) return;
    addEntries([newEntry({ date, meal, kind: 'note', title: text.trim() })]);
    onClose();
  }

  const footer =
    tab === 'recipe' && selected ? (
      <div className="add-footer">
        <div className="add-footer-title">{selected.title}</div>
        <div className="field-row">
          <span>
            <span className="field-label">Servings</span>
            <span className="field-hint"> · recipe makes {selected.servings}</span>
          </span>
          <Stepper value={servings} onChange={setServings} label="servings" />
        </div>
        {meal === 'dinner' && (
          <Toggle
            checked={extraLunch}
            onChange={setExtraLunch}
            label="Make extra for lunch tomorrow"
            hint="Adds a leftovers lunch and buys enough for it"
          />
        )}
        <button className="btn btn-block" onClick={addRecipe}>
          Add to {shortDay(date)} {meal}
        </button>
      </div>
    ) : undefined;

  return (
    <Sheet title={`${mealLabel(meal)} · ${dayLabel(date)}`} onClose={onClose} footer={footer}>
      <Segmented
        label="What to add"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'recipe', label: 'Recipe' },
          { value: 'leftovers', label: 'Leftovers' },
          { value: 'other', label: 'Other' },
        ]}
      />

      {tab === 'recipe' && (
        <>
          <input
            type="search"
            className="search-input"
            placeholder="Search recipes or tags"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {Object.keys(data.recipes).length === 0 ? (
            <p className="empty">
              No recipes yet. <Link to="/recipes/new">Add your first recipe</Link>
            </p>
          ) : (
            <>
              <p className="list-caption">Sorted by what uses up your ingredients</p>
              <ul className="pick-list">
                {recipes.map(({ recipe, fit }) => (
                  <li key={recipe.id}>
                    <button
                      className={`pick-item${selected?.id === recipe.id ? ' is-selected' : ''}`}
                      onClick={() => {
                        setSelected(recipe);
                      }}
                    >
                      <span className="pick-title">{recipe.title}</span>
                      {fitLabel(fit) && (
                        <span className={`pick-meta${fit.useSoon.length ? ' has-use-soon' : ''}`}>{fitLabel(fit)}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {tab === 'leftovers' &&
        (candidates.length === 0 ? (
          <p className="empty">No meals planned in the few days before this one to have leftovers from.</p>
        ) : (
          <ul className="pick-list">
            {candidates.map((e) => (
              <li key={e.id}>
                <button className="pick-item" onClick={() => addLeftovers(e)}>
                  <span className="pick-title">{entryTitle(e, data)}</span>
                  <span className="pick-meta">
                    From {relativeDay(e.date)} {e.meal}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ))}

      {tab === 'other' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addNote(note);
          }}
        >
          <div className="chip-row">
            {['Eating out', 'Takeout', 'Something quick', 'Skip'].map((t) => (
              <button key={t} type="button" className="chip" onClick={() => addNote(t)}>
                {t}
              </button>
            ))}
          </div>
          <div className="field">
            <label htmlFor="note-text">Or write your own</label>
            <input id="note-text" type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Dinner at Sam's" />
          </div>
          <button className="btn btn-block" type="submit" disabled={!note.trim()}>
            Add
          </button>
        </form>
      )}
    </Sheet>
  );
}

// ---- Editing a planned meal ---------------------------------------------------------------

function EntrySheet({ entryId, onClose }: { entryId: string; onClose: () => void }) {
  const data = useData();
  const navigate = useNavigate();
  const [cooking, setCooking] = useState(false);
  const entry = data.entries[entryId];

  useEffect(() => {
    if (!entry) onClose();
  }, [entry, onClose]);
  if (!entry) return null;

  const recipe = entry.recipe_id ? data.recipes[entry.recipe_id] : undefined;
  if (cooking && recipe) return <CookedSheet entry={entry} recipe={recipe} onClose={onClose} />;

  const children = leftoversOf(entry.id);
  const parent = entry.leftover_of ? data.entries[entry.leftover_of] : undefined;
  const nextFree = [1, 2, 3]
    .map((d) => addDaysISO(entry.date, d))
    .find((d) => !children.some((c) => c.date === d && c.meal === 'lunch'));

  function remove() {
    if (children.length && !confirm(`This also removes ${children.length === 1 ? 'its leftovers meal' : `its ${children.length} leftovers meals`}.`)) return;
    deleteEntry(entry.id);
    onClose();
  }

  return (
    <Sheet title={entryTitle(entry, data)} onClose={onClose}>
      <p className="sheet-subtitle">
        {dayLabel(entry.date)} · {mealLabel(entry.meal)}
        {parent && ` · from ${relativeDay(parent.date)} ${parent.meal}`}
      </p>

      {recipe && (
        <button className="btn-secondary btn-block" onClick={() => navigate(`/recipes/${recipe.id}`)}>
          View recipe
        </button>
      )}
      {entry.kind === 'recipe' && !recipe && <p className="muted">This recipe was deleted.</p>}

      {entry.kind !== 'note' && (
        <div className="field-row">
          <span className="field-label">{entry.kind === 'leftovers' ? 'Servings' : 'Servings (not counting leftovers)'}</span>
          <Stepper value={entry.servings} onChange={(servings) => updateEntry(entry.id, { servings })} label="servings" />
        </div>
      )}

      {entry.kind === 'recipe' && (
        <div className="sheet-section">
          <h3>Leftovers</h3>
          {children.length === 0 && <p className="muted">None planned.</p>}
          <ul className="simple-list">
            {children.map((c) => (
              <li key={c.id}>
                <span>
                  {dayLabel(c.date)} {c.meal} · {c.servings} {c.servings === 1 ? 'serving' : 'servings'}
                </span>
                <button className="btn-link danger" onClick={() => deleteEntry(c.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
          {nextFree && (
            <button className="btn-secondary" onClick={() => addEntries([leftoversLunchFor(entry, 'lunch', nextFree)])}>
              + Leftovers for {shortDay(nextFree)} lunch
            </button>
          )}
        </div>
      )}

      <div className="sheet-section">
        <h3>Move</h3>
        <div className="move-row">
          <input
            type="date"
            value={entry.date}
            onChange={(e) => e.target.value && updateEntry(entry.id, { date: e.target.value })}
            aria-label="Date"
          />
          <Segmented
            label="Meal"
            value={entry.meal}
            onChange={(meal) => updateEntry(entry.id, { meal })}
            options={[
              { value: 'lunch', label: 'Lunch' },
              { value: 'dinner', label: 'Dinner' },
            ]}
          />
        </div>
      </div>

      <div className="sheet-actions">
        {entry.done ? (
          <button className="btn-secondary" onClick={() => updateEntry(entry.id, { done: false })}>
            {entry.kind === 'recipe' ? 'Cooked ✓ · Undo' : 'Eaten ✓ · Undo'}
          </button>
        ) : entry.kind === 'recipe' && recipe ? (
          <button className="btn" onClick={() => setCooking(true)}>
            Mark cooked
          </button>
        ) : (
          <button
            className="btn"
            onClick={() => {
              updateEntry(entry.id, { done: true });
              onClose();
            }}
          >
            Mark {entry.kind === 'recipe' ? 'cooked' : 'eaten'}
          </button>
        )}
        <button className="btn-link danger" onClick={remove}>
          Remove from plan
        </button>
      </div>
    </Sheet>
  );
}

const LEFT_OPTIONS: { value: Status; label: string; tone: string }[] = [
  { value: 'have', label: 'Some left', tone: 'have' },
  { value: 'low', label: 'Low', tone: 'low' },
  { value: 'out', label: 'Used up', tone: 'out' },
];

function CookedSheet({ entry, recipe, onClose }: { entry: PlanEntry; recipe: Recipe; onClose: () => void }) {
  const data = useData();
  const ingredients = useMemo(() => {
    const seen = new Set<string>();
    return recipe.ingredients
      .map((l) => (l.ingredient_id ? data.ingredients[l.ingredient_id] : undefined))
      .filter((i): i is NonNullable<typeof i> => Boolean(i && !i.staple && !seen.has(i.id) && seen.add(i.id)));
  }, [recipe, data.ingredients]);
  const [choices, setChoices] = useState<Record<string, Status | null>>(() =>
    Object.fromEntries(ingredients.map((i) => [i.id, i.status])),
  );

  function save() {
    markCooked(entry.id, choices);
    onClose();
  }

  return (
    <Sheet
      title={`Cooked ${recipe.title}`}
      onClose={onClose}
      footer={
        <button className="btn btn-block" onClick={save}>
          Save
        </button>
      }
    >
      <p className="sheet-subtitle">What's left of each ingredient? This keeps On hand up to date.</p>
      {ingredients.length === 0 && <p className="muted">Nothing to update.</p>}
      <ul className="cooked-list">
        {ingredients.map((i) => (
          <li key={i.id}>
            <span className="cooked-name">{cap(i.name)}</span>
            <Segmented
              small
              label={`What's left of ${i.name}`}
              value={choices[i.id] ?? null}
              onChange={(v) => setChoices((c) => ({ ...c, [i.id]: v }))}
              options={LEFT_OPTIONS}
            />
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
