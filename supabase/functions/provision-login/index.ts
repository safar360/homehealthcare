// Creates, resets and revokes portal logins.
//
// Creating an account needs the service role key, which must never reach a
// browser — anyone could read it out of the bundle and own the database. So it
// lives here, where Supabase injects it as an environment variable and it never
// leaves the server.
//
// Every request is checked twice: the caller must present a valid session, and
// that session's profile must have role 'admin'. The record's own phone number
// is read from the database rather than taken from the request body, so a
// caller cannot provision a login against a number of their choosing.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Supabase keys accounts on email, but a manager signs in with the company
// number they were issued. The number is mapped to a fixed internal address
// that is never shown to them and never receives mail.
const LOGIN_DOMAIN = 'pari.internal';

// No O/0, I/l/1 — these get read aloud over a phone and written on paper.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

function tempPassword(length = 10): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** Last ten digits, so +91 98765 43210 and 9876543210 are the same login. */
function tenDigits(raw: string | null): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : '';
}

/**
 * Where a retired login's address goes, so the number it held becomes free
 * again. Timestamped because the same number may be retired more than once.
 */
function archivedEmail(digits: string): string {
  return `${digits}.retired.${Date.now()}@${LOGIN_DOMAIN}`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'Sign in first.' }, 401);
  }

  // --- who is asking -------------------------------------------------------
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData?.user) {
    return json({ error: 'Your session is not valid. Sign in again.' }, 401);
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (callerProfile?.role !== 'admin') {
    return json({ error: 'Only an admin can manage logins.' }, 403);
  }

  // --- what is being asked -------------------------------------------------
  let body: { action?: string; kind?: string; record_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Malformed request.' }, 400);
  }

  const action = body.action ?? 'create';
  const kind = body.kind ?? 'manager';
  const recordId = body.record_id ?? '';

  if (!['create', 'reset', 'revoke'].includes(action)) {
    return json({ error: `Unknown action "${action}".` }, 400);
  }
  if (!['manager', 'staff'].includes(kind)) {
    return json({ error: `Unknown record type "${kind}".` }, 400);
  }
  if (!recordId) return json({ error: 'No record was named.' }, 400);

  const table = kind === 'manager' ? 'location_managers' : 'location_staff';
  const role = kind === 'manager' ? 'manager' : 'staff';

  const { data: record, error: recordError } = await admin
    .from(table)
    .select('id, full_name, phone_number, city_slug, user_id')
    .eq('id', recordId)
    .maybeSingle();

  if (recordError) return json({ error: recordError.message }, 500);
  if (!record) return json({ error: 'That record no longer exists.' }, 404);

  // The number comes from the record, never from the request body.
  const digits = tenDigits(record.phone_number);
  if (!digits && action !== 'revoke') {
    return json(
      {
        error: `${record.full_name} has no mobile number on file. Add the number issued to them, then create the login.`,
      },
      400
    );
  }

  const loginEmail = `${digits}@${LOGIN_DOMAIN}`;

  // --- revoke --------------------------------------------------------------
  if (action === 'revoke') {
    if (!record.user_id) return json({ error: 'This person has no login to revoke.' }, 409);

    // Banned rather than deleted: their name stays on every record they
    // touched, and the audit trail stays readable.
    //
    // The address is archived at the same time. A company number gets reissued
    // — to the same person after a mistaken revoke, or to whoever replaces
    // them — and an account still holding it would block that forever. Renaming
    // frees the number without merging two people's history into one account.
    const archived = archivedEmail(digits || record.user_id);

    await admin.auth.admin.updateUserById(record.user_id, {
      email: archived,
      email_confirm: true,
      ban_duration: '876000h',
    });
    // profiles.email is unique and mirrors the auth address; leaving it behind
    // would collide with the next login issued for this number.
    await admin
      .from('profiles')
      .update({ role: 'patient', email: archived })
      .eq('id', record.user_id);
    await admin.from(table).update({ user_id: null }).eq('id', recordId);

    return json({ ok: true, action: 'revoke', full_name: record.full_name });
  }

  // --- reset ---------------------------------------------------------------
  if (action === 'reset') {
    if (!record.user_id) {
      return json({ error: 'This person has no login yet. Create one first.' }, 409);
    }

    const password = tempPassword();
    const { data: existing } = await admin.auth.admin.getUserById(record.user_id);

    const { error } = await admin.auth.admin.updateUserById(record.user_id, {
      password,
      ban_duration: 'none',
      user_metadata: { ...(existing?.user?.user_metadata ?? {}), must_change_password: true },
    });
    if (error) return json({ error: error.message }, 500);

    return json({
      ok: true,
      action: 'reset',
      full_name: record.full_name,
      login_number: digits,
      password,
    });
  }

  // --- create --------------------------------------------------------------
  if (record.user_id) {
    return json(
      { error: `${record.full_name} already has a login. Use Reset password instead.` },
      409
    );
  }

  // An account may already hold this address — from a revoke done before
  // revoke archived the address, or from a record that was deleted outright.
  // If nothing points at it any more it is stale, and holding the number
  // hostage helps nobody. profiles.email mirrors the auth address and is
  // unique, so it is the cheapest way to find one.
  const { data: squatter } = await admin
    .from('profiles')
    .select('id')
    .eq('email', loginEmail)
    .maybeSingle();

  if (squatter) {
    const [linkedManager, linkedStaff] = await Promise.all([
      admin.from('location_managers').select('full_name').eq('user_id', squatter.id).maybeSingle(),
      admin.from('location_staff').select('full_name').eq('user_id', squatter.id).maybeSingle(),
    ]);
    const owner = linkedManager.data?.full_name ?? linkedStaff.data?.full_name;

    if (owner) {
      return json(
        {
          error: `The number ${digits} is already the login for ${owner}. Each person needs their own number.`,
        },
        409
      );
    }

    // Orphaned: retire it and carry on rather than making an admin dig it out.
    const archived = archivedEmail(digits);
    await admin.auth.admin.updateUserById(squatter.id, {
      email: archived,
      email_confirm: true,
      ban_duration: '876000h',
    });
    await admin.from('profiles').update({ email: archived, role: 'patient' }).eq('id', squatter.id);
  }

  const password = tempPassword();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: loginEmail,
    password,
    // There is no mailbox behind this address, so nothing could confirm it.
    email_confirm: true,
    user_metadata: {
      full_name: record.full_name,
      login_number: digits,
      must_change_password: true,
    },
  });

  if (createError || !created?.user) {
    const message = createError?.message ?? 'Could not create the login.';
    if (/already been registered|already exists/i.test(message)) {
      return json(
        {
          error: `The number ${digits} is already used by another login. Each person needs their own number.`,
        },
        409
      );
    }
    return json({ error: message }, 500);
  }

  // The signup trigger creates the profile as 'patient' and does not read the
  // role from client metadata — deliberately, see
  // docs/patch-signup-role-escalation.sql. The role is granted here instead,
  // by the service role, after the admin check above has passed.
  const { error: profileError } = await admin
    .from('profiles')
    .update({
      role,
      full_name: record.full_name,
      phone_number: record.phone_number,
      city_slug: record.city_slug,
    })
    .eq('id', created.user.id);

  if (profileError) {
    // Do not leave an account that can sign in but has no role.
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: `Could not set the role: ${profileError.message}` }, 500);
  }

  const { error: linkError } = await admin
    .from(table)
    .update({ user_id: created.user.id })
    .eq('id', recordId);

  if (linkError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: `Could not link the login: ${linkError.message}` }, 500);
  }

  return json({
    ok: true,
    action: 'create',
    full_name: record.full_name,
    login_number: digits,
    password,
  });
});
