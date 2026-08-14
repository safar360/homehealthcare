-- Pari Home Healthcare - Supabase schema (authoritative, single file)
--
-- One Postgres database drives auth, content, staff hierarchy and orders so the
-- platform runs on the Supabase free tier with no additional infrastructure.
--
-- This file replaces the earlier supabase-schema.sql + supabase-staff-schema.sql
-- pair, which defined location_managers and location_staff twice with different
-- columns and layered contradictory RLS policies on top of each other.
--
-- Safe to re-run. Every policy is dropped and recreated, and every table gets an
-- "add column if not exists" upgrade pass, so a database created from either of
-- the previous schema files converges onto this one.
--
-- Role model
--   profiles.role          patient | staff | manager | admin  (authorisation)
--   location_managers      operational record for a manager, user_id -> profiles
--   location_staff         operational record for a field staff member
--
-- There is deliberately no separate `admins` table: an admin is a profile with
-- role = 'admin'. The previous `admins` table caused infinite RLS recursion
-- because its policy queried the very table the policy protected.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Legacy cleanup
--
-- Drop objects from the two previous schema versions that are now superseded.
-- team_members and role_assignments are replaced by location_managers /
-- location_staff; admins is replaced by profiles.role = 'admin'.
-- ---------------------------------------------------------------------------

-- Orders referenced team_members; release the constraints before the drop.
alter table if exists public.orders drop constraint if exists orders_assigned_manager_fkey;
alter table if exists public.orders drop constraint if exists orders_assigned_staff_member_fkey;

drop table if exists public.role_assignments cascade;
drop table if exists public.team_members cascade;
drop table if exists public.admins cascade;

-- Every policy in the public schema is recreated further down, so clear them all
-- first. This is what makes the file idempotent across the old schema versions.
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Staff roles
--
-- A table, not an enum. An admin adds roles from the portal at runtime, and
-- extending a Postgres enum needs DDL, so an enum would put every new role
-- behind a migration. The earlier staff_role_type enum is converted to this in
-- the upgrade pass below.
-- ---------------------------------------------------------------------------

create table if not exists public.staff_roles (
  slug text primary key,
  label text not null,
  description text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

insert into public.staff_roles (slug, label, sort_order) values
  ('nurse',            'Nurse',            1),
  ('assistant',        'Care assistant',   2),
  ('therapist',        'Therapist',        3),
  ('care_coordinator', 'Care coordinator', 4),
  ('supervisor',       'Supervisor',       5)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Identity
--
-- profiles.id is the Supabase auth user id, so auth.uid() = profiles.id. A
-- trigger on auth.users creates the row automatically on sign-up.
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key,
  full_name text not null default '',
  role text not null default 'patient' check (role in ('patient', 'staff', 'manager', 'admin')),
  email text unique,
  phone_number text,
  city_slug text,
  created_at timestamptz default now()
);

-- Older versions defaulted id to gen_random_uuid(), which silently broke every
-- `auth.uid() = id` policy. Drop the default and tie the column to auth.users.
alter table public.profiles alter column id drop default;
alter table public.profiles alter column full_name set default '';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_id_fkey' and conrelid = 'public.profiles'::regclass
  ) then
    begin
      alter table public.profiles
        add constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade;
    exception when others then
      raise notice 'Could not link profiles.id to auth.users: %. Existing profile rows probably have ids that are not auth users; clean them up and re-run.', sqlerrm;
    end;
  end if;
end
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'role', 'patient')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 4. Home screen content (editable from the backend, no app release needed)
-- ---------------------------------------------------------------------------

create table if not exists public.cities (
  slug text primary key,
  name text not null,
  support_phone text,
  whatsapp_number text,
  is_active boolean not null default true,
  sort_order int not null default 0
);

create table if not exists public.hero_banners (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  image_url text not null,
  cta_label text,
  cta_url text,
  city_slug text references public.cities(slug),
  is_active boolean not null default true,
  sort_order int not null default 0
);

create table if not exists public.quick_actions (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  icon text not null default 'call',
  action_type text not null default 'call' check (action_type in ('call', 'whatsapp', 'url', 'section')),
  action_value text not null,
  is_active boolean not null default true,
  sort_order int not null default 0
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  description text,
  short_description text,
  duration text,
  price numeric(10,2) not null default 0,
  image_url text,
  phone_number text,
  whatsapp_number text,
  city_slug text references public.cities(slug),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price numeric(10,2) not null default 0,
  unit text,
  image_url text,
  whatsapp_number text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  author_name text not null,
  city_slug text references public.cities(slug),
  rating int not null default 5 check (rating between 1 and 5),
  comment text not null,
  avatar_url text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

create table if not exists public.social_links (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  url text not null,
  is_active boolean not null default true,
  sort_order int not null default 0
);

create table if not exists public.home_sections (
  key text primary key check (key in ('hero', 'quick_actions', 'services', 'reviews', 'products', 'social')),
  title text not null,
  subtitle text,
  is_active boolean not null default true,
  sort_order int not null default 0
);

-- ---------------------------------------------------------------------------
-- 5. Staff hierarchy
-- ---------------------------------------------------------------------------

create table if not exists public.location_managers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  full_name text not null,
  email text unique,
  phone_number text,
  city_slug text references public.cities(slug),
  managed_locations text[] not null default array[]::text[],
  created_at timestamptz default now(),
  created_by uuid references public.profiles(id),
  updated_at timestamptz default now(),
  is_active boolean not null default true
);

