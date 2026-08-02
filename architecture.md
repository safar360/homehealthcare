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
Flutter app (single codebase)
├── Patient app        -> Android / iOS / responsive web
├── Staff app          -> phase 2, same codebase
└── Manager/Admin web  -> phase 3, same codebase
             |
             |  HTTPS (PostgREST + RPC), anon key for public content
             v
Supabase project (free tier)
├── Postgres            content, services, products, reviews, orders, profiles
├── PostgREST API       auto-generated REST for every table + get_home_content() RPC
├── Auth                email/OTP login, role stored on profiles.role
├── Storage             banner/service/product images, documents
└── Edge Functions      dispatch + notification logic (phase 2+)
             |
             v
Cloudflare Pages (free) - static hosting of the Flutter web build
Firebase Cloud Messaging (free) - push notifications
Play Store / App Store - mobile distribution
```

No application server, no container, no VM, no load balancer. The Flutter client is the only
compute the business pays nothing for, and Supabase is the single backend.

## 3. Why this is the cheapest workable stack
- **One backend product.** Supabase bundles Postgres, REST, auth, storage and functions. Using
  managed pieces from different vendors would add per-service minimums.
- **No middle tier.** The client calls PostgREST directly; row level security replaces a bespoke
  API layer, so there is nothing to host or scale.
- **One RPC per screen.** `get_home_content(p_city_slug)` returns the entire home screen as a single
  JSON document, so the free-tier request/egress budget goes a long way and the app renders in one
  round trip on slow mobile networks.
- **Static hosting.** A Flutter web build is static files; Cloudflare Pages serves them free with a
  global CDN and free TLS.
- **Images stay out of the database.** Content rows hold URLs; images live in Supabase Storage (or
  any CDN), which keeps table size and backup cost small.
- **Content as data.** Banners, sections, services, products, reviews and social links are rows, so
  changes cost an UPDATE instead of an app release and a review cycle.

## 4. Cost model

| Component | Plan | Monthly cost |
|---|---|---|
| Supabase (Postgres, auth, storage, functions) | Free tier | $0 |
| Cloudflare Pages (Flutter web hosting) | Free tier | $0 |
| Firebase Cloud Messaging | Free | $0 |
| Transactional email (Resend/Brevo) | Free tier | $0 |
| Google Play developer account | One-time | $25 one-time |
| Apple developer account (only if iOS is needed) | Annual | $99/year |
| Domain name | Registrar | ~$10/year |

First paid step, only when traffic demands it: Supabase Pro at $25/month. Everything else stays free.

## 5. Apps and clients
Single Flutter codebase, three role-driven experiences:
- **Patient app (phase 1, this repo):** dynamic home screen, service discovery, order capture,
  call/WhatsApp contact.
- **Staff app (phase 2):** assigned visits, GPS check-in/check-out, status updates.
- **Manager/admin console (phase 3):** order triage, staff assignment, content management. The
  console can start as the Supabase dashboard/table editor, which costs nothing, and graduate to a
  Flutter web screen when needed.

## 6. Data model
Defined in `supabase-schema.sql`:

| Table | Purpose |
|---|---|
| `profiles` | user identity and role (`patient`, `staff`, `manager`, `admin`) |
| `cities` | serviceable cities with per-city support phone and WhatsApp number |
| `home_sections` | order/visibility/titles of home screen sections |
| `hero_banners` | carousel banners, optionally city-specific |
| `quick_actions` | top navigation shortcuts (call, WhatsApp, URL) |
| `services` | service catalogue with image, pricing, contact numbers |
| `products` | other products such as diapers, beds, oxygen concentrators |
| `reviews` | customer testimonials |
| `social_links` | social media profiles |
| `orders` | orders/leads captured from the app for services and products |

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

If the build has no Supabase credentials, or the network call fails, the app falls back to the
bundled demo content (`lib/data/demo_content.dart`), which mirrors the SQL seed data. Marketing can
therefore demo the app and developers can work offline without a backend.

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
- Row level security is enabled on every table.
- Content tables: public `select` limited to `is_active = true`; writes only through the Supabase
  dashboard/service role.
- `orders`: anonymous `insert`; `select`/`update` restricted to staff roles via the `is_staff()`
  security-definer helper.
- `profiles`: users read/update their own row; staff can read all.
- Only the anon key ships in the client. The service role key never leaves the Supabase dashboard.
- Phase 1 deliberately stores no clinical measurements, keeping compliance scope small.

## 10. Environments, build and deployment
Credentials are compile-time constants, so no secrets file ships with the app:

```bash
flutter run -d chrome \
  --dart-define=SUPABASE_URL=https://<project-ref>.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=<anon-key>

flutter build web --release \
  --dart-define=SUPABASE_URL=https://<project-ref>.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=<anon-key>
```

Deploy `build/web` to Cloudflare Pages (free) and ship the same codebase to Play Store/App Store via
`flutter build appbundle` / `flutter build ipa`. Use two Supabase projects (staging and production)
on the free tier to keep environments separate at no cost.

## 11. Scaling path
- Add caching headers/CDN in front of `get_home_content` if content reads grow.
- Move dispatch and notification logic into Edge Functions instead of a server.
- Introduce Supabase Realtime for live staff ETA when phase 2 starts.
- Upgrade to Supabase Pro only when free-tier database size, egress or connection limits bind.

## 12. Roadmap
- **Phase 1 (now):** dynamic patient home screen, service and product ordering, contact CTAs.
- **Phase 2:** patient login, order history, staff app with GPS check-in, FCM notifications.
- **Phase 3:** manager/admin console, scheduling, invoicing, reporting.
