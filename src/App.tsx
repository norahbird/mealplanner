import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import AuthScreen from './components/AuthScreen';
import SetNewPasswordScreen from './components/SetNewPasswordScreen';
import SyncBanner from './components/SyncBanner';
import { Icon } from './components/ui';
import { useAuth } from './context/AuthContext';
import { refresh, useStore } from './data/store';
import GroceriesPage from './pages/GroceriesPage';
import OnHandPage from './pages/OnHandPage';
import PlanPage from './pages/PlanPage';
import RecipeEditPage from './pages/RecipeEditPage';
import RecipesPage from './pages/RecipesPage';
import RecipeViewPage from './pages/RecipeViewPage';

const TABS = [
  { to: '/plan', label: 'Plan', icon: 'plan' },
  { to: '/groceries', label: 'Groceries', icon: 'cart' },
  { to: '/on-hand', label: 'On hand', icon: 'fridge' },
  { to: '/recipes', label: 'Recipes', icon: 'book' },
];

export default function App() {
  const { user, loading, recoveringPassword } = useAuth();
  const store = useStore();

  if (loading) return <p className="page-status">Loading…</p>;
  if (!user) return <AuthScreen />;
  if (recoveringPassword) return <SetNewPasswordScreen />;

  if (!store.ready) {
    return (
      <div className="page-status">
        {store.loadError ? (
          <>
            <p>{store.loadError}</p>
            <button className="btn" onClick={() => void refresh()}>
              Try again
            </button>
          </>
        ) : store.offline ? (
          <>
            <p>You're offline. Connect to the internet once to set up Meal Planner on this device.</p>
            <button className="btn" onClick={() => void refresh()}>
              Try again
            </button>
          </>
        ) : (
          <p>Loading your kitchen…</p>
        )}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <SyncBanner />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/plan" replace />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/groceries" element={<GroceriesPage />} />
          <Route path="/on-hand" element={<OnHandPage />} />
          <Route path="/recipes" element={<RecipesPage />} />
          <Route path="/recipes/new" element={<RecipeEditPage />} />
          <Route path="/recipes/:id" element={<RecipeViewPage />} />
          <Route path="/recipes/:id/edit" element={<RecipeEditPage />} />
          <Route path="*" element={<Navigate to="/plan" replace />} />
        </Routes>
      </main>
      <nav className="tab-bar" aria-label="Main">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} className={({ isActive }) => `tab${isActive ? ' is-active' : ''}`}>
            <Icon name={t.icon} size={24} />
            <span>{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
