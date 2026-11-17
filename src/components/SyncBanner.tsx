import { useAuth } from '../context/AuthContext';
import { dismissSyncError, refresh, useStore } from '../data/store';

export default function SyncBanner() {
  const { offlineSignIn } = useAuth();
  const { offline, pending, syncError, loadError } = useStore();

  if (syncError) {
    return (
      <div className="banner banner--error" role="alert">
        <span>{syncError}</span>
        <button className="btn-link" onClick={dismissSyncError}>
          Dismiss
        </button>
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="banner banner--error" role="alert">
        <span>{loadError}</span>
        <button className="btn-link" onClick={() => void refresh()}>
          Retry
        </button>
      </div>
    );
  }
  if (offline || offlineSignIn) {
    return (
      <div className="banner banner--offline" role="status">
        <span>
          Offline.{' '}
          {pending > 0
            ? `${pending} ${pending === 1 ? 'change' : 'changes'} will sync when you're back online.`
            : "Changes you make will sync when you're back online."}
        </span>
      </div>
    );
  }
  return null;
}
