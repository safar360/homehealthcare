import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { configError, supabase } from './lib/supabase';
import type { Profile } from './lib/types';
import LoginPage from './LoginPage';
import AdminPortal from './AdminPortal';
import ManagerPortal from './ManagerPortal';
import StaffPortal from './StaffPortal';
import './styles.css';

/**
 * The ops portal is one app serving three roles. Which portal renders is decided
 * by profiles.role, and the database enforces the same boundary through RLS --
 * this routing is convenience, not the security control.
 */
export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    if (configError) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setProfile(null);
        setProfileError(null);
        setLoading(false);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;

    let cancelled = false;
    setLoading(true);

    supabase
      .from('profiles')
      .select('id, full_name, role, email, phone_number, city_slug')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setProfileError(error.message);
        } else if (!data) {
          setProfileError(
            'Signed in, but this account has no profile row. An admin needs to create one before you can use the portal.'
          );
        } else {
          setProfile(data as Profile);
          setProfileError(null);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  const signOut = useCallback(() => {
    void supabase.auth.signOut();
  }, []);

  if (configError) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <h1>Configuration needed</h1>
          <p className="form-error">{configError}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <p>Loading…</p>
        </div>
      </div>
    );
  }

  if (!session) return <LoginPage />;

  if (profileError || !profile) {
    return (
      <AccessDenied
        title="Cannot load your profile"
        message={profileError ?? 'Unknown error.'}
        onSignOut={signOut}
      />
    );
  }

  if (profile.role === 'patient') {
    return (
      <AccessDenied
        title="No portal access"
        message={`${profile.email ?? 'This account'} has the "patient" role. The operations portal is for staff, managers and admins.`}
        onSignOut={signOut}
      />
    );
  }

  // data-role drives the per-portal gradient, so the user type is identifiable
  // at a glance: admin teal, manager indigo, staff amber.
  const shell = (body: ReactNode) => (
    <div className="app-shell" data-role={profile.role}>
      <header className="topbar">
        <div>
          <h1>Pari Home Healthcare</h1>
          <p className="topbar-sub">
            {profile.full_name || profile.email}
            <span className="role-chip">{profile.role}</span>
          </p>
        </div>
        <button className="btn-secondary" type="button" onClick={signOut}>
          Sign out
        </button>
      </header>
      {body}
    </div>
  );

  if (profile.role === 'admin') return shell(<AdminPortal />);
  if (profile.role === 'manager') return shell(<ManagerPortal profile={profile} />);
  return shell(<StaffPortal profile={profile} />);
}

function AccessDenied({
  title,
  message,
  onSignOut,
}: {
  title: string;
  message: string;
  onSignOut: () => void;
}) {
  return (
    <div className="login-shell">
      <div className="login-card">
        <h1>{title}</h1>
        <p className="form-error">{message}</p>
        <button className="btn-secondary btn-block" type="button" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </div>
  );
}
