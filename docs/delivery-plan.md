# Delivery plan — production release, access control and cost

**Date:** 2026-08-14
**Status:** proposal for review. No development against this yet.

Covers hosting, cost certainty at production scale, OTP-protected admin access, how a
manager leaving is handled, and how patient data arrives in a later phase.

---

## 1. Where we are today

| Area | State |
|---|---|
| Cities | Admin-managed. Bhopal, Indore, Gwalior, Jabalpur seeded |
| Staff roles | Admin-managed table (was a hard-coded enum) |
| Managers | Full CRUD, scoped to a city, with named areas |
| Staff | Full CRUD, role, city, area, qualifications, availability, reporting manager |
| Admin dashboard | Location-wise coverage, uncovered-city and unassigned-staff warnings |
| Manager portal | Own team only, enforced by RLS |
| Staff portal | Own record and availability |
| Patient app | Service catalogue plus anonymous order capture |
| Security | RLS on every table, role helpers, column guards, RPC authorisation |
| Hosting | One GitHub Pages site: patient at `/`, ops at `/ops/` |

Deployed and verified in a browser against the live Supabase project.

---

## 2. Cost at production scale

### The headline

**You can launch and run on the free tier at ₹0/month.** The two things the free plan
lacks are both mitigated in this repository, for free:

| Free plan gap | Mitigation | Status |
|---|---|---|
| No backups at all | Nightly encrypted `pg_dump`, 90-day retention | ✅ `.github/workflows/backup.yml` |
| Pauses after 7 days idle | One authenticated request a day | ✅ `.github/workflows/keepalive.yml` |

Setup and restore procedure: [operations.md](operations.md).

Supabase Pro at $25/month remains worth buying eventually, but it is **not** required to
go live. What it buys is a one-click restore, email support, and not managing an
encryption passphrase yourself. It does *not* buy a smaller data-loss window — Pro's
backups are also daily.

**Upgrade when any one of these is true:** real patient records exist (Phase 2); more than
about two cities are live; or an incident has happened where restore speed mattered.

### Residual risk on free tier

| | Exposure |
|---|---|
| Data loss window | Up to 24 hours |
| Restore | ~15 minutes, manual, needs the passphrase |
| Logins after restore | `auth.users` is not in the dump — accounts must be recreated |
| Support | Community only |

### Why capacity is not the concern

Your projected scale sits far inside the free allowances, so you are not paying for room:

| Resource | Free allowance | Your realistic Phase 2 usage |
|---|---|---|
| Database | 500 MB | 4 cities, ~20 managers, ~200 staff, ~2,000 patients ≈ a few MB |
| Egress | 5 GB/month | App bundle ≈ 110 KB gzipped → roughly 45,000 page loads |
| Monthly active users | 50,000 | Under 100 |
| Edge function calls | 500,000 | A few hundred invites a month |
| File storage | 1 GB | Only content images today |

You would pay for **backups and uptime**, not for scale. That distinction matters: the
cost will not grow as you add cities.

### Full production cost sheet

| Item | Plan | Cost |
|---|---|---|
| Supabase | Free (Pro $25/mo optional later) | **₹0** |
| Hosting — Cloudflare Pages | Free | ₹0 |
| Access control — Cloudflare Zero Trust, ≤ 50 users | Free | ₹0 |
| Edge Functions (invites) | Included | ₹0 |
| Domain name | Registrar | ~₹1,000/year |
| Transactional email | Not required — see §3 | ₹0 |
| **Total to launch** | | **₹0/month + ~₹1,000/year for the domain** |

### The one thing that would blow the budget

**SMS OTP.** If "OTP" means a code by SMS, that is the one choice here with per-message
cost and no free tier — plus, in India, transactional SMS requires DLT registration of
sender IDs and templates with TRAI, which is a compliance exercise before the first
message sends.

§3 achieves OTP login **without SMS**, at zero cost. I would avoid SMS entirely unless a
specific requirement forces it.

### Cost guardrails to set on day one

1. Turn on **spend caps** in Supabase so overage suspends rather than bills.
2. Watch database size and egress monthly; both are visible on the project dashboard.
3. Keep images in Storage or a CDN, never as database rows — the fastest way to eat 500 MB.
4. Do not enable Point-in-Time Recovery ($100/month) — daily backups are sufficient here.

---

## 3. OTP login for admins, free of charge

### Recommendation: Cloudflare Access one-time PIN, in front of the ops portal

Cloudflare Zero Trust's free plan covers **up to 50 users** and includes **one-time PIN by
email** as a built-in identity provider — no separate IdP, no code, no messaging cost. The
PIN expires 10 minutes after it is requested.

How it behaves:

