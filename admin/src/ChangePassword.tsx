import { useState, type FormEvent } from 'react';
import { supabase } from './lib/supabase';

/**
 * Shown once, immediately after a first sign-in with the temporary password the
 * admin read out. Nothing else in the portal is reachable until it is done, so
 * a password that has been spoken aloud or written on paper cannot stay in use.
 */
export default function ChangePassword({
  name,
  onDone,
  onSignOut,
}: {
  name: string;
  onDone: () => void;
  onSignOut: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }

    setSaving(true);
    const { error: saveError } = await supabase.auth.updateUser({
      password,
      // Clearing the flag is what releases the rest of the portal.
      data: { must_change_password: false },
    });
    setSaving(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }
    onDone();
  };

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <h1>Choose your password</h1>
        <p className="login-subtitle">
          {name ? `Welcome, ${name}. ` : ''}You are signed in with a temporary password. Pick your
          own before you continue.
        </p>

        <div className="form-group">
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="confirm-password">Confirm password</label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            required
          />
        </div>

        {error && <p className="form-error">{error}</p>}

        <button className="btn-primary btn-block" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save and continue'}
        </button>

        <button className="btn-secondary btn-block" type="button" onClick={onSignOut}>
          Sign out
        </button>
      </form>
    </div>
  );
}
