import { settings, updateSettings } from '../data/actions';
import { useStore } from '../data/store';
import { useAuth } from '../context/AuthContext';
import { Segmented, Sheet, Stepper } from './ui';

export default function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { user, signOut } = useAuth();
  const { pending } = useStore();
  const s = settings();

  function handleSignOut() {
    if (pending > 0 && !confirm(`${pending} changes haven't synced yet and will be lost if you sign out. Sign out anyway?`)) return;
    void signOut();
  }

  return (
    <Sheet title="Settings" onClose={onClose}>
      <div className="field-row">
        <div>
          <div className="field-label">Servings per meal</div>
          <div className="field-hint">The starting servings when you add a meal.</div>
        </div>
        <Stepper value={s.people} onChange={(people) => updateSettings({ people })} label="servings" />
      </div>
      <div className="field">
        <div className="field-label">Week starts on</div>
        <Segmented
          label="Week starts on"
          value={String(s.weekStart) as '0' | '1'}
          onChange={(v) => updateSettings({ weekStart: v === '0' ? 0 : 1 })}
          options={[
            { value: '1', label: 'Monday' },
            { value: '0', label: 'Sunday' },
          ]}
        />
      </div>
      <div className="settings-account">
        <span className="muted">Signed in as {user?.email}</span>
        <button className="btn-secondary" onClick={handleSignOut}>
          Sign out
        </button>
      </div>
    </Sheet>
  );
}
