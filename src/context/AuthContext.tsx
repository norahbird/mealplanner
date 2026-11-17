import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { emailLinkRedirect, isNetworkError, storedUser, supabase } from '../lib/supabaseClient';
import { startStore, stopStore } from '../data/store';

interface AuthResult {
  error: string | null;
  needsEmailConfirmation?: boolean;
}

interface AppUser {
  id: string;
  email: string;
}

interface AuthContextValue {
  user: AppUser | null;
  /** True when using a saved sign-in that can't be renewed until there's a connection. */
  offlineSignIn: boolean;
  loading: boolean;
  /** True after opening a password-reset email link, until a new password is saved. */
  recoveringPassword: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function friendlyAuthError(message: string): string {
  if (/rate limit/i.test(message)) {
    return 'Too many emails have been sent recently. Please wait a little while and try again.';
  }
  if (isNetworkError(message)) return "Couldn't reach the server. Check your internet connection.";
  return message;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [offlineUser, setOfflineUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoveringPassword, setRecoveringPassword] = useState(emailLinkRedirect.isPasswordRecovery);

  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      setSession(data.session);
      // No session because the token couldn't be renewed offline: carry on with the saved sign-in.
      if (!data.session && (error ? isNetworkError(error.message) : !navigator.onLine)) setOfflineUser(storedUser());
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'INITIAL_SESSION') return;
      setSession(newSession);
      if (newSession) setOfflineUser(null);
      if (event === 'SIGNED_OUT') setOfflineUser(null);
      if (event === 'PASSWORD_RECOVERY') setRecoveringPassword(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const user: AppUser | null = session ? { id: session.user.id, email: session.user.email ?? '' } : offlineUser;

  useEffect(() => {
    if (user) startStore(user.id);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function signIn(email: string, password: string): Promise<AuthResult> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? friendlyAuthError(error.message) : null };
  }

  async function signUp(email: string, password: string): Promise<AuthResult> {
    // The confirmation email links back to wherever this sign-up happened. Supabase only
    // honors addresses listed under Authentication → URL Configuration → Redirect URLs;
    // any other falls back to the project's Site URL.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) return { error: friendlyAuthError(error.message) };
    return { error: null, needsEmailConfirmation: !data.session };
  }

  async function requestPasswordReset(email: string): Promise<AuthResult> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    return { error: error ? friendlyAuthError(error.message) : null };
  }

  async function updatePassword(password: string): Promise<AuthResult> {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { error: friendlyAuthError(error.message) };
    setRecoveringPassword(false);
    return { error: null };
  }

  async function signOut() {
    await supabase.auth.signOut({ scope: 'local' });
    stopStore();
    setSession(null);
    setOfflineUser(null);
    setRecoveringPassword(false);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        offlineSignIn: !session && Boolean(offlineUser),
        loading,
        recoveringPassword,
        signIn,
        signUp,
        requestPasswordReset,
        updatePassword,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