create table if not exists public.location_staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  full_name text not null,
  email text,
  phone_number text,
  staff_role text not null default 'assistant' references public.staff_roles(slug),
  city_slug text references public.cities(slug),
  assigned_manager_id uuid references public.location_managers(id) on delete set null,
  assigned_location text,
  qualifications text[] not null default array[]::text[],
  experience_years int not null default 0,
  availability_status text not null default 'available'
    check (availability_status in ('available', 'on_leave', 'inactive', 'training')),
  working_hours jsonb,
  created_at timestamptz default now(),
  created_by uuid references public.profiles(id),
  updated_at timestamptz default now(),
  is_active boolean not null default true
);

create table if not exists public.staff_transfer_history (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.location_staff(id) on delete cascade,
  from_manager_id uuid references public.location_managers(id) on delete set null,
  to_manager_id uuid references public.location_managers(id) on delete set null,
  from_location text,
  to_location text,
  from_city text,
  to_city text,
  reason text,
  transferred_by uuid references public.profiles(id),
  transferred_at timestamptz default now()
);

create table if not exists public.staff_performance (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.location_staff(id) on delete cascade,
  rating numeric(3,1) check (rating between 1 and 5),
  notes text,
  reviewed_by uuid references public.profiles(id),
  review_date timestamptz default now(),
  updated_at timestamptz default now()
);

-- Upgrade path: a database created from the ORIGINAL supabase-schema.sql has
-- location_managers / location_staff without any of the columns below, because
-- "create table if not exists" above was a no-op for it.
alter table public.location_managers add column if not exists user_id uuid references public.profiles(id) on delete set null;
alter table public.location_managers add column if not exists managed_locations text[] not null default array[]::text[];
alter table public.location_managers add column if not exists created_by uuid references public.profiles(id);
alter table public.location_managers add column if not exists updated_at timestamptz default now();

alter table public.location_staff add column if not exists user_id uuid references public.profiles(id) on delete set null;
alter table public.location_staff add column if not exists staff_role text not null default 'assistant';

-- Convert a staff_role column still typed as the old staff_role_type enum to
-- plain text backed by staff_roles. get_city_staff takes the enum in its
-- signature, so it has to go before the type can be dropped.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'location_staff'
      and column_name = 'staff_role' and udt_name = 'staff_role_type'
  ) then
    drop function if exists public.get_city_staff(text, staff_role_type, text);

    alter table public.location_staff alter column staff_role drop default;
    alter table public.location_staff alter column staff_role type text using staff_role::text;
    alter table public.location_staff alter column staff_role set default 'assistant';
  end if;
end
$$;

-- Any role already in use but missing from the table would fail the foreign key.
insert into public.staff_roles (slug, label, sort_order)
select distinct s.staff_role, initcap(replace(s.staff_role, '_', ' ')), 99
from public.location_staff s
where s.staff_role is not null
on conflict (slug) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'location_staff_staff_role_fkey'
      and conrelid = 'public.location_staff'::regclass
  ) then
    alter table public.location_staff
      add constraint location_staff_staff_role_fkey
      foreign key (staff_role) references public.staff_roles(slug);
  end if;
end
$$;

drop type if exists staff_role_type;
alter table public.location_staff add column if not exists assigned_manager_id uuid references public.location_managers(id) on delete set null;
alter table public.location_staff add column if not exists assigned_location text;
alter table public.location_staff add column if not exists qualifications text[] not null default array[]::text[];
alter table public.location_staff add column if not exists experience_years int not null default 0;
alter table public.location_staff add column if not exists availability_status text not null default 'available';
alter table public.location_staff add column if not exists working_hours jsonb;
alter table public.location_staff add column if not exists created_by uuid references public.profiles(id);
alter table public.location_staff add column if not exists updated_at timestamptz default now();

-- The original schema had a free-text `role` column here; staff_role replaces it.
alter table public.location_staff drop column if exists role;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'location_staff_availability_status_check'
      and conrelid = 'public.location_staff'::regclass
  ) then
    alter table public.location_staff
      add constraint location_staff_availability_status_check
      check (availability_status in ('available', 'on_leave', 'inactive', 'training'));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Orders / leads captured from the patient app
