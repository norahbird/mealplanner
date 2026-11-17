import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, PageHeader } from '../components/ui';
import { useData } from '../data/store';
import { fitLabel, recipeFit } from '../utils/suggestions';

type Sort = 'name' | 'fit' | 'rating';

export default function RecipesPage() {
  const data = useData();
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>('name');

  const recipes = Object.values(data.recipes);
  const tags = useMemo(() => [...new Set(recipes.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b)), [recipes]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipes
      .filter((r) => (!tag || r.tags.includes(tag)) && (!q || r.title.toLowerCase().includes(q) || r.tags.some((t) => t.toLowerCase().includes(q)) || r.ingredients.some((l) => l.name.toLowerCase().includes(q))))
      .map((r) => ({ recipe: r, fit: recipeFit(r, data) }))
      .sort((a, b) => {
        if (sort === 'fit') return b.fit.score - a.fit.score || a.recipe.title.localeCompare(b.recipe.title);
        if (sort === 'rating') return (b.recipe.rating ?? 0) - (a.recipe.rating ?? 0) || a.recipe.title.localeCompare(b.recipe.title);
        return a.recipe.title.localeCompare(b.recipe.title);
      });
  }, [recipes, data, query, tag, sort]);

  return (
    <div className="page">
      <PageHeader title="Recipes">
        <Link to="/recipes/new" className="btn">
          <Icon name="plus" size={18} /> New
        </Link>
      </PageHeader>

      {recipes.length === 0 ? (
        <div className="empty-card">
          <p>
            <strong>No recipes yet.</strong>
          </p>
          <p className="muted">Add the recipes you like, then plan them into your week. You can paste a whole ingredient list in one go.</p>
          <Link to="/recipes/new" className="btn">
            Add a recipe
          </Link>
        </div>
      ) : (
        <>
          <div className="recipe-tools">
            <input
              type="search"
              className="search-input"
              placeholder="Search recipes, tags or ingredients"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort by">
              <option value="name">A–Z</option>
              <option value="fit">Uses what I have</option>
              <option value="rating">Rating</option>
            </select>
          </div>
          {tags.length > 0 && (
            <div className="chip-row tag-filter">
              {tags.map((t) => (
                <button key={t} className={`chip${tag === t ? ' is-selected' : ''}`} onClick={() => setTag(tag === t ? null : t)}>
                  {t}
                </button>
              ))}
            </div>
          )}
          <ul className="recipe-list">
            {shown.map(({ recipe, fit }) => (
              <li key={recipe.id}>
                <Link to={`/recipes/${recipe.id}`} className="recipe-card">
                  <span className="recipe-card-title">{recipe.title}</span>
                  <span className="recipe-card-meta">
                    {recipe.rating ? <span className="stars">{'★'.repeat(recipe.rating)}</span> : null}
                    {recipe.tags.length > 0 && <span>{recipe.tags.join(', ')}</span>}
                  </span>
                  {fitLabel(fit) && <span className={`recipe-card-fit${fit.useSoon.length ? ' has-use-soon' : ''}`}>{fitLabel(fit)}</span>}
                </Link>
              </li>
            ))}
          </ul>
          {shown.length === 0 && <p className="empty">No recipes match.</p>}
        </>
      )}
    </div>
  );
}
