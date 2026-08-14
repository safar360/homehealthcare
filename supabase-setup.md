# Supabase setup for Pari Home Healthcare (free tier, ~10 minutes)

## 1. Create the project
1. Go to https://supabase.com and sign in with GitHub or email (free).
2. **New project** → organization → name `pari-homehealthcare`.
3. Set a database password (store it in a password manager; the app never uses it).
4. Region: pick the one closest to your users (e.g. `ap-south-1` Mumbai for India).
5. Plan: **Free**. Wait ~2 minutes for provisioning.

## 2. Load the schema
1. Open **SQL Editor** → **New query**.
2. Paste the whole of `supabase-schema.sql` and click **Run**.
3. It is safe to re-run: every policy is dropped and recreated, and every table gets an
   "add column if not exists" pass.

This creates the content tables (cities, hero_banners, quick_actions, services, products, reviews,
social_links, home_sections), the staff hierarchy (profiles, location_managers, location_staff,
staff_transfer_history, staff_performance), orders, the RLS policies, the `get_home_content` RPC,
the operations RPCs, and seed content.

> If you previously ran the old `supabase-schema.sql` **or** `supabase-staff-schema.sql`, this file
> converges your database onto the merged definitions. It drops the superseded `team_members`,
> `role_assignments` and `admins` tables, and clears `orders.assigned_manager` /
> `assigned_staff_member` values that pointed at the dropped `team_members` table. Take a backup
> first if the data matters.

## 3. Create the first admin

RLS grants nobody admin rights until a profile has `role = 'admin'`, and the sign-up trigger always
creates `patient`. So the first admin is a deliberate manual step.

1. **Authentication → Users → Add user**. Give it an email and password, and tick
   *Auto Confirm User*.
2. Back in the SQL editor:
   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   ```

That account can now sign in to the operations portal. Managers and staff are onboarded from there
— see [docs/staff-management.md](docs/staff-management.md).

## 4. Get the app credentials
**Project Settings → API**:
- **Project URL** → `VITE_SUPABASE_URL` (e.g. `https://abcdefgh.supabase.co`)
- **anon / public** key → `VITE_SUPABASE_ANON_KEY`

Use the bare project URL. Appending `/rest/v1` makes every request 404, because supabase-js adds
that path itself.

Only the anon key goes into either app. Never ship the `service_role` key.

```bash
cp .env.example .env.local              # patient app
cp admin/.env.example admin/.env.local  # ops portal
```

Vite reads env files from each app's own root, so the ops portal needs its own copy.

## 5. Replace the placeholder content
In **Table Editor**:
- `cities`: your real cities, each with `support_phone` and `whatsapp_number`.
- `services` / `products`: real names, descriptions, prices and image URLs.
- `hero_banners`: real campaign banners.
- `social_links`: your real Facebook/Instagram/YouTube/WhatsApp URLs.
- `home_sections`: change `sort_order` / `is_active` to reorder or hide a section on the home screen.

For images, use **Storage** → create a public bucket `content` → upload → copy the public URL into
the `image_url` column. Free tier includes 1 GB of storage.

Content tables are admin-write only, so edits from the table editor (which uses the service role)
always work, while the anon key can only read active rows.

## 6. Where orders arrive
App orders land in `orders` with `status = 'pending'`. Anyone can insert one — a family can order
without an account — but only a signed-in staff, manager or admin can read or change one.

The operations portal manages people, not orders yet, so triage them in the Supabase table editor:
set `assigned_manager`, then move `status` through `assigned → in_progress → completed`.

## Cost
Everything above is the Supabase free tier: $0/month. The first paid step, only when traffic
requires it, is Supabase Pro at $25/month.
