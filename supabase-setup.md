# Supabase setup for Pari Home Healthcare (free tier, ~10 minutes)

## 1. Create the project
1. Go to https://supabase.com and sign in with GitHub or email (free).
2. **New project** -> organization -> name `pari-homehealthcare`.
3. Set a database password (store it in a password manager; the app never uses it).
4. Region: pick the one closest to your users (e.g. `ap-south-1` Mumbai for India).
5. Plan: **Free**. Wait ~2 minutes for provisioning.

## 2. Load the schema
1. Open **SQL Editor** -> **New query**.
2. Paste the whole contents of `supabase-schema.sql` from the repo and click **Run**.
3. This creates the tables (cities, hero_banners, quick_actions, services, products, reviews,
   social_links, home_sections, orders, profiles), the RLS policies, the `get_home_content` RPC and
   the seed content. It is safe to re-run.

## 3. Get the app credentials
**Project Settings -> API**:
- **Project URL** -> `SUPABASE_URL` (e.g. `https://abcdefgh.supabase.co`)
- **anon / public** key -> `SUPABASE_ANON_KEY`

Only the anon key goes into the app. Never ship the `service_role` key.

## 4. Run the app against it
```bash
flutter run -d chrome \
  --dart-define=SUPABASE_URL=https://<project-ref>.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=<anon-key>
```

## 5. Replace the placeholder content
In **Table Editor**:
- `cities`: your real cities, each with `support_phone` and `whatsapp_number`.
- `services` / `products`: real names, descriptions, prices and image URLs.
- `hero_banners`: real campaign banners.
- `social_links`: your real Facebook/Instagram/YouTube/WhatsApp URLs.
- `home_sections`: change `sort_order` / `is_active` to reorder or hide a section on the home screen.

For images, use **Storage** -> create a public bucket `content` -> upload -> copy the public URL into
the `image_url` column. Free tier includes 1 GB of storage.

## 6. Where orders arrive
App orders land in the `orders` table (`status = 'pending'`). Until the manager console is built,
triage them in the Supabase Table Editor: set `assigned_staff`, move `status` through
`assigned -> in_progress -> completed`.

## Cost
Everything above is the Supabase free tier: $0/month. The first paid step, only when traffic
requires it, is Supabase Pro at $25/month.
