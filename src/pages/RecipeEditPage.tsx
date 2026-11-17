import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Icon, IngredientInput, Stepper } from '../components/ui';
import { blankRecipe, defaultLocation, deleteRecipe, newIngredient, saveRecipe } from '../data/actions';
import { newId, useData } from '../data/store';
import { SECTIONS, type Ingredient, type Recipe, type RecipeLine } from '../data/types';
import { cap, matchKey, normalizeName } from '../utils/names';
import { cleanNewName, findExact, guessSection, joinNote, matchIngredient, parseLine } from '../utils/parseIngredients';
import { formatQty, isKnownUnit, normalizeUnit, parseQty, UNIT_SUGGESTIONS } from '../utils/units';

interface DraftLine {
  id: string;
  qtyText: string;
  unit: string;
  name: string;
  note: string;
  ingredientId: string | null;
  /** Store section for an ingredient that will be created on save. */
  newSection: string;
}

function toDraft(line: RecipeLine, ingredients: Record<string, Ingredient>): DraftLine {
  const ing = line.ingredient_id ? ingredients[line.ingredient_id] : undefined;
  return {
    id: line.id,
    qtyText: line.qty === null ? '' : formatQty(line.qty, line.unit),
    unit: line.unit,
    name: ing?.name ?? line.name,
    note: line.note,
    ingredientId: ing?.id ?? null,
    newSection: ing?.section ?? guessSection(line.name),
  };
}

function emptyLine(): DraftLine {
  return { id: newId(), qtyText: '', unit: '', name: '', note: '', ingredientId: null, newSection: 'Other' };
}

