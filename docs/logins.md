# Portal logins

How a manager gets access after an admin onboards them, and how to set it up.

---

## 1. The rule

**A role is granted, never claimed.** A new account always starts as `patient`,
which can reach nothing. An admin raises it, or the `provision-login` function
does so on an admin's behalf.

This was not always true. Until 2026-08-18, `handle_new_user()` copied the role
out of `raw_user_meta_data` — the data the *client* sends to the public signup
endpoint. Anyone on the internet could run

```
POST /auth/v1/signup {"email":"...","password":"...","data":{"role":"admin"}}
```

and receive a working admin account. This was confirmed against the live
database, not merely suspected. `docs/patch-signup-role-escalation.sql` closes
it. If you are setting up a fresh project, run that patch.

---

## 2. How a manager signs in

Each manager is issued a company mobile number by the admin. **That number is
their username.**

Supabase keys accounts on email, so the number is mapped to a fixed internal
address — `9812345678@pari.internal`. Nothing is ever sent there and the manager
never sees it. The sign-in box takes the number and does the conversion itself.

The domain appears in two places and **must match**:

- `LOGIN_DOMAIN` in `supabase/functions/provision-login/index.ts`
- `LOGIN_DOMAIN` in `admin/src/lib/auth.ts`

Changing it orphans every existing login.

### The flow

1. Admin adds the manager, **including the mobile number** — without it there is
   nothing to sign in with, and the button says so.
2. Admin clicks **Create login**.
3. A temporary password is shown **once**. The admin reads it to the manager.
4. The manager signs in with their number and that password.
5. They must choose their own password before anything else opens.

The temporary password is generated on the server, is never written to the
database, and cannot be looked up again. If it is lost, use **Reset password**.

---

## 3. Setting up the function

Creating an account needs the `service_role` key. That key must **never** appear
in browser code — anyone could read it out of the published bundle and take over
the database. So it lives in an Edge Function, where Supabase injects it as an
environment variable and it never leaves the server.

### Deploy from the dashboard

1. Supabase dashboard → **Edge Functions** → **Deploy a new function**.
2. Name it exactly `provision-login`.
3. Paste the whole of `supabase/functions/provision-login/index.ts`.
4. Deploy.

No secrets to configure. `SUPABASE_URL`, `SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` are provided to the function automatically.

### Or with the CLI

```bash
supabase functions deploy provision-login --project-ref htgydovsseqeshwnxazm
```

Until it is deployed, the portal says so plainly rather than throwing a raw
404 at the admin.

---

## 4. What the function will and will not do

Every request is checked twice: the caller must hold a valid session, **and**
that session's profile must have `role = 'admin'`. A manager calling it directly
gets a 403.

The mobile number is read **from the database record**, never from the request
body — so a caller cannot provision a login against a number of their choosing.

| Action | Effect |
|---|---|
| `create` | Creates the account, sets the role, links it to the manager or staff record, returns the password once |
| `reset` | New temporary password, forces a change on next sign-in, lifts any ban |
| `revoke` | Bans the account, drops the profile back to `patient`, unlinks the record, and **archives the address** so the number is free again |

**Why revoke archives the address.** A company number gets reissued — to the
same person after a mistaken revoke, or to whoever replaces them. An account
still holding `9812345678@pari.internal` would block that forever, and the first
build of this did exactly that: revoke, then Create login, and the portal said
the number was already in use with no way out. Deleting the account instead is
worse, because it takes the person's name off every record they touched. So the
address is renamed to `9812345678.retired.<timestamp>@pari.internal`: the number
is free, the history stays, and two people never share one account.

Creating a login also clears a stale account still sitting on the number when
nothing points at it any more. If something does, it says whose it is.

**Revoke bans rather than deletes.** The person's name stays on every record they
touched, so the audit trail stays readable. This is the answer to a manager
leaving: revoke their login, then assign their staff to the replacement.

If the role or the link cannot be set, the half-created account is deleted. An
account that can sign in but has no role is worse than no account.

---

## 5. Also do this

**Turn off public signup.** Neither app calls `signUp` — nothing legitimate uses
it, so it is pure attack surface. Dashboard → Authentication → Providers →
Email → disable **Enable signup**. The patch above makes the escalation
harmless; this removes the door entirely.

**Clear out the demonstration accounts** before real data goes in:
`test_admin@gmail.com` and `test_manager@gmail.com` both use `123456` and are
reachable from the open internet. Also delete `test_staff@gmail.com`,
`attacker.test@gmail.com` and any `esc.probe.*@gmail.com` account from
Authentication → Users.

---

## 6. Later: OTP instead of a password

The better experience is no password at all — the manager types their number and
receives a code. It was not built first because of what it needs, not what it
costs:

- an SMS provider account (MSG91, Twilio or similar);
- **TRAI DLT registration** of the sender ID and every message template, against
  your GST and PAN. This takes one to two weeks and cannot be rushed.

Running cost is small — roughly ₹15–20 a month at pilot volume. When DLT
registration clears, OTP can be added to the same sign-in screen without
re-onboarding anyone, because the account is already keyed on the number.