-- ---------------------------------------------------------------------------

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  service_id uuid references public.services(id),
  product_id uuid references public.products(id),
  item_type text not null default 'service' check (item_type in ('service', 'product')),
  item_name text not null,
  patient_name text not null,
  phone_number text not null,
  city_slug text,
  address text not null,
  preferred_time text,
  note text,
  status text not null default 'pending'
    check (status in ('pending', 'assigned', 'in_progress', 'completed', 'cancelled')),
  assigned_manager uuid references public.location_managers(id) on delete set null,
  assigned_staff_member uuid references public.location_staff(id) on delete set null,
  manager_note text,
  assigned_at timestamptz,
  created_at timestamptz default now()
);

-- Upgrade path for earlier order table versions.
alter table public.orders add column if not exists product_id uuid references public.products(id);
alter table public.orders add column if not exists item_type text not null default 'service';
alter table public.orders add column if not exists item_name text;
alter table public.orders add column if not exists phone_number text;
alter table public.orders add column if not exists city_slug text;
alter table public.orders add column if not exists manager_note text;
alter table public.orders add column if not exists assigned_at timestamptz;
alter table public.orders add column if not exists assigned_manager uuid;
alter table public.orders add column if not exists assigned_staff_member uuid;

-- assigned_staff was a profiles reference in the very first version; drop it in
-- favour of assigned_staff_member, which points at the operational staff record.
alter table public.orders drop column if exists assigned_staff;
alter table public.orders drop column if exists assigned_manager_name;
alter table public.orders drop column if exists assigned_manager_phone;
alter table public.orders drop column if exists assigned_manager_email;

-- Re-point the assignment columns at the staff hierarchy. Values that referenced
-- the dropped team_members table no longer resolve, so clear them first.
update public.orders set assigned_manager = null
where assigned_manager is not null
  and not exists (select 1 from public.location_managers m where m.id = orders.assigned_manager);

update public.orders set assigned_staff_member = null
where assigned_staff_member is not null
  and not exists (select 1 from public.location_staff s where s.id = orders.assigned_staff_member);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_assigned_manager_fkey' and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders add constraint orders_assigned_manager_fkey
      foreign key (assigned_manager) references public.location_managers(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'orders_assigned_staff_member_fkey' and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders add constraint orders_assigned_staff_member_fkey
      foreign key (assigned_staff_member) references public.location_staff(id) on delete set null;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'service_name'
  ) then
    execute 'update public.orders set item_name = service_name where item_name is null';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 7. Indexes
-- ---------------------------------------------------------------------------

create index if not exists orders_status_created_idx on public.orders (status, created_at desc);
create index if not exists orders_city_idx on public.orders (city_slug);
create index if not exists services_active_sort_idx on public.services (is_active, sort_order);
create index if not exists location_staff_manager_idx on public.location_staff (assigned_manager_id) where is_active;
create index if not exists location_staff_city_idx on public.location_staff (city_slug) where is_active;
create index if not exists location_managers_city_idx on public.location_managers (city_slug) where is_active;
create index if not exists location_managers_user_idx on public.location_managers (user_id);
create index if not exists location_staff_user_idx on public.location_staff (user_id);
create index if not exists transfer_history_staff_idx on public.staff_transfer_history (staff_id, transferred_at desc);

-- ---------------------------------------------------------------------------
-- 8. Authorisation helpers
--
-- All security definer with a pinned search_path, so they read profiles without
-- triggering the RLS policies that call them (no recursion).
-- ---------------------------------------------------------------------------

create or replace function public.current_role_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.role from public.profiles p where p.id = auth.uid()), 'anon');
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role_name() = 'admin';
$$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role_name() in ('manager', 'admin');
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role_name() in ('staff', 'manager', 'admin');
$$;

-- The location_managers row belonging to the signed-in user, if any.
create or replace function public.current_manager_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.id from public.location_managers m
  where m.user_id = auth.uid() and m.is_active
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 9. Row level security
--
-- Content is public read-only. Orders are insert-only for anonymous visitors.
-- The staff hierarchy is visible to the people responsible for it and nobody
-- else -- the previous "using (true)" policies exposed the whole roster to the
-- anon key.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.cities enable row level security;
alter table public.hero_banners enable row level security;
alter table public.quick_actions enable row level security;
alter table public.services enable row level security;
alter table public.products enable row level security;
alter table public.reviews enable row level security;
alter table public.social_links enable row level security;
alter table public.home_sections enable row level security;
alter table public.orders enable row level security;
alter table public.location_managers enable row level security;
alter table public.location_staff enable row level security;
alter table public.staff_transfer_history enable row level security;
alter table public.staff_performance enable row level security;
alter table public.staff_roles enable row level security;

