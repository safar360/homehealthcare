# Pari Home Healthcare - Solution Architecture (minimum infrastructure cost)

## Table of Contents
- [1. Goal](#1-goal)
- [2. Architecture at a glance](#2-architecture-at-a-glance)
- [3. Why this is the cheapest workable stack](#3-why-this-is-the-cheapest-workable-stack)
- [4. Cost model](#4-cost-model)
- [5. Apps and clients](#5-apps-and-clients)
- [6. Data model](#6-data-model)
- [7. Backend-driven patient home screen](#7-backend-driven-patient-home-screen)
- [8. Order capture flow](#8-order-capture-flow)
- [9. Security model](#9-security-model)
- [10. Environments, build and deployment](#10-environments-build-and-deployment)
- [11. Scaling path](#11-scaling-path)
- [12. Roadmap](#12-roadmap)

## 1. Goal
Run a home healthcare platform for patients/families, field staff, managers and admins with
close to zero fixed infrastructure spend, while keeping every screen's content editable from the
backend so marketing and operations never wait for an app release.

## 2. Architecture at a glance

```
React + TypeScript + Vite (two apps)
├── Patient app (src/)     -> responsive web, anonymous
└── Operations portal      -> responsive web, signed in
    (admin/)                  admin / manager / staff, routed on profiles.role
             |
             |  HTTPS (PostgREST + RPC), anon key only
             v
Supabase project (free tier)
├── Postgres            content, services, products, reviews, orders,
│                       profiles, location_managers, location_staff
├── PostgREST API       auto-generated REST for every table + RPCs
├── Auth                email/password login, role on profiles.role
├── Storage             banner/service/product images, documents
└── Edge Functions      dispatch + notification logic (not built yet)
             |
             v
Cloudflare Pages (free) - static hosting of both web builds
Firebase Cloud Messaging (free) - push notifications (not built yet)
```

No application server, no container, no VM, no load balancer. The browser is the only compute, and
Supabase is the single backend. Row level security replaces a bespoke API layer.

The project originally carried a Flutter codebase alongside these apps, duplicating the patient home
screen in two languages. It was removed in favour of React web; mobile, if it is needed later,
should be a PWA or React Native rather than a second implementation of every screen.

## 3. Why this is the cheapest workable stack
- **One backend product.** Supabase bundles Postgres, REST, auth, storage and functions. Using
  managed pieces from different vendors would add per-service minimums.
- **No middle tier.** The client calls PostgREST directly; row level security replaces a bespoke
  API layer, so there is nothing to host or scale.
- **One RPC per screen.** `get_home_content(p_city_slug)` returns the entire home screen as a single
  JSON document, so the free-tier request/egress budget goes a long way and the app renders in one
  round trip on slow mobile networks.
- **Static hosting.** A Vite build is static files; Cloudflare Pages serves them free with a
  global CDN and free TLS.
- **Images stay out of the database.** Content rows hold URLs; images live in Supabase Storage (or
  any CDN), which keeps table size and backup cost small.
- **Content as data.** Banners, sections, services, products, reviews and social links are rows, so
  changes cost an UPDATE instead of an app release and a review cycle.

## 4. Cost model

| Component | Plan | Monthly cost |
|---|---|---|
| Supabase (Postgres, auth, storage, functions) | Free tier | $0 |
| Cloudflare Pages (static hosting, both apps) | Free tier | $0 |
| Firebase Cloud Messaging | Free | $0 |
| Transactional email (Resend/Brevo) | Free tier | $0 |
| Google Play developer account | One-time | $25 one-time |
| Apple developer account (only if iOS is needed) | Annual | $99/year |
| Domain name | Registrar | ~$10/year |

First paid step, only when traffic demands it: Supabase Pro at $25/month. Everything else stays free.

## 5. Apps and clients
Two React apps, four role-driven experiences:
- **Patient app (`src/`):** dynamic home screen, service discovery, order capture, call/WhatsApp
  contact. Anonymous — no login.
- **Operations portal (`admin/`):** one app, three views selected by `profiles.role`.
  - *Admin:* dashboard, manager and staff management, transfers, audit trail.
  - *Manager:* their own team.
  - *Staff:* their own record and availability.

Order triage still happens in the Supabase table editor, which costs nothing; it graduates into the
ops portal when the visit model exists.

## 6. Data model
Defined in `supabase-schema.sql`, a single authoritative and re-runnable file:

| Table | Purpose |
|---|---|
| `profiles` | user identity and role (`patient`, `staff`, `manager`, `admin`); `id` is the auth user id |
| `cities` | serviceable cities with per-city support phone and WhatsApp number |
| `home_sections` | order/visibility/titles of home screen sections |
| `hero_banners` | carousel banners, optionally city-specific |
| `quick_actions` | top navigation shortcuts (call, WhatsApp, URL) |
| `services` | service catalogue with image, pricing, contact numbers |
| `products` | other products such as diapers, beds, oxygen concentrators |
| `reviews` | customer testimonials |
| `social_links` | social media profiles |
| `orders` | orders/leads captured from the app for services and products |
| `location_managers` | operational record for a manager, linked to a profile |
| `location_staff` | operational record for a field staff member |
| `staff_transfer_history` | audit trail of staff movements |
| `staff_performance` | ratings and review notes |

There is deliberately no `admins` table: an admin is a profile with `role = 'admin'`, resolved
through security-definer helpers (`is_admin()`, `is_manager()`, `is_staff()`,
`current_manager_id()`). An earlier `admins` table had a policy that queried `admins` from within a
policy on `admins`, which Postgres rejects as infinite recursion.

`get_home_content(p_city_slug)` aggregates every content table into one JSON payload, filtered by
city, ordered by `sort_order`, and limited to `is_active` rows.

## 7. Backend-driven patient home screen
The home screen renders whatever the backend returns, in the order `home_sections` specifies:
1. **Top bar:** current city picker (from `cities`) plus call and WhatsApp actions.
2. **Hero banners:** auto-scrolling horizontal carousel with page indicators and a CTA per banner.
3. **Quick actions:** call / WhatsApp / emergency shortcuts.
4. **Our services:** image, title, short description and three CTAs - WhatsApp, Call, Order.
5. **Customer reviews:** horizontal testimonial carousel with ratings.
6. **Other products:** grid of products (diapers, hospital bed, oxygen concentrator, wheelchair)
   with Order and WhatsApp actions.
7. **Social links:** icon row opening the configured profiles.

If the build has no Supabase credentials, or the network call fails, the app falls back to demo
content bundled in `src/App.tsx`, which mirrors the SQL seed data. Marketing can therefore demo the
app and developers can work offline without a backend. The ops portal has no such fallback — it
needs a real project to sign in against, and says so rather than failing obscurely.

## 8. Order capture flow
1. Patient taps **Order** on a service or product.
2. A bottom sheet collects name, phone number, city, location/address, preferred time and note, with
   client-side validation.
3. The app inserts a row into `orders` through PostgREST (`item_type` distinguishes service from
   product orders).
4. Managers see the order in the Supabase dashboard, or later in the admin console, assign staff and
   move `status` through `pending -> assigned -> in_progress -> completed`.

Anonymous insert is allowed so a family can order without creating an account; reads and updates
require a staff/manager/admin profile.

## 9. Security model
- Row level security is enabled on every table, and it is the only authorisation layer — the ops
  portal's role routing is convenience, not a control.
- Content tables: public `select` limited to `is_active = true`; writes require `is_admin()`.
- `orders`: anonymous `insert` so a family can order without an account; `select`/`update`
  restricted to `is_staff()`.
- `profiles`: users read/update their own row; staff can read all; admins can write all.
- Staff hierarchy: an admin sees everything, a manager sees and edits only their own team
  (`assigned_manager_id = current_manager_id()`), a staff member sees only their own record.
- The role helpers are `security definer` with a pinned `search_path`, so a policy can call them
  without recursing into the policy it is evaluating.
- Every `security definer` RPC checks the caller's role itself, because it bypasses RLS by
  definition. Transfers are additionally revoked from `anon`.
- Only the anon key ships in the client. The service role key never leaves the Supabase dashboard.
- Phase 1 deliberately stores no clinical measurements, keeping compliance scope small.

## 10. Environments, build and deployment
Credentials come from Vite env files, which are gitignored. Each app reads its own, because Vite
resolves env files from the app root:

```bash
cp .env.example .env.local              # patient app
cp admin/.env.example admin/.env.local  # ops portal

npm install && npm run dev              # patient app -> :3000
cd admin && npm install && npm run dev  # ops portal  -> :4000

npm run build                           # tsc -b && vite build
```

`VITE_SUPABASE_URL` is the bare project URL; supabase-js appends `/rest/v1` itself.

Deploy each `dist/` to Cloudflare Pages (free) — the patient app on the apex domain, the ops portal
on a subdomain such as `ops.` so the two are separately routable. Use two Supabase projects
(staging and production) on the free tier to keep environments separate at no cost.

## 11. Scaling path
- Add caching headers/CDN in front of `get_home_content` if content reads grow.
- Move dispatch and notification logic into Edge Functions instead of a server.
- Introduce Supabase Realtime for live staff ETA when phase 2 starts.
- Upgrade to Supabase Pro only when free-tier database size, egress or connection limits bind.

## 12. Roadmap

Done:
- Dynamic patient home screen, service and product ordering, contact CTAs.
- Operations portal with sign-in and role routing: admin, manager and staff views, staff hierarchy,
  transfers with an audit trail.

Next, in dependency order:
1. **Visit model.** A `visits` table linking a patient, a service, a staff member and a time. This
   is the missing centre of the product — order triage, the staff day view and the patient
   dashboard all need it before any of them can be built.
2. **Order triage in the portal**, replacing the Supabase table editor: order → visit → assigned
   staff.
3. **Staff day view** with check-in/check-out, then GPS verification.
4. **Patient login and dashboard:** care plan, upcoming visits, staff ETA, support requests.
5. **Notifications** via FCM, once there are status changes worth pushing.
6. **Mobile**, as a PWA or React Native — not a second implementation of every screen.

See [STATUS.md](STATUS.md) for what is and is not built today.
