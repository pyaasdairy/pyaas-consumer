import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  loadSession,
  onSessionChange,
  getProfile,
  signOut as sessionSignOut,
  type Session,
  type Profile,
} from './session';

type AuthValue = {
  session: Session;
  profile: Profile | null;
  /** True once the profile row has been fetched for the current session (so the
   * navigator can decide on the completion gate without flashing the tabs). */
  profileLoaded: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const Ctx = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    const p = await getProfile();
    setProfile(p);
    setProfileLoaded(true);
  }, []);

  // React to sign-in / sign-out anywhere in the app (session.ts emits on change).
  const syncFromSession = useCallback(async () => {
    const s = await loadSession();
    setSession(s);
    if (s?.user) {
      setProfileLoaded(false);
      await loadProfile();
    } else {
      setProfile(null);
      setProfileLoaded(false);
    }
  }, [loadProfile]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await syncFromSession();
      if (mounted) setLoading(false);
    })();
    const unsub = onSessionChange(() => {
      syncFromSession();
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, [syncFromSession]);

  const signOut = useCallback(async () => {
    await sessionSignOut();
    setProfile(null);
    setProfileLoaded(false);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfile();
  }, [session, loadProfile]);

  return (
    <Ctx.Provider value={{ session, profile, profileLoaded, loading, signOut, refreshProfile }}>
      {children}
    </Ctx.Provider>
  );
}