-- Profiles ------------------------------------------------------------------
create policy "profiles_select" on public.profiles
  for select using (auth.uid() = id or public.is_staff());

create policy "profiles_insert_self" on public.profiles
  for insert with check (auth.uid() = id);

create policy "profiles_update_self" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "profiles_admin_all" on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- Content: public read of active rows, admin-only writes ----------------------
do $$
declare
  content_table text;
begin
  foreach content_table in array array[
    'cities', 'hero_banners', 'quick_actions', 'services',
    'products', 'reviews', 'social_links', 'home_sections',
    -- Roles are reference data: everyone reads them, only an admin edits them.
    'staff_roles'
  ]
  loop
    execute format(
      'create policy "%1$s_public_read" on public.%1$I for select using (is_active)',
      content_table
    );
    execute format(
      'create policy "%1$s_admin_write" on public.%1$I for all using (public.is_admin()) with check (public.is_admin())',
      content_table
    );
  end loop;
end
$$;

-- Orders --------------------------------------------------------------------
-- A family can place an order without an account, but only the ops team can
-- read or change one.
create policy "orders_anon_insert" on public.orders
  for insert with check (true);

create policy "orders_staff_read" on public.orders
  for select using (public.is_staff());

create policy "orders_staff_update" on public.orders
  for update using (public.is_staff()) with check (public.is_staff());

create policy "orders_admin_delete" on public.orders
  for delete using (public.is_admin());

-- Location managers ---------------------------------------------------------
create policy "managers_read" on public.location_managers
  for select using (public.is_staff());

create policy "managers_update_own" on public.location_managers
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "managers_admin_all" on public.location_managers
  for all using (public.is_admin()) with check (public.is_admin());

-- Location staff ------------------------------------------------------------
create policy "staff_read" on public.location_staff
  for select using (
    user_id = auth.uid()
    or assigned_manager_id = public.current_manager_id()
    or public.is_admin()
  );

create policy "staff_update_own" on public.location_staff
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- A manager may create and edit staff, but only within their own team.
create policy "staff_manager_insert" on public.location_staff
  for insert with check (assigned_manager_id = public.current_manager_id());

create policy "staff_manager_update" on public.location_staff
  for update using (assigned_manager_id = public.current_manager_id())
  with check (assigned_manager_id = public.current_manager_id());

create policy "staff_admin_all" on public.location_staff
  for all using (public.is_admin()) with check (public.is_admin());

-- Transfer history ----------------------------------------------------------
create policy "transfers_read" on public.staff_transfer_history
  for select using (public.is_manager());

create policy "transfers_admin_all" on public.staff_transfer_history
  for all using (public.is_admin()) with check (public.is_admin());

-- Performance ---------------------------------------------------------------
create policy "performance_read" on public.staff_performance
  for select using (
    public.is_admin()
    or staff_id in (
      select s.id from public.location_staff s
      where s.assigned_manager_id = public.current_manager_id()
    )
  );

create policy "performance_manager_write" on public.staff_performance
  for insert with check (
    staff_id in (
      select s.id from public.location_staff s
      where s.assigned_manager_id = public.current_manager_id()
    )
  );

create policy "performance_admin_all" on public.staff_performance
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 9b. Column guards
--
-- RLS decides WHICH ROWS you may update, never WHICH COLUMNS. The "own row"
-- policies above would otherwise let a patient run
--
--   patch /rest/v1/profiles?id=eq.<self>  {"role":"admin"}
--
-- and promote themselves with nothing but the public anon key. These triggers
-- supply the missing column-level half of the rule.
-- ---------------------------------------------------------------------------

-- The role PostgREST is acting as, taken from the request JWT. Returns '' when
-- there is no JWT at all, which is the SQL editor / direct service_role case.
-- Deliberately NOT based on current_user: inside a security definer function
-- that is the function owner, not the caller.
create or replace function public.request_role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
$$;

create or replace function public.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Trusted context: exempt server-side work (SQL editor, service_role) so the
  -- bootstrap step in supabase-setup.md -- promoting the first admin, when by
  -- definition no admin exists yet -- can run at all.
  --
  -- This reads the REQUEST JWT, not current_user. Inside a security definer
  -- function current_user is the function OWNER (postgres), not the caller, so
  -- a current_user test here matches every request and disables the guard
  -- entirely. The jwt claim is absent outside PostgREST and is 'anon' /
  -- 'authenticated' / 'service_role' within it.
  if public.request_role() not in ('anon', 'authenticated') then
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'profiles.id is immutable' using errcode = '42501';
  end if;

  -- Only an admin may change a role. Evaluated against the caller's CURRENT
  -- role, so an admin demoting themselves still passes.
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only an admin can change a profile role' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_update on public.profiles;
create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

