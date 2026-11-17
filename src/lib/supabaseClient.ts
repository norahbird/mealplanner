import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** False when the build is missing its Supabase settings; main.tsx shows a setup message instead of the app. */
export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/** Where the sign-in session is kept in localStorage. */
export const AUTH_STORAGE_KEY = 'mealplanner-auth';

// Read what an emailed link (password reset, sign-up confirmation) put in the URL before the
// Supabase client consumes and clears it. Its own PASSWORD_RECOVERY event can fire before the
// app subscribes, so the app relies on this instead.
function readEmailLinkRedirect() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const query = new URLSearchParams(window.location.search);
  return {
    isPasswordRecovery: params.get('type') === 'recovery',
    linkError: params.get('error_description') ?? query.get('error_description'),
  };
}
export const emailLinkRedirect = readEmailLinkRedirect();

export const supabase = createClient(supabaseUrl || 'http://localhost', supabaseAnonKey || 'not-configured', {
  auth: { storageKey: AUTH_STORAGE_KEY },
});

/**
 * The account from the saved sign-in, even if its access token has expired. With no signal
 * (say, in a store) the client can't renew an expired token and reports no session, but the
 * saved sign-in is still valid, so the app keeps working from its offline copy.
 */
export function storedUser(): { id: string; email: string } | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { user?: { id?: string; email?: string } };
    if (!parsed.user?.id) return null;
    return { id: parsed.user.id, email: parsed.user.email ?? '' };
  } catch {
    return null;
  }
}

export function isNetworkError(message: string | undefined): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  return /fetch|network|load failed|timed out|jwt|AuthRetryable/i.test(message ?? '');
}
