import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  loadSession,
  onSessionChange,
  getProfile,
  signOut as sessionSignOut,
  type Session,
  type Profile,
} from './session';
import { resetServiceability } from './serviceability';
import { resetNotificationCenter } from './notificationCenter';
import { announcePushForCurrentSession } from './notifications';
import { useUserLocation } from './userLocation';

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
      // The push row is keyed by device token and must follow the member who
      // is signed in NOW — the permission primer is hidden once permission
      // exists, so this is the only path that can rebind a shared handset.
      void announcePushForCurrentSession();
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
    // The serviceability cache and the in-memory location outlive the session;
    // left alone, the NEXT account's first check short-circuits on this
    // account's signature and inherits its verdict (fence lifted or lowered
    // for the wrong person). Reset both so the new session resolves fresh.
    resetServiceability();
    // The feed and its badge belong to the account that just left.
    resetNotificationCenter();
    // …and so does the push pairing: re-announce so the row stops naming them.
    void announcePushForCurrentSession();
    useUserLocation.setState({ loc: null, ready: false });
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