create or replace function public.guard_staff_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Trusted context (SQL editor / service_role); see guard_profile_update.
  if public.request_role() not in ('anon', 'authenticated') then
    return new;
  end if;

  -- An admin, or the manager this staff member reports to, may change anything.
  if public.is_admin() then
    return new;
  end if;
  if old.assigned_manager_id is not null
     and old.assigned_manager_id = public.current_manager_id() then
    return new;
  end if;

  -- Otherwise the staff member is editing their own row. Their assignment,
  -- seniority and identity are not theirs to change.
  if new.user_id is distinct from old.user_id
     or new.full_name is distinct from old.full_name
     or new.email is distinct from old.email
     or new.staff_role is distinct from old.staff_role
     or new.city_slug is distinct from old.city_slug
     or new.assigned_manager_id is distinct from old.assigned_manager_id
     or new.assigned_location is distinct from old.assigned_location
     or new.qualifications is distinct from old.qualifications
     or new.experience_years is distinct from old.experience_years
     or new.is_active is distinct from old.is_active then
    raise exception 'Staff may only update their own availability and phone number'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists location_staff_guard_update on public.location_staff;
create trigger location_staff_guard_update
  before update on public.location_staff
  for each row execute function public.guard_staff_update();

create or replace function public.guard_manager_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Trusted context (SQL editor / service_role); see guard_profile_update.
  if public.request_role() not in ('anon', 'authenticated') then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  -- A manager editing their own row may correct contact details only. Their
  -- territory and active status are an admin decision.
  if new.user_id is distinct from old.user_id
     or new.city_slug is distinct from old.city_slug
     or new.managed_locations is distinct from old.managed_locations
     or new.is_active is distinct from old.is_active then
    raise exception 'Only an admin can change a manager''s territory or status'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists location_managers_guard_update on public.location_managers;
create trigger location_managers_guard_update
  before update on public.location_managers
  for each row execute function public.guard_manager_update();

-- ---------------------------------------------------------------------------
-- 10. Single round-trip home screen payload for the patient app
-- ---------------------------------------------------------------------------

create or replace function public.get_home_content(p_city_slug text default null)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'cities', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.sort_order, c.name)
      from public.cities c where c.is_active
    ), '[]'::jsonb),
    'sections', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.sort_order)
      from public.home_sections s where s.is_active
    ), '[]'::jsonb),
    'banners', coalesce((
      select jsonb_agg(to_jsonb(b) order by b.sort_order)
      from public.hero_banners b
      where b.is_active and (b.city_slug is null or b.city_slug = p_city_slug)
    ), '[]'::jsonb),
    'quick_actions', coalesce((
      select jsonb_agg(to_jsonb(q) order by q.sort_order)
      from public.quick_actions q where q.is_active
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(to_jsonb(sv) order by sv.sort_order, sv.name)
      from public.services sv
      where sv.is_active and (sv.city_slug is null or sv.city_slug = p_city_slug)
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.sort_order, p.name)
      from public.products p where p.is_active
    ), '[]'::jsonb),
    'reviews', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.sort_order, r.created_at desc)
      from public.reviews r
      where r.is_active and (r.city_slug is null or r.city_slug = p_city_slug)
    ), '[]'::jsonb),
    'social_links', coalesce((
      select jsonb_agg(to_jsonb(sl) order by sl.sort_order)
      from public.social_links sl where sl.is_active
    ), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- 11. Operations RPCs
--
-- These run security definer so they can aggregate across the whole roster,
-- which means each one MUST check the caller's role itself. Without the guard
-- any holder of the anon key could read or rewrite the entire staff hierarchy.
-- ---------------------------------------------------------------------------

create or replace function public.get_admin_dashboard_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can read the dashboard summary'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total_managers', (select count(*) from public.location_managers where is_active),
    'total_staff',    (select count(*) from public.location_staff where is_active),
    'total_cities',   (select count(*) from public.cities where is_active),
    'total_roles',    (select count(*) from public.staff_roles where is_active),
    'total_orders',   (select count(*) from public.orders),

    -- Staff without a manager, and cities with nobody covering them, are the two
    -- gaps an admin needs to see immediately.
    'unassigned_staff', (
      select count(*) from public.location_staff
      where is_active and assigned_manager_id is null
    ),
    'cities_without_manager', coalesce((
      select jsonb_agg(c.name order by c.name)
      from public.cities c
      where c.is_active
        and not exists (
          select 1 from public.location_managers m
          where m.is_active and m.city_slug = c.slug
        )
    ), '[]'::jsonb),

    'staff_by_role', coalesce((
      select jsonb_object_agg(label, c)
      from (
        select coalesce(r.label, s.staff_role) as label, count(*) as c
        from public.location_staff s
        left join public.staff_roles r on r.slug = s.staff_role
        where s.is_active group by coalesce(r.label, s.staff_role)
      ) t
    ), '{}'::jsonb),
    'staff_by_city', coalesce((
      select jsonb_object_agg(name, c)
      from (
        select coalesce(ci.name, s.city_slug) as name, count(*) as c
        from public.location_staff s
        left join public.cities ci on ci.slug = s.city_slug
        where s.is_active and s.city_slug is not null
        group by coalesce(ci.name, s.city_slug)
      ) t
    ), '{}'::jsonb),
    'staff_by_availability', coalesce((
      select jsonb_object_agg(availability_status, c)
      from (
        select availability_status, count(*) as c from public.location_staff
        where is_active group by availability_status
      ) t
    ), '{}'::jsonb),
    'managers_by_city', coalesce((
      select jsonb_object_agg(name, c)
      from (
        select coalesce(ci.name, m.city_slug) as name, count(*) as c
        from public.location_managers m
        left join public.cities ci on ci.slug = m.city_slug
        where m.is_active and m.city_slug is not null
        group by coalesce(ci.name, m.city_slug)
      ) t
    ), '{}'::jsonb),

    -- Location-wise rollup: one row per city with its managers, staff and the
    -- areas actually covered inside it.
    'by_location', coalesce((
      select jsonb_agg(x order by x ->> 'city')
      from (
        select jsonb_build_object(
          'city', c.name,
          'slug', c.slug,
          'managers', (select count(*) from public.location_managers m
                       where m.is_active and m.city_slug = c.slug),
          'staff', (select count(*) from public.location_staff s
                    where s.is_active and s.city_slug = c.slug),
          'available', (select count(*) from public.location_staff s
                        where s.is_active and s.city_slug = c.slug
                          and s.availability_status = 'available'),
          'areas', coalesce((
            select jsonb_agg(distinct s.assigned_location)
            from public.location_staff s
            where s.is_active and s.city_slug = c.slug
              and s.assigned_location is not null and s.assigned_location <> ''
          ), '[]'::jsonb),
          'orders', (select count(*) from public.orders o where o.city_slug = c.slug)
        ) as x
        from public.cities c
        where c.is_active
      ) t
    ), '[]'::jsonb),

    'orders_by_status', coalesce((
      select jsonb_object_agg(status, c)
      from (select status, count(*) as c from public.orders group by status) t
    ), '{}'::jsonb)
  ) into result;

  return result;
