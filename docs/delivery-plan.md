# Delivery plan — operations portal release and patient data

**Date:** 2026-08-14
**Status:** proposal for review. No development against this yet.

Answers four questions: how to host the operations portal on a proper domain, whether it
is ready to release, whether the architecture can absorb patient data later, and what the
phasing should be.

---

## 1. Where we are today

| Area | State |
|---|---|
| Cities | Admin-managed. Bhopal, Indore, Gwalior, Jabalpur seeded |
| Staff roles | Admin-managed table (was a hard-coded enum) |
| Managers | Full CRUD, scoped to a city, with named areas |
| Staff | Full CRUD, role, city, area, qualifications, availability, reporting manager |
| Admin dashboard | Location-wise coverage table, uncovered-city and unassigned-staff warnings, breakdowns |
| Manager portal | Own team only, enforced by RLS |
| Staff portal | Own record and availability |
| Patient app | Service catalogue plus anonymous order capture |
| Security | RLS on every table, role helpers, column guards, RPC authorisation |
| Hosting | One GitHub Pages site: patient at `/`, ops at `/ops/` |

Verified against the live Supabase project by driving each portal in a browser.

---

## 2. Hosting the operations portal on a proper hostname

### The constraint

Today both apps are one GitHub Pages site, so the ops portal is a **path**
(`…/ops/`), not a host. A GitHub Pages site takes exactly one custom domain, so this
layout cannot produce `ops.yourdomain.com` — it can only produce
`yourdomain.com/ops/`.

### Options

**A. Custom domain on the current setup — cheapest**
Point a domain at the existing Pages site. Result: `care.example.com/` and
`care.example.com/ops/`. One CNAME record plus a `CNAME` file in the repo. Free, ~30
minutes, TLS automatic.
*Weakness:* the ops portal shares an origin with the public site, so it cannot be
firewalled separately, and its URL always looks like part of the public product.

**B. Separate subdomain — recommended**
Move hosting to **Cloudflare Pages** with two projects from the same repo:

| Project | Build | Domain |
|---|---|---|
| patient | `npm run build` at root | `www.example.com` |
| ops | `npm run build` in `admin/` | `ops.example.com` |

Still free. Two advantages that matter for an internal tool:

1. **Separate origin.** Session storage, cookies and any future CSP are isolated. A
   mistake in the public site cannot reach ops-portal storage.
2. **Cloudflare Access in front of `ops.`** — free for up to 50 users. Staff authenticate
   to Cloudflare (Google/email OTP) *before* the app even loads, so the portal is not
   publicly reachable at all. Supabase auth then runs behind it. That is real defence in
   depth for a tool holding staff and, later, patient data.

**C. Vercel** — same shape as B, better preview deployments, no equivalent of Cloudflare
Access on the free tier.

### Recommendation

**Option B.** The extra work is roughly half a day: two Cloudflare Pages projects, DNS,
and a `wrangler`-based workflow replacing the Pages one. The Access layer alone justifies
it once the portal holds real staff records — and it is much cheaper to do before a
custom domain is published than after.

---

## 3. Is the operations portal ready to release?

**Functionally yes, operationally no.** It collects manager and staff data correctly, and
that has been verified end to end. But four things must be fixed before real users touch
it.

### 3.1 Blocker — an admin cannot create a login

This is the significant one. Onboarding a manager today takes three steps, two of which
need a developer:

1. Admin adds the manager in the portal ✅
2. Someone creates the auth user in the Supabase dashboard ❌
3. Someone runs SQL to set `profiles.role` and link `location_managers.user_id` ❌

So the portal can record a manager but cannot give them access. **The portal is not
self-sufficient**, and every onboarding needs engineering support.

**Fix:** a Supabase Edge Function holding the `service_role` key that, given a name, email
and role, creates the auth user, sends an invite email, sets the role and links the
operational record — all in one action, callable only by an admin. Roughly two days
including the "resend invite" and "deactivate access" paths.

The `service_role` key must live in the Edge Function only. It can never reach either
browser app.

### 3.2 Blocker — test accounts and data are live and public

`test_admin@gmail.com` and `test_manager@gmail.com` both use `123456` and work from the
open internet. Test records (Priya Nair, Sunil Rao, Ravi Kumar, two orders) are in the
production database.

**Fix:** delete both accounts and the test rows, raise the password minimum in
Authentication → Providers → Email, and turn on leaked-password protection.

### 3.3 Should fix — reassignment leaves no audit trail

With the Transfers tab hidden, moving a staff member happens through Edit, which writes
directly and skips `staff_transfer_history`. The RPCs and the table are still there, so
this is a UI-only change whenever you want the trail back.

### 3.4 Should fix — no operational safety net

No error monitoring, and Supabase free-tier backups have not been tested with a restore.
Both are small tasks worth doing before real data accumulates.

### Verdict