export default function RecipeEditPage() {
  const { id } = useParams();
  const data = useData();
  const navigate = useNavigate();
  const existing = id ? data.recipes[id] : undefined;
  const ingredients = useMemo(() => Object.values(data.ingredients), [data.ingredients]);

  const [original] = useState<Recipe>(() => existing ?? blankRecipe());
  const [title, setTitle] = useState(original.title);
  const [servings, setServings] = useState(original.servings);
  const [tagsText, setTagsText] = useState(original.tags.join(', '));
  const [sourceUrl, setSourceUrl] = useState(original.source_url ?? '');
  const [steps, setSteps] = useState(original.steps);
  const [notes, setNotes] = useState(original.notes);
  const [lines, setLines] = useState<DraftLine[]>(() =>
    original.ingredients.length ? original.ingredients.map((l) => toDraft(l, data.ingredients)) : [],
  );
  const [pasteOpen, setPasteOpen] = useState(!existing);
  const [pasteText, setPasteText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  if (id && !existing) {
    return (
      <div className="page">
        <p className="page-status">This recipe doesn't exist (it may have been deleted).</p>
      </div>
    );
  }

  function touch<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setDirty(true);
    };
  }

  function updateLine(lineId: string, patch: Partial<DraftLine>) {
    setLines((ls) => ls.map((l) => (l.id === lineId ? { ...l, ...patch } : l)));
    setDirty(true);
  }

  function setLineName(lineId: string, name: string) {
    const match = findExact(name, ingredients);
    updateLine(lineId, { name, ingredientId: match?.id ?? null, ...(match ? {} : { newSection: guessSection(name) }) });
  }

  function addPasted() {
    const parsed: DraftLine[] = [];
    for (const raw of pasteText.split('\n')) {
      const p = parseLine(raw);
      if (!p || !p.name) continue;
      // Skip headings like "For the sauce:".
      if (p.qty === null && !p.unit && /:\s*$/.test(raw.trim())) continue;
      const unit = p.unit;
      const match = matchIngredient(p.name, ingredients);
      if (match) {
        parsed.push({
          id: newId(),
          qtyText: p.qty === null ? '' : formatQty(p.qty, unit),
          unit,
          name: match.ingredient.name,
          note: joinNote(match.rest, p.note),
          ingredientId: match.ingredient.id,
          newSection: match.ingredient.section,
        });
      } else {
        const clean = cleanNewName(p.name);
        parsed.push({
          id: newId(),
          qtyText: p.qty === null ? '' : formatQty(p.qty, unit),
          unit,
          name: clean.name,
          note: joinNote(clean.extraNote, p.note),
          ingredientId: null,
          newSection: guessSection(clean.name),
        });
      }
    }
    if (parsed.length === 0) return;
    setLines((ls) => [...ls.filter((l) => l.name.trim() || l.qtyText.trim()), ...parsed]);
    setPasteText('');
    setPasteOpen(false);
    setDirty(true);
  }

  function save() {
    setError(null);
    if (!title.trim()) return setError('Give the recipe a name.');
    const created = new Map<string, Ingredient>();
    const saved: RecipeLine[] = [];
    for (const l of lines) {
      const name = normalizeName(l.name);
      if (!name) continue;
      const qty = l.qtyText.trim() ? parseQty(l.qtyText) : null;
      if (l.qtyText.trim() && qty === null) return setError(`Couldn't read the amount "${l.qtyText}" for ${name}. Try something like 1 ½ or 0.5.`);
      let ing = l.ingredientId ? data.ingredients[l.ingredientId] : findExact(name, ingredients);
      if (!ing) {
        const key = matchKey(name);
        ing = created.get(key);
        if (!ing) {
          ing = newIngredient(name, { section: l.newSection, location: defaultLocation(l.newSection) });
          created.set(key, ing);
        }
      }
      const unit = l.unit.trim() && isKnownUnit(l.unit) ? normalizeUnit(l.unit) : l.unit.trim().toLowerCase();
      saved.push({ id: l.id, ingredient_id: ing.id, name: ing.name, qty, unit, note: l.note.trim() });
    }
    const url = sourceUrl.trim();
    const recipe: Recipe = {
      ...original,
      title: title.trim(),
      servings,
      ingredients: saved,
      steps: steps.trim(),
      notes: notes.trim(),
      tags: [...new Set(tagsText.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))],
      source_url: url ? (/^https?:\/\//i.test(url) ? url : `https://${url}`) : null,
    };
    saveRecipe(recipe, [...created.values()]);
    navigate(`/recipes/${recipe.id}`, { replace: true });
  }

  function cancel() {
    if (dirty && !confirm('Discard your changes?')) return;
    navigate(-1);
  }

  function remove() {
    if (!existing) return;
    const planned = Object.values(data.entries).filter((e) => e.recipe_id === existing.id && !e.done).length;
    const warn = planned ? ` It's planned for ${planned} upcoming ${planned === 1 ? 'meal' : 'meals'}, which will stay on the plan without a recipe.` : '';
    if (!confirm(`Delete ${existing.title}?${warn}`)) return;
    deleteRecipe(existing.id);
    navigate('/recipes', { replace: true });
  }

  return (
    <div className="page recipe-edit">
      <div className="back-row">
        <button className="btn-link" onClick={cancel}>
          Cancel
        </button>
        <strong>{existing ? 'Edit recipe' : 'New recipe'}</strong>
        <button className="btn" onClick={save}>
          Save
        </button>
      </div>

      <div className="field">
        <label htmlFor="r-title">Name</label>
        <input id="r-title" type="text" value={title} onChange={(e) => touch(setTitle)(e.target.value)} placeholder="e.g. Weeknight chili" />
      </div>

      <div className="field-row">
        <span className="field-label">Serves</span>
        <Stepper value={servings} onChange={touch(setServings)} label="servings" max={40} />
      </div>

      <section className="edit-section">
        <div className="section-title-row">
          <h2>Ingredients</h2>
          {!pasteOpen && (
            <button className="btn-link" onClick={() => setPasteOpen(true)}>
              Paste a list
            </button>
          )}
        </div>

        {pasteOpen && (
          <div className="paste-box">
            <label htmlFor="r-paste">Paste or type ingredients, one per line</label>
            <textarea
              id="r-paste"
              rows={6}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={'2 cups chopped onion\n1 lb ground beef\n1 (15 oz) can black beans, drained\nsalt to taste'}
            />
            <div className="paste-actions">
              <button className="btn" onClick={addPasted} disabled={!pasteText.trim()}>
                Add these
              </button>
              {lines.length > 0 && (
                <button className="btn-link" onClick={() => setPasteOpen(false)}>
                  Close
                </button>
              )}
            </div>
          </div>
        )}

        <datalist id="unit-options">
          {UNIT_SUGGESTIONS.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>

        <ul className="line-editor">
          {lines.map((l) => {
            const known = l.ingredientId ? data.ingredients[l.ingredientId] : undefined;
            return (
              <li key={l.id} className="line-row">
                <input
                  className="line-qty"
                  type="text"
                  inputMode="decimal"
                  value={l.qtyText}
                  onChange={(e) => updateLine(l.id, { qtyText: e.target.value })}
                  placeholder="Qty"
                  aria-label="Amount"
                />
                <input
                  className="line-unit"
                  type="text"
                  list="unit-options"
                  value={l.unit}
                  onChange={(e) => updateLine(l.id, { unit: e.target.value })}
                  placeholder="Unit"
                  aria-label="Unit"
                  autoCapitalize="none"
                />
                <div className="line-name">
                  <IngredientInput
                    value={l.name}
                    onChange={(v) => setLineName(l.id, v)}
                    onPick={(ing) => updateLine(l.id, { name: ing.name, ingredientId: ing.id })}
                    ingredients={ingredients}
                    placeholder="Ingredient"
                  />
                </div>
                <input
                  className="line-note"
                  type="text"
                  value={l.note}
                  onChange={(e) => updateLine(l.id, { note: e.target.value })}
                  placeholder="Note (diced, optional…)"
                  aria-label="Note"
                />
                <button className="icon-btn icon-btn--small line-remove" onClick={() => { setLines((ls) => ls.filter((x) => x.id !== l.id)); setDirty(true); }} aria-label={`Remove ${l.name || 'line'}`}>
                  <Icon name="close" size={18} />
                </button>
                {l.name.trim() && (
                  <div className="line-status">
                    {known ? (
                      <span className="muted small">✓ {cap(known.name)} · {known.section}</span>
                    ) : (
                      <label className="new-ingredient small">
                        New ingredient · section
                        <select value={l.newSection} onChange={(e) => updateLine(l.id, { newSection: e.target.value })}>
                          {SECTIONS.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <button className="btn-secondary" onClick={() => { setLines((ls) => [...ls, emptyLine()]); setDirty(true); }}>
          + Add ingredient
        </button>
      </section>

      <div className="field">
        <label htmlFor="r-steps">Steps (one per line)</label>
        <textarea id="r-steps" rows={8} value={steps} onChange={(e) => touch(setSteps)(e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="r-tags">Tags (comma separated)</label>
        <input id="r-tags" type="text" value={tagsText} onChange={(e) => touch(setTagsText)(e.target.value)} placeholder="e.g. quick, vegetarian, soup" autoCapitalize="none" />
      </div>

      <div className="field">
        <label htmlFor="r-url">Source link</label>
        <input id="r-url" type="url" inputMode="url" value={sourceUrl} onChange={(e) => touch(setSourceUrl)(e.target.value)} placeholder="https://…" autoCapitalize="none" />
      </div>

      <div className="field">
        <label htmlFor="r-notes">Notes</label>
        <textarea id="r-notes" rows={3} value={notes} onChange={(e) => touch(setNotes)(e.target.value)} placeholder="Tweaks, what to serve it with…" />
      </div>

      {error && <p className="form-error">{error}</p>}

      <button className="btn btn-block" onClick={save}>
        Save recipe
      </button>
      {existing && (
        <button className="btn-link danger delete-recipe" onClick={remove}>
          Delete recipe
        </button>
      )}
    </div>
  );
}
