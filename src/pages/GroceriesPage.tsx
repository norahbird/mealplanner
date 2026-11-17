import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, IngredientInput, PageHeader } from '../components/ui';
import { addToList, alreadyHave, finishShopping, removeFromList, setChecked, settings, updateSettings } from '../data/actions';
import { useData } from '../data/store';
import type { Ingredient } from '../data/types';
import { buildGroceryList, groupBySection, type GroceryRow } from '../utils/grocery';
import { cap } from '../utils/names';
import { findExact, parseLine } from '../utils/parseIngredients';
import { formatAmount } from '../utils/units';

const DAY_OPTIONS = [3, 5, 7, 10, 14];

export default function GroceriesPage() {
  const data = useData();
  const { shopDays } = settings();
  const list = useMemo(() => buildGroceryList(data, shopDays), [data, shopDays]);
  const ingredients = useMemo(() => Object.values(data.ingredients), [data.ingredients]);
  const [text, setText] = useState('');
  const [showHave, setShowHave] = useState(false);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  function addTyped(raw: string) {
    const parsed = parseLine(raw);
    if (!parsed || !parsed.name) return;
    const ing = findExact(parsed.name, ingredients);
    const amount = parsed.qty !== null || parsed.unit ? formatAmount(parsed.qty, parsed.unit) : '';
    addToList(ing ? { ingredient: ing, amount } : { name: parsed.name, amount });
    setText('');
  }

  function addPicked(ing: Ingredient) {
    addToList({ ingredient: ing });
    setText('');
  }

  function done() {
    const n = finishShopping();
    setDoneMessage(`${n} ${n === 1 ? 'item' : 'items'} moved to On hand.`);
    window.setTimeout(() => setDoneMessage(null), 4000);
  }

  const nothing = list.toBuy.length === 0 && list.inCart.length === 0;

  return (
    <div className="page">
      <PageHeader title="Groceries" />

      <div className="shop-range">
        <label htmlFor="shop-days">Shopping for the next</label>
        <select id="shop-days" value={shopDays} onChange={(e) => updateSettings({ shopDays: Number(e.target.value) })}>
          {DAY_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {d} days
            </option>
          ))}
        </select>
        <span className="muted">
          · {list.mealCount} {list.mealCount === 1 ? 'meal' : 'meals'}
        </span>
      </div>

      <div className="add-bar">
        <IngredientInput
          value={text}
          onChange={setText}
          onPick={addPicked}
          onSubmit={addTyped}
          ingredients={ingredients}
          placeholder="Add an item, e.g. 2 avocados"
        />
        <button className="btn" onClick={() => text.trim() && addTyped(text)} disabled={!text.trim()} aria-label="Add to list">
          <Icon name="plus" />
        </button>
      </div>

      {doneMessage && (
        <p className="toast" role="status">
          {doneMessage}
        </p>
      )}

      {nothing && (
        <div className="empty-card">
          <p>
            <strong>Nothing to buy.</strong>
          </p>
          <p className="muted">
            {list.mealCount === 0 ? (
              <>
                Plan some meals on the <Link to="/plan">Plan</Link> tab and anything you don't have shows up here.
              </>
            ) : (
              'You have everything the plan needs.'
            )}
          </p>
        </div>
      )}

      {groupBySection(list.toBuy).map(([section, rows]) => (
        <section key={section} className="list-section">
          <h2 className="section-title">{section}</h2>
          <ul className="grocery-list">
            {rows.map((row) => (
              <GroceryRowView key={row.key} row={row} />
            ))}
          </ul>
        </section>
      ))}

      {list.lowExtras.length > 0 && (
        <section className="list-section">
          <h2 className="section-title">Running low · not in the plan</h2>
          <div className="chip-row">
            {list.lowExtras.map((ing) => (
              <button key={ing.id} className="chip" onClick={() => addToList({ ingredient: ing })}>
                + {cap(ing.name)}
              </button>
            ))}
          </div>
        </section>
      )}

      {list.inCart.length > 0 && (
        <section className="list-section in-cart">
          <div className="section-title-row">
            <h2 className="section-title">In cart · {list.inCart.length}</h2>
          </div>
          <ul className="grocery-list">
            {list.inCart.map((row) => (
              <GroceryRowView key={row.key} row={row} />
            ))}
          </ul>
          <button className="btn btn-block" onClick={done}>
            Done shopping: put {list.inCart.length} {list.inCart.length === 1 ? 'item' : 'items'} on hand
          </button>
        </section>
      )}

      {list.have.length > 0 && (
        <section className="list-section">
          <button className="disclosure" onClick={() => setShowHave((s) => !s)} aria-expanded={showHave}>
            <span>Already have · {list.have.length}</span>
            <Icon name={showHave ? 'back' : 'next'} size={18} />
          </button>
          {showHave && (
            <ul className="grocery-list">
              {list.have.map((row) => (
                <li key={row.key} className="grocery-row is-have">
                  <div className="grocery-text">
                    <span className="grocery-name">{row.name}</span>
                    <span className="grocery-meta">
                      {row.reason}
                      {row.amount && ` · need ${row.amount}`}
                    </span>
                  </div>
                  {row.ingredient && (
                    <button className="btn-small" onClick={() => addToList({ ingredient: row.ingredient! })}>
                      Need it
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function GroceryRowView({ row }: { row: GroceryRow }) {
  const checked = Boolean(row.item?.checked);
  return (
    <li className={`grocery-row${checked ? ' is-checked' : ''}`}>
      <label className="grocery-check">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(row, e.target.checked)} />
        <span className="checkmark" aria-hidden="true">
          <Icon name="check" size={18} />
        </span>
        <span className="grocery-text">
          <span className="grocery-name">
            {row.name}
            {row.amount && <span className="grocery-amount"> {row.amount}</span>}
          </span>
          {(row.usedFor || row.flagText) && (
            <span className="grocery-meta">
              {row.flagText && <span className={`flag flag-${row.flag}`}>{row.flagText}</span>}
              {row.usedFor}
            </span>
          )}
        </span>
      </label>
      {!checked &&
        (row.fromPlan && row.ingredient ? (
          <button className="btn-small" onClick={() => alreadyHave(row)} title="Mark as on hand">
            Have it
          </button>
        ) : row.item ? (
          <button className="icon-btn icon-btn--small" onClick={() => removeFromList(row.item!.id)} aria-label={`Remove ${row.name}`}>
            <Icon name="close" size={18} />
          </button>
        ) : null)}
    </li>
  );
}