Ship it to a **pilot in one city** (Bhopal) once 3.1 and 3.2 are done — roughly **3–4 days**.
A pilot exercises real onboarding without betting the whole operation on an untested
workflow.

---

## 4. Can the architecture absorb patient data?

**Yes, as an extension rather than a rewrite.** Three reasons:

1. **The city → manager → staff hierarchy is already the spine.** Patients hang off the
   same spine: a patient belongs to a city and an area, and is owned by a manager. No new
   organising concept is needed.
2. **Authorisation generalises.** `is_admin()`, `is_manager()` and `current_manager_id()`
   already express "admins see everything, managers see their own patch". Patient policies
   reuse them directly.
3. **Order capture already collects patient-shaped data.** `orders` holds name, phone,
   address and city. A patient record is that data, promoted from a one-off lead into a
   durable entity — so there is a natural migration path from existing orders.

### Proposed model

```
cities ──< location_managers ──< location_staff
   │              │
   └──────────────┴──< patients ──< patient_service_history
                            │
                          orders (patient_id, nullable)
```

`patients`, entered by a manager:

| Field | Purpose |
|---|---|
| `full_name`, `phone_number`, `alt_phone` | contact |
| `address`, `city_slug`, `area` | location, matching the staff area model |
| `assigned_manager_id` | ownership, drives RLS |
| `status` | `prospect` / `active` / `paused` / `closed` — this is the "active customer" flag |
| `service_type` | which service they are on |
| `started_on`, `last_service_on` | tenure and recency |
| `notes` | free text |
| `created_by`, timestamps | provenance |

**Active customers** then fall out of a single query: `status = 'active'`, optionally
filtered by recency. The admin dashboard gains patients-per-city and active-vs-total
alongside the existing coverage table.

### One deliberate constraint

Keep **contact and service data only — no clinical data.** No diagnoses, medications, or
vitals. The moment health records are stored, the compliance surface changes materially
(India's DPDP Act, and hospital contracts often demand more). Phase 1 avoided this on
purpose and Phase 2 should hold the line. When clinical data genuinely becomes necessary
it deserves its own design review, not an incremental column.

### Risks to watch

- **Patient logins are a later, separate decision.** Managers entering patient records is
  much simpler than patients authenticating. Do not conflate them.
- **Duplicate patients** across managers will need a phone-number match on entry.
- **Deletion and consent.** DPDP gives a right to erasure; soft-delete plus a real purge
  path should be designed in from the start rather than retrofitted.

---

## 5. Phasing

### Phase 1 — staff and location management *(essentially complete)*
Cities, roles, managers, staff, location-wise dashboard, three role-themed portals.
Remaining: verify the current build against the live database, then merge.

### Phase 1.5 — release readiness *(3–4 days)*
1. Admin-driven user invitation via Edge Function — **the blocker**
2. Remove test accounts and data; harden the password policy
3. Cloudflare Pages with `ops.` subdomain and Cloudflare Access
4. Error monitoring and one tested backup restore

**Exit:** a manager in Bhopal is onboarded by an admin, with no developer involved.

### Phase 2 — patients and active customers *(1–1.5 weeks)*
1. `patients` table with RLS mirroring the staff model
2. Manager portal: add, edit, list, search patients in their own area
3. Status lifecycle: prospect → active → paused → closed
4. Admin dashboard: patients and active customers per city
5. Link existing `orders` to patient records where the phone number matches

**Exit:** an admin can see active customers per city, sourced from managers.

### Phase 3 — visits and scheduling *(2–3 weeks)*
The `visits` table connecting patient, staff and time. This is what turns an order into
scheduled work, and it is the prerequisite for a staff day view, check-in/out, and any
patient-facing schedule. Deliberately deferred, but it is the centre of the product and
everything operational eventually routes through it.

### Phase 4 — patient self-service *(later)*
Patient login, care plan and visit visibility. Only worth building on top of Phase 3.

---

## 6. Decisions needed before Phase 1.5 starts

1. **Domain name** — what should the ops portal live at? (`ops.<something>`)
2. **Hosting move** — confirm Cloudflare Pages, or stay on GitHub Pages with a path.
3. **Cloudflare Access** — put the ops portal behind an org login, or rely on Supabase
   auth alone?
4. **Invite email sender** — Supabase's built-in sender is rate-limited and unsuitable for
   production; Resend or Brevo free tier is the usual answer. Needs a domain to send from.
5. **Pilot city** — Bhopal assumed.

---

## 7. Estimate

| Phase | Effort | Delivers |
|---|---|---|
| 1 | ~complete | Staff and location management |
| 1.5 | 3–4 days | A releasable ops portal on its own domain |
| 2 | 1–1.5 weeks | Patient records and active-customer reporting |
| 3 | 2–3 weeks | Visits and scheduling |

Infrastructure stays at **₹0/month** through Phase 2 on Supabase and Cloudflare free
tiers. The first likely cost is a transactional email plan once invite volume grows, plus
the domain itself.