```
staff member opens ops.yourdomain.com
        │
        ▼
Cloudflare Access  ── email not on the allow-list ──▶ blocked, app never loads
        │  enters email → receives 6-digit PIN → enters PIN
        ▼
Ops portal loads
        │
        ▼
Supabase auth  ── role decides admin / manager / staff portal
```

Two independent gates. Even if a Supabase password leaks, the attacker never reaches the
login page. And the portal stops being publicly reachable at all, which today it is.

**Why this over building OTP into the app:**

| Approach | Cost | Effort | Notes |
|---|---|---|---|
| **Cloudflare Access one-time PIN** | Free ≤50 users | ~2 hours, config only | Blocks before the app loads. Recommended. |
| Supabase email OTP / magic link | Free, but needs SMTP | ~1 day | Supabase's built-in email sender is rate-limited and unsuitable for production, so it pulls in Resend or Brevo. |
| Supabase TOTP MFA (authenticator app) | Free, no messaging | ~1–2 days | Good *second* factor for admins specifically. No email dependency at all. |
| SMS OTP | Per message + DLT registration | ~3 days | Avoid. |

### Suggested layering

1. **Cloudflare Access OTP** on `ops.` — everyone, immediately, free.
2. **Supabase TOTP MFA** for `role = 'admin'` only — a later hardening step, still free,
   and it protects against a stolen laptop with a live Cloudflare session.

Access also gives a free audit log of who authenticated and when, which is useful when a
manager disputes an action.

### One caveat

Cloudflare Access sits in front of a **hostname**, so this requires the ops portal to be
its own subdomain (§4). It cannot protect `/ops/` as a path on a shared domain — another
reason to split the hosts.

---

## 4. Hosting on a proper hostname

Today both apps are one GitHub Pages site, so the ops portal is a path, not a host. A
Pages site takes one custom domain, so this layout can produce `care.example.com/ops/` but
never `ops.example.com`.

**Recommendation: Cloudflare Pages, two projects from the same repo.**

| Project | Build | Domain |
|---|---|---|
| patient | `npm run build` at root | `www.yourdomain.com` |
| ops | `npm run build` in `admin/` | `ops.yourdomain.com` |

Free, and it unlocks three things: separate origins (session storage isolated), Cloudflare
Access on `ops.` only, and independent cache and deploy control. Roughly half a day
including DNS and replacing the Pages workflow.

---

## 5. When a manager leaves

Today this is handled badly, and one part is a genuine defect.

### What happens now

Deactivating a manager sets `is_active = false`. Their staff keep
`assigned_manager_id` pointing at the deactivated record. The result:

- The manager immediately loses access to their team — `current_manager_id()` requires
  `is_active`, so they see "No manager record". **This part is correct.**
- **Their staff are silently orphaned.** They still display under the departed manager's
  name, no active manager can see or edit them, and the dashboard does *not* flag it —
  `unassigned_staff` only counts `assigned_manager_id IS NULL`, and these are not null.
  They are invisible.
- Their login still works. Nothing revokes the auth user.

So a departure today leaves staff in a state where nobody can manage them and nothing
warns anyone. That needs fixing before real managers exist.

### Proposed: a guided offboarding flow

One action on the Managers tab — **Offboard** — that runs as a single transaction:

```
Offboard: Priya Nair (Bhopal, 8 staff)

  Reassign 8 staff to  ▼ [ Sunil Rao — Bhopal, 3 staff ]
                          [ Leave unassigned (admin will place them) ]

  Reason  [ Resigned, last day 30 Aug ]

  ☑ Revoke portal access immediately

  [ Offboard ]
```

Behind it, an RPC that:

1. Moves every staff member to the replacement, writing one
   `staff_transfer_history` row each — so the handover is auditable.
2. Sets the manager `is_active = false`, preserving the record and its history.
3. Revokes the login (Edge Function disables the auth user, §6). The person keeps
   existing as a record; they simply cannot sign in.
4. Records who offboarded whom, and when.

### Handling the messy cases

| Situation | Behaviour |
|---|---|
| **No replacement yet** | Choose "leave unassigned". Staff go to `assigned_manager_id = NULL`, which the dashboard already warns about, and the city appears under "no manager covering". Visible, not silent. |
| **Sudden departure, no handover** | Same flow, run by an admin. Nothing depends on the departing manager cooperating. |
| **Temporarily away (leave, illness)** | Do *not* offboard. Add a `covering_manager_id` to `location_managers`, so a colleague sees the team temporarily while the original keeps the record and returns. Small change; worth doing with the offboarding work. |
| **Splitting a team between two managers** | Offboard reassigns in bulk to one manager; the admin then moves individuals on the Staff tab. Bulk-select is a later refinement. |
| **Manager returns later** | Reactivate the record and reassign staff. History is intact because nothing was deleted. |

