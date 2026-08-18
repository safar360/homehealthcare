import { useState, type FormEvent } from 'react';
import { supabase } from './lib/supabase';
import { toLoginEmail } from './lib/auth';

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    // Managers and staff sign in with the mobile number they were issued; the
    // original admin accounts still use an email. Both arrive here.
    const email = toLoginEmail(identifier);
    if (!email) {
      setError('Enter your 10-digit mobile number.');
      return;
    }

    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    // On success the auth listener in App swaps this screen out, so there is
    // nothing to do here but surface a failure.
    if (signInError) {
      setError(
        /invalid login credentials/i.test(signInError.message)
          ? 'That number and password do not match. Ask your admin to reset it if you have forgotten it.'
          : signInError.message
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Pari Home Healthcare</h1>
        <p className="login-subtitle">Operations portal — admins, managers and staff</p>

        <div className="form-group">
          <label htmlFor="identifier">Mobile number</label>
          <input
            id="identifier"
            type="text"
            inputMode="tel"
            autoComplete="username"
            placeholder="9812345678"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>

        {error && <p className="form-error">{error}</p>}

        <button className="btn-primary btn-block" type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="login-hint">
          Use the number your admin issued you. Forgotten your password? Your admin can reset it.
        </p>
      </form>
    </div>
  );
}
