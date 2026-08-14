# Project status

**Last updated:** 2026-08-14

This file replaces `PROGRESS.md` and `DELIVERY_SUMMARY.md`, which claimed the staff management
system was "COMPLETE & READY FOR DEPLOYMENT" while the admin portal had no login, the manager
portal was an unreferenced file at the repo root, and the two SQL files defined the same tables
with different columns.

## What works

### Patient app (`src/`)
- Home screen driven entirely by the `get_home_content()` RPC: city picker, hero carousel, quick
  actions, services, reviews, products, social links.
- Section order and visibility come from the `home_sections` table, so content changes need no
  release.
- Order capture: an **Order** button on every service and product opens a sheet (name, phone, city,
  address, preferred time, note) that inserts into `orders`. Anonymous — no account needed.
- Falls back to bundled demo content when Supabase credentials are absent.

### Operations portal (`admin/`)
- Email/password sign-in with a persisted session.
- Routes on `profiles.role`. A `patient` role, or an account with no profile row, is refused
  explicitly rather than shown an empty dashboard.
- **Admin:** dashboard counts, manager CRUD, staff CRUD with city/role/status/search filters,
  staff transfers between managers and between cities, transfer history.
- **Manager:** team overview and staff CRUD scoped to their own team, resolved from the signed-in
  user.
- **Staff:** own record and self-service availability.

### Database (`supabase-schema.sql`)
- One authoritative, re-runnable file. Tables, RLS, RPCs and seed content.
- Role helpers (`is_admin`, `is_manager`, `is_staff`, `current_manager_id`) are security definer
  with a pinned `search_path`, so policies that call them do not recurse.
- Every ops RPC checks the caller's role before doing anything.

## Not built

These appear in `prd.md` / `requirements.md` but do not exist in code:

- **Patient portal.** No patient login, care plan, visit schedule, staff ETA, or support-request
  flow. What exists is a service catalogue and a lead-capture form. There are no `visits`,
  `care_plans` or `appointments` tables.
- **Visit lifecycle.** Orders can be assigned to a manager, but there is no visit record, no staff
  assignment to a visit, no check-in/check-out, no GPS verification, and no status updates from the
  field.
- **Order triage UI.** The ops portal manages people, not orders. Orders still have to be worked in
  the Supabase table editor.
- **Notifications.** No FCM, no email.
- **Mobile apps.** The Flutter codebase was removed when the project consolidated on React web; the
  web apps are responsive but are not installable apps.
- **Native mobile / PWA.** Not configured.

## Verification gaps

Neither Node nor psql is installed on the machine where the current consolidation was done, so:

- `supabase-schema.sql` has **not been executed**. It needs one run in the Supabase SQL editor
  against a scratch project before being trusted, particularly the upgrade path that converges an
  existing database onto the merged table definitions.
- The two web apps have **not been built, typechecked or run** since the ops portal was
  restructured.

Both are the immediate next step.

## Suggested order of work

1. Run the schema against a scratch Supabase project; fix whatever the upgrade path gets wrong.
2. `npm install && npm run build` in both apps; fix type errors.
3. Create an admin and a manager account and walk the portal end to end.
4. Build the visit model (`visits` table, assignment, status) — it is the missing centre of the
   product, and both the staff and patient experiences depend on it.
5. Add the patient login and dashboard on top of that model.