### Two defects to fix alongside

1. **Dashboard must count staff whose manager is inactive** as needing attention, not just
   those with a null manager. This is the silent-orphan bug above.
2. **Re-enable the audit trail.** With Transfers hidden, reassignment through Edit writes
   no history. Offboarding depends on that trail, so the Transfers tab should come back
   as a read-only history view when this work lands.

---

## 6. The release blocker: an admin cannot create a login

Creating an auth user needs the `service_role` key, which can never ship in a browser. So
today onboarding takes three steps, two needing a developer: add the manager in the portal,
create the auth user in the Supabase dashboard, then run SQL to set the role and link
`user_id`.

**Fix:** a Supabase Edge Function holding the key, callable only by an admin, that creates
the user, sets the role, links the operational record and returns a one-time set-password
link. The admin sends that link over **WhatsApp** — which is how this business already
communicates — so no transactional email provider is needed at all.

The same function provides **revoke**, which offboarding (§5) depends on.

---

## 7. Patient data in a later phase

The architecture absorbs it as an extension, not a rewrite, for three reasons: the
city → manager → staff hierarchy is already the spine and patients hang off it unchanged;
`is_admin()` / `is_manager()` / `current_manager_id()` already express the ownership rules
patient policies need; and `orders` already collects patient-shaped data (name, phone,
address, city), so existing leads can be promoted into patient records.

`patients`, entered by a manager: contact details, address, `city_slug`, `area`,
`assigned_manager_id`, `status` (`prospect` / `active` / `paused` / `closed`),
`service_type`, `started_on`, `last_service_on`, notes, provenance.

**Active customers** then fall out of `status = 'active'`, per city, on the same dashboard.

**One constraint to hold: contact and service data only — no clinical data.** No diagnoses,
medications or vitals. Storing health records changes the compliance surface materially
under India's DPDP Act. Phase 1 avoided this deliberately and Phase 2 should too; when
clinical data becomes genuinely necessary it deserves its own design review.

Patients will also need a duplicate check on phone number, and a real erasure path — DPDP
gives a right to deletion, and that is far cheaper designed in than retrofitted.

---

## 8. Phasing

### Phase 1 — staff and location management ✅ complete and deployed

### Phase 1.5 — production readiness *(~1 week)*
The gate for a real pilot.

| # | Item | Effort |
|---|---|---|
| 1 | Invite and revoke via Edge Function — **the blocker** | 1.5 d |
| 2 | Cloudflare Pages, `ops.` subdomain, DNS | 0.5 d |
| 3 | Cloudflare Access one-time PIN on `ops.` | 2 h |
| 4 | Manager offboarding flow, plus the two defects in §5 | 1.5 d |
| 5 | Backup + keep-alive secrets set, one tested restore | 2 h |
| 6 | Delete test accounts and data; raise password policy | 1 h |

**Exit:** an admin onboards a Bhopal manager unaided, that manager logs in through OTP, and
offboarding them reassigns their team cleanly.

### Phase 2 — patients and active customers *(1–1.5 weeks)*
`patients` table with RLS mirroring the staff model; manager screens to add and maintain
them; status lifecycle; active-customer reporting per city; link existing orders by phone.

### Phase 3 — visits and scheduling *(2–3 weeks)*
The `visits` table connecting patient, staff and time. Prerequisite for a staff day view,
check-in/out, and anything patient-facing. Deferred, but it is the centre of the product.

### Phase 4 — patient self-service *(later)*
Only worth building on Phase 3.

---

## 9. Decisions needed

1. **Domain name** for the portals (`ops.` + `www.`).
2. **Supabase Pro** — not needed at launch; the backup and keep-alive workflows cover it.
   Revisit when real patient records exist.
3. **Cloudflare Access** — confirm OTP-before-app for the ops portal.
4. **TOTP MFA for admins** — now, or a later hardening pass?
5. **Pilot city** — Bhopal assumed.
6. **Old cities** — deactivate Mumbai, Pune, Bengaluru and Delhi, and remove the test
   records sitting in them?

---

## Sources

- [Supabase pricing](https://supabase.com/pricing) — free tier limits, pausing after one
  week of inactivity, absence of backups, Pro at $25/month
- [Cloudflare One — one-time PIN login](https://developers.cloudflare.com/cloudflare-one/identity/idp-integration/one-time-pin) — built-in email PIN identity provider
- [Cloudflare Zero Trust free plan limits (2026)](https://zerometric.net/research/cloudflare-zero-trust-free-plan-limits-2026/) — 50 users on the free plan
