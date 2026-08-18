import { supabase } from './supabase';

/**
 * Portal logins.
 *
 * A manager signs in with the company mobile number the admin issued them.
 * Supabase keys accounts on email, so the number is mapped to a fixed internal
 * address. Nothing is ever sent to it and the manager never sees it — the
 * portal shows their number and nothing else.
 *
 * This constant must match LOGIN_DOMAIN in
 * supabase/functions/provision-login/index.ts. Changing it orphans every
 * existing login.
 */
export const LOGIN_DOMAIN = 'pari.internal';

/** Last ten digits, so "+91 98765 43210" and "9876543210" are one login. */
export function tenDigits(raw: string | null | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
}

/**
 * What the sign-in box accepts. An email is used as typed, so the original
 * admin accounts keep working; anything else is treated as a mobile number.
 */
export function toLoginEmail(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.includes('@')) return trimmed;
  const digits = tenDigits(trimmed);
  return digits ? `${digits}@${LOGIN_DOMAIN}` : null;
}

/** True while a temporary password is still in force. */
export function mustChangePassword(metadata: Record<string, unknown> | undefined): boolean {
  return metadata?.must_change_password === true;
}

export type ProvisionResult = {
  ok: true;
  action: 'create' | 'reset' | 'revoke';
  full_name: string;
  login_number?: string;
  password?: string;
};

/**
 * Calls the provision-login Edge Function. Creating an account needs the
 * service role key, so it cannot happen in the browser; this is the only route.
 */
export async function provisionLogin(args: {
  action: 'create' | 'reset' | 'revoke';
  kind: 'manager' | 'staff';
  recordId: string;
}): Promise<{ data: ProvisionResult | null; error: string | null }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { data: null, error: 'Your session has expired. Sign in again.' };

  const base = import.meta.env.VITE_SUPABASE_URL;
  let response: Response;

  try {
    response = await fetch(`${base}/functions/v1/provision-login`, {
      method: 'POST',
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: args.action,
        kind: args.kind,
        record_id: args.recordId,
      }),
    });
  } catch {
    // A function that was never deployed answers 404 without CORS headers, so
    // the browser blocks the response before its status can be read and fetch
    // simply throws — identical to being offline. Tell them apart by whether
    // the browser thinks it has a connection at all.
    return {
      data: null,
      error: navigator.onLine
        ? 'Login management is not set up on this project yet. The provision-login function needs deploying — see docs/logins.md.'
        : 'You appear to be offline. Reconnect and try again.',
    };
  }

  // A 404 here means the function was never deployed, which is a setup problem
  // rather than something the admin did wrong — say so plainly.
  if (response.status === 404) {
    return {
      data: null,
      error:
        'Login management is not set up on this project yet. The provision-login function needs deploying — see docs/logins.md.',
    };
  }

  let payload: { error?: string } & Partial<ProvisionResult>;
  try {
    payload = await response.json();
  } catch {
    return { data: null, error: `Server returned ${response.status}.` };
  }

  if (!response.ok) return { data: null, error: payload.error ?? `Server returned ${response.status}.` };
  return { data: payload as ProvisionResult, error: null };
}
