create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  role text not null default 'patient',
  email text unique,
  created_at timestamptz default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  description text,
  duration text,
  price numeric(10,2) not null default 0,
  created_at timestamptz default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  service_id uuid references public.services(id),
  service_name text not null,
  patient_name text not null,
  address text not null,
  preferred_time text not null,
  note text,
  status text not null default 'pending',
  assigned_staff text,
  manager_note text,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.orders enable row level security;

create policy "Users can view own profile" on public.profiles
for select using (auth.uid() = id);

create policy "Users can update own profile" on public.profiles
for update using (auth.uid() = id);

create policy "Allow read access to services" on public.services for select using (true);
create policy "Allow read access to orders" on public.orders for select using (true);
create policy "Allow inserts to orders" on public.orders for insert with check (true);
create policy "Allow updates to orders" on public.orders for update using (true);

insert into public.services (name, category, description, duration, price)
values
  ('Home Nursing Care', 'Nursing', 'Professional nursing support for injections, dressing, catheter care, and monitoring.', '12h / 24h', 1200),
  ('ICU Setup at Home', 'Critical Care', 'Complete home ICU support with equipment and trained staff.', '24h', 4500),
  ('Physiotherapy at Home', 'Therapy', 'On-demand physiotherapy for recovery and rehabilitation.', '60 min', 900)
on conflict do nothing;