end;
$$;

create or replace function public.get_managers_with_staff_count()
returns table (
  id uuid,
  full_name text,
  email text,
  phone_number text,
  city_slug text,
  managed_locations text[],
  staff_count bigint,
  is_active boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Only the operations team can list managers'
      using errcode = '42501';
  end if;

  return query
    select
      m.id, m.full_name, m.email, m.phone_number, m.city_slug, m.managed_locations,
      count(s.id) filter (where s.is_active) as staff_count,
      m.is_active
    from public.location_managers m
    left join public.location_staff s on s.assigned_manager_id = m.id
    where m.is_active
    group by m.id, m.full_name, m.email, m.phone_number, m.city_slug, m.managed_locations, m.is_active
    order by m.city_slug, m.full_name;
end;
$$;

-- Move a staff member to a different manager and record the movement.
create or replace function public.transfer_staff(
  p_staff_id uuid,
  p_new_manager_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.location_staff%rowtype;
  v_old_manager_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can transfer staff between managers'
      using errcode = '42501';
  end if;

  select * into v_staff from public.location_staff where id = p_staff_id;
  if not found then
    raise exception 'Staff member % not found', p_staff_id using errcode = 'P0002';
  end if;

  if p_new_manager_id is not null
     and not exists (select 1 from public.location_managers where id = p_new_manager_id and is_active) then
    raise exception 'Manager % not found or inactive', p_new_manager_id using errcode = 'P0002';
  end if;

  v_old_manager_id := v_staff.assigned_manager_id;

  if v_old_manager_id is not distinct from p_new_manager_id then
    return jsonb_build_object('success', false, 'error', 'Staff member is already assigned to that manager');
  end if;

  update public.location_staff
  set assigned_manager_id = p_new_manager_id,
      updated_at = now()
  where id = p_staff_id;

  insert into public.staff_transfer_history (
    staff_id, from_manager_id, to_manager_id, from_location, to_location,
    from_city, to_city, reason, transferred_by
  )
  values (
    p_staff_id, v_old_manager_id, p_new_manager_id,
    v_staff.assigned_location, v_staff.assigned_location,
    v_staff.city_slug, v_staff.city_slug, p_reason, auth.uid()
  );

  return jsonb_build_object(
    'success', true,
    'staff_id', v_staff.id,
    'staff_name', v_staff.full_name,
    'old_manager_id', v_old_manager_id,
    'new_manager_id', p_new_manager_id,
    'reason', p_reason
  );
end;
$$;

-- Move a staff member to a different city, optionally reassigning the manager.
create or replace function public.transfer_staff_to_city(
  p_staff_id uuid,
  p_new_city_slug text,
  p_new_manager_id uuid default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff public.location_staff%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can transfer staff between cities'
      using errcode = '42501';
  end if;

  select * into v_staff from public.location_staff where id = p_staff_id;
  if not found then
    raise exception 'Staff member % not found', p_staff_id using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.cities where slug = p_new_city_slug and is_active) then
    raise exception 'City % not found or inactive', p_new_city_slug using errcode = 'P0002';
  end if;

  -- A manager only covers their own city, so moving city without moving manager
  -- would leave the staff member reporting across a city boundary.
  if p_new_manager_id is not null
     and not exists (
       select 1 from public.location_managers
       where id = p_new_manager_id and is_active and city_slug = p_new_city_slug
     ) then
    raise exception 'Manager % is not an active manager in %', p_new_manager_id, p_new_city_slug
      using errcode = 'P0002';
  end if;

  update public.location_staff
  set city_slug = p_new_city_slug,
      assigned_manager_id = p_new_manager_id,
      updated_at = now()
  where id = p_staff_id;

  insert into public.staff_transfer_history (
    staff_id, from_manager_id, to_manager_id, from_city, to_city,
    reason, transferred_by
  )
  values (
    p_staff_id, v_staff.assigned_manager_id, p_new_manager_id,
    v_staff.city_slug, p_new_city_slug, p_reason, auth.uid()
  );

  return jsonb_build_object(
    'success', true,
    'staff_id', v_staff.id,
    'staff_name', v_staff.full_name,
    'old_city', v_staff.city_slug,
    'new_city', p_new_city_slug,
    'new_manager_id', p_new_manager_id,
    'reason', p_reason
  );
end;
$$;

-- Signature changed when staff_role stopped being an enum, so the old overload
-- has to be dropped rather than replaced.
drop function if exists public.get_city_staff(text, text, text);

create or replace function public.get_city_staff(
  p_city_slug text,
  p_role text default null,
  p_status text default null
)
returns table (
  id uuid,
  full_name text,
  email text,
  phone_number text,
  staff_role text,
  city_slug text,
  assigned_manager_id uuid,
  assigned_location text,
  qualifications text[],
  availability_status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_manager() then
    raise exception 'Only a manager or admin can list city staff'
      using errcode = '42501';
  end if;

  return query
    select
      s.id, s.full_name, s.email, s.phone_number, s.staff_role, s.city_slug,
      s.assigned_manager_id, s.assigned_location, s.qualifications,
      s.availability_status, s.created_at
    from public.location_staff s
    where s.city_slug = p_city_slug
      and s.is_active
      and (p_role is null or s.staff_role = p_role)
      and (p_status is null or s.availability_status = p_status)
      -- A manager sees their own team; an admin sees the whole city.
      and (public.is_admin() or s.assigned_manager_id = public.current_manager_id())
    order by s.full_name;
end;
$$;

-- The RPCs above enforce their own role checks, but the transfer functions have
-- no reason to be reachable by an unauthenticated caller at all.
revoke execute on function public.transfer_staff(uuid, uuid, text) from anon;
revoke execute on function public.transfer_staff_to_city(uuid, text, uuid, text) from anon;
revoke execute on function public.get_admin_dashboard_summary() from anon;

-- ---------------------------------------------------------------------------
-- 12. Seed content
-- ---------------------------------------------------------------------------

insert into public.cities (slug, name, support_phone, whatsapp_number, sort_order) values
  ('bhopal',    'Bhopal, Madhya Pradesh',   '+919999999999', '+919999999999', 1),
  ('indore',    'Indore, Madhya Pradesh',   '+919999999998', '+919999999998', 2),
  ('gwalior',   'Gwalior, Madhya Pradesh',  '+919999999997', '+919999999997', 3),
  ('jabalpur',  'Jabalpur, Madhya Pradesh', '+919999999996', '+919999999996', 4)
on conflict (slug) do nothing;

insert into public.home_sections (key, title, subtitle, sort_order) values
  ('hero', 'Trusted home care at your doorstep', null, 1),
  ('quick_actions', 'Quick help', null, 2),
  ('services', 'Our services', 'Care delivered at home by verified professionals', 3),
  ('reviews', 'What families say', null, 4),
  ('products', 'Other products', 'Home care essentials delivered to you', 5),
  ('social', 'Follow us', null, 6)
on conflict (key) do nothing;

insert into public.hero_banners (title, subtitle, image_url, cta_label, cta_url, sort_order) values
  ('24x7 home nursing', 'Verified nurses at your door within 2 hours', 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=1200&q=80', 'Book now', 'tel:+919999999999', 1),
  ('ICU setup at home', 'Complete critical care equipment and trained staff', 'https://images.unsplash.com/photo-1584515933487-779824d29309?auto=format&fit=crop&w=1200&q=80', 'Talk to us', 'tel:+919999999999', 2),
  ('Elder care plans', 'Monthly caregiver plans for seniors', 'https://images.unsplash.com/photo-1519823551278-64ac92734fb1?auto=format&fit=crop&w=1200&q=80', 'See plans', 'tel:+919999999999', 3)
on conflict do nothing;

insert into public.quick_actions (label, icon, action_type, action_value, sort_order) values
  ('Call us', 'call', 'call', '+919999999999', 1),
  ('WhatsApp', 'whatsapp', 'whatsapp', '+919999999999', 2),
  ('Emergency', 'emergency', 'call', '+919999999900', 3)
on conflict do nothing;

insert into public.services (name, category, description, short_description, duration, price, image_url, phone_number, whatsapp_number, sort_order) values
  ('Home Nursing Care', 'Nursing', 'Professional nursing support for injections, dressing, catheter care and monitoring.', 'Injections, dressing, catheter and vitals monitoring at home.', '12h / 24h', 1200, 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=900&q=80', '+919999999999', '+919999999999', 1),
  ('ICU Setup at Home', 'Critical Care', 'Complete home ICU support with equipment and trained staff.', 'Ventilator, monitor and critical care nurses at home.', '24h', 4500, 'https://images.unsplash.com/photo-1584515933487-779824d29309?auto=format&fit=crop&w=900&q=80', '+919999999999', '+919999999999', 2),
  ('Physiotherapy at Home', 'Therapy', 'On-demand physiotherapy for recovery and rehabilitation.', 'Rehab sessions by certified physiotherapists.', '60 min', 900, 'https://images.unsplash.com/photo-1519823551278-64ac92734fb1?auto=format&fit=crop&w=900&q=80', '+919999999999', '+919999999999', 3),
  ('Elder Care Attendant', 'Elder Care', 'Trained attendants for daily activities, mobility and companionship.', 'Day and night attendants for seniors.', '12h shift', 1100, 'https://images.unsplash.com/photo-1573497620053-ea5300f94f21?auto=format&fit=crop&w=900&q=80', '+919999999999', '+919999999999', 4)
on conflict do nothing;

insert into public.products (name, description, price, unit, image_url, whatsapp_number, sort_order) values
  ('Adult Diapers', 'Leak-proof adult diapers, medium and large sizes.', 750, 'pack of 10', 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=900&q=80', '+919999999999', 1),
  ('Hospital Bed on Rent', 'Electric or manual hospital bed delivered and installed.', 2500, 'per month', 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=900&q=80', '+919999999999', 2),
  ('Oxygen Concentrator', '5L / 10L oxygen concentrator on rent with delivery.', 4500, 'per month', 'https://images.unsplash.com/photo-1583912268183-a34d41fe464a?auto=format&fit=crop&w=900&q=80', '+919999999999', 3),
  ('Wheelchair', 'Foldable wheelchair for indoor and outdoor use.', 1200, 'per month', 'https://images.unsplash.com/photo-1595079676339-1534801ad6cf?auto=format&fit=crop&w=900&q=80', '+919999999999', 4)
on conflict do nothing;

insert into public.reviews (author_name, city_slug, rating, comment, sort_order) values
  ('Anita Sharma', 'bhopal', 5, 'The nurse arrived within an hour and took excellent care of my father.', 1),
  ('Rakesh Verma', 'indore', 5, 'ICU setup at home was done in a day. The team was professional and calm.', 2),
  ('Meera Iyer', 'gwalior', 4, 'Physiotherapy sessions at home helped my mother walk again after surgery.', 3)
on conflict do nothing;

insert into public.social_links (platform, url, sort_order) values
  ('whatsapp', 'https://wa.me/919999999999', 1),
  ('facebook', 'https://facebook.com/parihomehealthcare', 2),
  ('instagram', 'https://instagram.com/parihomehealthcare', 3),
  ('youtube', 'https://youtube.com/@parihomehealthcare', 4)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 13. Bootstrapping the first admin
--
-- RLS gives nobody admin rights until a profile has role = 'admin', and the
-- sign-up trigger always creates 'patient'. Create the user in Supabase Auth
-- (Authentication -> Users -> Add user), then promote them here:
--
--   update public.profiles set role = 'admin' where email = 'you@example.com';
--
-- Repeat with role = 'manager' for managers, and link their operational record:
--
--   insert into public.location_managers (user_id, full_name, email, city_slug)
--   select id, full_name, email, 'bhopal' from public.profiles
--   where email = 'manager@example.com';
-- ---------------------------------------------------------------------------
