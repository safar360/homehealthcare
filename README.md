# Pari Home Healthcare

Flutter app (mobile + responsive web) for a home healthcare service, backed by a single Supabase
project. See [architecture.md](architecture.md) for the solution design and cost model,
[requirements.md](requirements.md) and [prd.md](prd.md) for scope.

## Patient home screen
Every section is driven by the backend (`get_home_content` RPC) and ordered by the `home_sections`
table: city picker with call/WhatsApp in the top bar, auto-scrolling hero banner carousel, quick
actions, services with WhatsApp/Call/Order CTAs, customer reviews, other products, and social links.
Ordering opens a form (name, phone, city, location, preferred time, note) and writes to `orders`.

## Backend setup
1. Create a free Supabase project.
2. Run `supabase-schema.sql` in the SQL editor. It creates the tables, RLS policies, the
   `get_home_content` RPC and seed content, and is safe to re-run.
3. Edit content (banners, services, products, reviews, cities, social links) from the Supabase table
   editor - no app release is needed.

## Run the app
```bash
flutter pub get
flutter run -d chrome \
  --dart-define=SUPABASE_URL=https://<project-ref>.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=<anon-key>
```

Without the `--dart-define` values the app renders bundled demo content that mirrors the SQL seed
data, so the UI can be reviewed without a backend.

## Build
```bash
flutter build web --release --dart-define=SUPABASE_URL=... --dart-define=SUPABASE_ANON_KEY=...
flutter build appbundle --dart-define=SUPABASE_URL=... --dart-define=SUPABASE_ANON_KEY=...
```

## Checks
```bash
flutter analyze
flutter test
```
