-- Pari Home Healthcare - Supabase schema
-- Single Postgres database drives auth, content and orders so the platform runs
-- on the Supabase free tier with no additional infrastructure.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  role text not null default 'patient' check (role in ('patient', 'staff', 'manager', 'admin')),
  email text unique,
  phone_number text,
  city_slug text,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Home screen content (fully editable from the backend, no app release needed)
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

-- Section order/visibility is data, so marketing can reorder the home screen.
create table if not exists public.home_sections (
  key text primary key check (key in ('hero', 'quick_actions', 'services', 'reviews', 'products', 'social')),
  title text not null,
  subtitle text,
  is_active boolean not null default true,
  sort_order int not null default 0
);

-- ---------------------------------------------------------------------------
-- Orders / leads captured from the patient app
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
  status text not null default 'pending' check (status in ('pending', 'assigned', 'in_progress', 'completed', 'cancelled')),
  assigned_staff uuid references public.profiles(id),
  manager_note text,
  created_at timestamptz default now()
);

-- Upgrade path for projects created with the first version of this schema.
alter table public.services add column if not exists short_description text;
alter table public.services add column if not exists image_url text;
alter table public.services add column if not exists phone_number text;
alter table public.services add column if not exists whatsapp_number text;
alter table public.services add column if not exists city_slug text;
alter table public.services add column if not exists is_active boolean not null default true;
alter table public.services add column if not exists sort_order int not null default 0;
alter table public.orders add column if not exists product_id uuid references public.products(id);
alter table public.orders add column if not exists item_type text not null default 'service';
alter table public.orders add column if not exists item_name text;
alter table public.orders add column if not exists phone_number text;
alter table public.orders add column if not exists city_slug text;
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

create index if not exists orders_status_created_idx on public.orders (status, created_at desc);
create index if not exists services_active_sort_idx on public.services (is_active, sort_order);

-- ---------------------------------------------------------------------------
-- Row level security
-- Content is public read-only; orders are insert-only for anonymous visitors
-- and readable by staff/manager/admin roles.
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

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('staff', 'manager', 'admin')
  );
$$;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile" on public.profiles
for select using (auth.uid() = id or public.is_staff());

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
for update using (auth.uid() = id);

do $$
declare
  content_table text;
begin
  foreach content_table in array array[
    'cities', 'hero_banners', 'quick_actions', 'services',
    'products', 'reviews', 'social_links', 'home_sections'
  ]
  loop
    execute format('drop policy if exists "Public read %1$s" on public.%1$I', content_table);
    execute format(
      'create policy "Public read %1$s" on public.%1$I for select using (is_active)',
      content_table
    );
  end loop;
end
$$;

drop policy if exists "Allow read access to orders" on public.orders;
create policy "Staff can read orders" on public.orders
for select using (public.is_staff());

drop policy if exists "Allow inserts to orders" on public.orders;
create policy "Anyone can create an order" on public.orders
for insert with check (true);

drop policy if exists "Allow updates to orders" on public.orders;
create policy "Staff can update orders" on public.orders
for update using (public.is_staff());

-- ---------------------------------------------------------------------------
-- Single round-trip home screen payload for the patient app.
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
-- Seed data
-- ---------------------------------------------------------------------------

insert into public.cities (slug, name, support_phone, whatsapp_number, sort_order) values
  ('mumbai', 'Mumbai', '+919999999999', '+919999999999', 1),
  ('pune', 'Pune', '+919999999998', '+919999999998', 2),
  ('bengaluru', 'Bengaluru', '+919999999997', '+919999999997', 3),
  ('delhi', 'Delhi', '+919999999996', '+919999999996', 4)
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
  ('Anita Sharma', 'mumbai', 5, 'The nurse arrived within an hour and took excellent care of my father.', 1),
  ('Rakesh Verma', 'pune', 5, 'ICU setup at home was done in a day. The team was professional and calm.', 2),
  ('Meera Iyer', 'bengaluru', 4, 'Physiotherapy sessions at home helped my mother walk again after surgery.', 3)
on conflict do nothing;

insert into public.social_links (platform, url, sort_order) values
  ('whatsapp', 'https://wa.me/919999999999', 1),
  ('facebook', 'https://facebook.com/parihomehealthcare', 2),
  ('instagram', 'https://instagram.com/parihomehealthcare', 3),
  ('youtube', 'https://youtube.com/@parihomehealthcare', 4)
on conflict do nothing;
