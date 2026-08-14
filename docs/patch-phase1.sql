-- Phase 1: location-wise staff management.
--
-- Turns staff roles into admin-managed data, adds the Madhya Pradesh cities,
-- and rebuilds the admin dashboard around a location-wise rollup.
-- Safe to re-run. Already folded into supabase-schema.sql.

-- ---------------------------------------------------------------------------
-- 1. Staff roles become a table
--
-- An admin adds roles from the portal at runtime. Extending a Postgres enum
-- requires DDL, so the old staff_role_type enum put every new role behind a
-- migration.
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

-- get_city_staff takes the enum in its signature, so it must go before the
-- type can be dropped.
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

-- A role already in use but missing from the table would fail the foreign key.
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

-- Reference data: everyone reads it, only an admin edits it.
alter table public.staff_roles enable row level security;
drop policy if exists "staff_roles_public_read" on public.staff_roles;
drop policy if exists "staff_roles_admin_write" on public.staff_roles;
create policy "staff_roles_public_read" on public.staff_roles
  for select using (is_active);
create policy "staff_roles_admin_write" on public.staff_roles
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. Madhya Pradesh cities
-- ---------------------------------------------------------------------------

insert into public.cities (slug, name, support_phone, whatsapp_number, sort_order) values
  ('bhopal',   'Bhopal, Madhya Pradesh',   '+919999999999', '+919999999999', 1),
  ('indore',   'Indore, Madhya Pradesh',   '+919999999998', '+919999999998', 2),
  ('gwalior',  'Gwalior, Madhya Pradesh',  '+919999999997', '+919999999997', 3),
  ('jabalpur', 'Jabalpur, Madhya Pradesh', '+919999999996', '+919999999996', 4)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 3. get_city_staff, without the enum
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 4. Admin dashboard, location-wise
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

    -- Staff without a manager, and cities with nobody covering them, are the
    -- two gaps an admin needs to see immediately.
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

    -- Location-wise rollup: one entry per city with its managers, staff and
    -- the areas actually covered inside it.
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

revoke execute on function public.get_admin_dashboard_summary() from anon;

-- Verify.
select
  (select count(*) from public.staff_roles) as roles,
  (select count(*) from public.cities where is_active) as cities,
  (select string_agg(name, ', ' order by sort_order) from public.cities where is_active) as city_list;
