import { useEffect, useMemo, useState } from 'react';
import { Icon, IngredientInput, PageHeader, Segmented, Sheet, Toggle } from '../components/ui';
import {
  addIngredient,
  defaultLocation,
  deleteIngredient,
  estimateUseBy,
  newIngredient,
  recipesUsing,
  setStatus,
  updateIngredient,
} from '../data/actions';
import { useData } from '../data/store';
import { LOCATIONS, SECTIONS, type Ingredient, type Status, type StorageLocation } from '../data/types';
import { addDaysISO, daysUntil, freshness, relativeDay, todayISO, useByLabel } from '../utils/dates';
import { cap, normalizeName } from '../utils/names';
import { findExact } from '../utils/parseIngredients';

const STATUS_OPTIONS: { value: Status; label: string; tone: string }[] = [
  { value: 'have', label: 'Have', tone: 'have' },
  { value: 'low', label: 'Low', tone: 'low' },
  { value: 'out', label: 'Out', tone: 'out' },
];

type Filter = 'all' | StorageLocation;

function loadFilter(): Filter {
  try {
    return (sessionStorage.getItem('onhand-filter') as Filter) || 'all';
  } catch {
    return 'all';
  }
}

export default function OnHandPage() {
  const data = useData();
  const ingredients = useMemo(() => Object.values(data.ingredients), [data.ingredients]);
  const [text, setText] = useState('');
  const [filter, setFilter] = useState<Filter>(loadFilter);
  const [showOut, setShowOut] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem('onhand-filter', filter);
    } catch {
      // ignore
    }
  }, [filter]);

  const tracked = ingredients.filter((i) => i.status !== null && !i.staple);
  const staples = ingredients.filter((i) => i.staple).sort((a, b) => a.name.localeCompare(b.name));
  const useSoon = tracked
    .filter((i) => i.status !== 'out' && i.use_by && daysUntil(i.use_by) <= 3)
    .sort((a, b) => a.use_by!.localeCompare(b.use_by!));
  const outCount = tracked.filter((i) => i.status === 'out').length;

  const visible = tracked
    .filter((i) => (filter === 'all' || i.location === filter) && (showOut || i.status !== 'out'))
    .sort((a, b) => {
      // Soonest use-by first, then by name; items with no date after dated ones.
      if (a.use_by && b.use_by && a.use_by !== b.use_by) return a.use_by.localeCompare(b.use_by);
      if (a.use_by && !b.use_by) return -1;
      if (!a.use_by && b.use_by) return 1;
      return a.name.localeCompare(b.name);
    });
  const groups = LOCATIONS.filter((l) => filter === 'all' || l.value === filter).map((l) => ({
    ...l,
    items: visible.filter((i) => i.location === l.value),
  }));

  function addPicked(ing: Ingredient) {
    if (ing.staple) setEditing(ing.id);
    else if (ing.status !== 'have') setStatus(ing.id, 'have');
    setText('');
  }

  function addTyped(name: string) {
    const existing = findExact(name, ingredients);
    if (existing) addPicked(existing);
    else setCreating(normalizeName(name));
    setText('');
  }

  return (
    <div className="page">
      <PageHeader title="On hand" />

      <div className="add-bar">
        <IngredientInput
          value={text}
          onChange={setText}
          onPick={addPicked}
          onSubmit={addTyped}
          ingredients={ingredients}
          placeholder="Add something you have"
        />
        <button className="btn" onClick={() => text.trim() && addTyped(text)} disabled={!text.trim()} aria-label="Add">
          <Icon name="plus" />
        </button>
      </div>

      {useSoon.length > 0 && (
        <section className="use-soon-card">
          <h2 className="section-title">Use soon</h2>
          <ul className="chip-row">
            {useSoon.map((i) => (
              <li key={i.id}>
                <button className={`pill pill--button fresh-${freshness(i.use_by)}`} onClick={() => setEditing(i.id)}>
                  {cap(i.name)} · {relativeDay(i.use_by!)}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="filter-row">
        <Segmented
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[{ value: 'all', label: 'All' }, ...LOCATIONS.map((l) => ({ value: l.value as Filter, label: l.label }))]}
        />
      </div>

      {tracked.length === 0 && (
        <div className="empty-card">
          <p>
            <strong>Nothing tracked yet.</strong>
          </p>
          <p className="muted">
            Add what's in your fridge, freezer and cupboards above. Things you check off on the grocery list land here
            automatically.
          </p>
        </div>
      )}

      {groups.map(
        (g) =>
          g.items.length > 0 && (
            <section key={g.value} className="list-section">
              <h2 className="section-title">{g.label}</h2>
              <ul className="onhand-list">
                {g.items.map((i) => (
                  <li key={i.id} className={`onhand-row status-${i.status}`}>
                    <button className="onhand-main" onClick={() => setEditing(i.id)}>
                      <span className="onhand-name">{cap(i.name)}</span>
                      {i.use_by && i.status !== 'out' && (
                        <span className={`pill fresh-${freshness(i.use_by)}`}>{useByLabel(i.use_by)}</span>
                      )}
                    </button>
                    <Segmented
                      small
                      label={`${i.name} status`}
                      value={i.status}
                      onChange={(s) => setStatus(i.id, s)}
                      options={STATUS_OPTIONS}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ),
      )}

      {outCount > 0 && (
        <button className="btn-link show-out" onClick={() => setShowOut((s) => !s)}>
          {showOut ? 'Hide' : 'Show'} {outCount} {outCount === 1 ? 'item' : 'items'} you're out of
        </button>
      )}

      {staples.length > 0 && (
        <section className="list-section">
          <h2 className="section-title">Always have</h2>
          <p className="muted small">Staples never go on the grocery list. Tap one to change it.</p>
          <div className="chip-row">
            {staples.map((i) => (
              <button key={i.id} className="chip" onClick={() => setEditing(i.id)}>
                {cap(i.name)}
              </button>
            ))}
          </div>
        </section>
      )}

      {editing && data.ingredients[editing] && (
        <IngredientSheet ingredient={data.ingredients[editing]} onClose={() => setEditing(null)} />
      )}
      {creating !== null && <IngredientSheet newName={creating} onClose={() => setCreating(null)} />}
    </div>
  );
}

/** Edits an ingredient, or creates one (marked "have") when given a new name. */
export function IngredientSheet({
  ingredient,
  newName,
  onClose,
}: {
  ingredient?: Ingredient;
  newName?: string;
  onClose: () => void;
}) {
  const data = useData();
  const isNew = !ingredient;
  const [draft, setDraft] = useState<Ingredient>(
    () => ingredient ?? newIngredient(newName ?? '', { section: 'Produce', location: 'fridge', status: 'have' }),
  );
  const [shelfText, setShelfText] = useState(draft.shelf_life_days?.toString() ?? '');
  const [error, setError] = useState<string | null>(null);

  // Keep showing live changes made elsewhere (e.g. status taps) for an existing item.
  const current = ingredient ? data.ingredients[ingredient.id] ?? draft : draft;
  const usedBy = ingredient ? recipesUsing(ingredient.id) : [];

  function patch(p: Partial<Ingredient>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  function save() {
    const name = normalizeName(draft.name);
    if (!name) return setError('Give it a name.');
    const clash = Object.values(data.ingredients).find((i) => i.id !== draft.id && normalizeName(i.name) === name);
    if (clash) return setError(`There's already an ingredient called "${clash.name}".`);
    const days = shelfText.trim() ? Math.max(1, Math.round(Number(shelfText))) : null;
    const saved: Ingredient = { ...draft, name, shelf_life_days: Number.isFinite(days) ? days : null };
    if (isNew) {
      addIngredient({ ...saved, use_by: saved.use_by ?? estimateUseBy(saved) });
    } else {
      const { id, household_id: _h, updated_at: _u, ...rest } = saved;
      updateIngredient(id, rest);
    }
    onClose();
  }

  function remove() {
    if (!ingredient) return;
    if (usedBy.length) {
      setError(`Used in ${usedBy.map((r) => r.title).join(', ')}. Remove it from ${usedBy.length === 1 ? 'that recipe' : 'those recipes'} first.`);
      return;
    }
    if (!confirm(`Delete ${ingredient.name}?`)) return;
    deleteIngredient(ingredient.id);
    onClose();
  }

  function stopTracking() {
    if (!ingredient) return;
    setStatus(ingredient.id, null);
    onClose();
  }

  const today = todayISO();

  return (
    <Sheet
      title={isNew ? 'New item' : cap(current.name)}
      onClose={onClose}
      footer={
        <button className="btn btn-block" onClick={save}>
          {isNew ? 'Add to On hand' : 'Save'}
        </button>
      }
    >
      <div className="field">
        <label htmlFor="ing-name">Name</label>
        <input id="ing-name" type="text" value={draft.name} onChange={(e) => patch({ name: e.target.value })} autoCapitalize="none" />
      </div>

      {!draft.staple && (
        <>
          <div className="field">
            <div className="field-label">Status</div>
            <Segmented label="Status" value={draft.status} onChange={(status) => patch({ status })} options={STATUS_OPTIONS} />
          </div>
          <div className="field">
            <label htmlFor="ing-useby">Use by</label>
            <div className="useby-row">
              <input
                id="ing-useby"
                type="date"
                value={draft.use_by ?? ''}
                min={addDaysISO(today, -30)}
                onChange={(e) => patch({ use_by: e.target.value || null })}
              />
              {[3, 7].map((d) => (
                <button key={d} type="button" className="chip" onClick={() => patch({ use_by: addDaysISO(today, d) })}>
                  +{d} days
                </button>
              ))}
              {draft.use_by && (
                <button type="button" className="btn-link" onClick={() => patch({ use_by: null })}>
                  Clear
                </button>
              )}
            </div>
          </div>
        </>
      )}

      <div className="field-grid">
        <div className="field">
          <label htmlFor="ing-location">Kept in</label>
          <select id="ing-location" value={draft.location} onChange={(e) => patch({ location: e.target.value as StorageLocation })}>
            {LOCATIONS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ing-section">Store section</label>
          <select
            id="ing-section"
            value={draft.section}
            onChange={(e) => patch({ section: e.target.value, ...(isNew ? { location: defaultLocation(e.target.value) } : {}) })}
          >
            {SECTIONS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="ing-shelf">Usually keeps for (days)</label>
        <input
          id="ing-shelf"
          type="number"
          inputMode="numeric"
          min={1}
          value={shelfText}
          onChange={(e) => setShelfText(e.target.value)}
          placeholder="Leave blank for long-life items"
        />
        <span className="field-hint">Used to guess the use-by date when you buy it.</span>
      </div>

      <Toggle
        checked={draft.staple}
        onChange={(staple) => patch({ staple })}
        label="Always have"
        hint="For basics like salt and oil: never added to the grocery list"
      />

      {error && <p className="form-error">{error}</p>}

      {!isNew && (
        <div className="sheet-actions">
          {current.status !== null && !current.staple && (
            <button className="btn-link" onClick={stopTracking}>
              Remove from On hand
            </button>
          )}
          <button className="btn-link danger" onClick={remove}>
            Delete ingredient
          </button>
        </div>
      )}
    </Sheet>
  );
}
