-- Pari Home Healthcare - Staff Management Schema
-- Manages admin, manager, and staff hierarchies with location-based organization

-- ---------------------------------------------------------------------------
-- Staff Roles and Types
-- ---------------------------------------------------------------------------

create type staff_role_type as enum ('nurse', 'assistant', 'therapist', 'care_coordinator', 'supervisor');

-- ---------------------------------------------------------------------------
-- Admin Management Table
-- ---------------------------------------------------------------------------

create table if not exists public.admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  full_name text not null,
  email text unique not null,
  phone_number text,
  access_level text not null default 'full' check (access_level in ('full', 'limited')),
  can_manage_all_locations boolean not null default true,
  created_at timestamptz default now(),
  created_by uuid references public.profiles(id),
  updated_at timestamptz default now(),
  is_active boolean not null default true
);

-- ---------------------------------------------------------------------------
-- Location Manager Table
-- ---------------------------------------------------------------------------

create table if not exists public.location_managers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  full_name text not null,
  email text unique not null,
  phone_number text,
  city_slug text not null references public.cities(slug),
  managed_locations text[] not null default array[]::text[], -- Can manage multiple locations in same city
  reporting_admin_id uuid references public.admins(id) on delete set null,
  created_at timestamptz default now(),
  created_by uuid references public.profiles(id),
  updated_at timestamptz default now(),
  is_active boolean not null default true
);

-- ---------------------------------------------------------------------------
-- Location Staff Table
-- ---------------------------------------------------------------------------

create table if not exists public.location_staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  full_name text not null,
  email text,
  phone_number text,
  staff_role staff_role_type not null default 'assistant',
  city_slug text not null references public.cities(slug),
  assigned_manager_id uuid references public.location_managers(id) on delete set null,
  assigned_location text, -- specific location/area within city
  qualifications text[] default array[]::text[], -- licenses, certifications
  experience_years int default 0,
  availability_status text not null default 'available' check (availability_status in ('available', 'on_leave', 'inactive', 'training')),
  working_hours jsonb, -- { "monday": { "start": "08:00", "end": "17:00" }, ... }
  created_at timestamptz default now(),
  created_by uuid references public.profiles(id),
  updated_at timestamptz default now(),
  is_active boolean not null default true
);

-- ---------------------------------------------------------------------------
-- Staff Transfer History (for audit trail and admin operations)
-- ---------------------------------------------------------------------------

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
  transferred_by uuid not null references public.profiles(id),
  transferred_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Staff Performance/Notes (for tracking)
-- ---------------------------------------------------------------------------

create table if not exists public.staff_performance (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.location_staff(id) on delete cascade,
  rating numeric(3,1) check (rating between 1 and 5),
  notes text,
  reviewed_by uuid references public.profiles(id),
  review_date timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security Policies
-- ---------------------------------------------------------------------------

-- Admins can manage everything
alter table public.admins enable row level security;
create policy "admins_full_access" on public.admins
  for all using (
    exists (
      select 1 from public.admins
      where user_id = auth.uid() and is_active = true
    )
  );

-- Location Managers - can see themselves and admins, can be viewed by admins
alter table public.location_managers enable row level security;
create policy "managers_view_own" on public.location_managers
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.admins
      where user_id = auth.uid() and is_active = true
    )
  );
create policy "managers_update_own" on public.location_managers
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Location Staff - can be viewed/managed by their manager or admins
alter table public.location_staff enable row level security;
create policy "staff_view_own" on public.location_staff
  for select using (
    user_id = auth.uid()
    or assigned_manager_id = (
      select id from public.location_managers where user_id = auth.uid()
    )
    or exists (
      select 1 from public.admins
      where user_id = auth.uid() and is_active = true
    )
  );
create policy "staff_update_own" on public.location_staff
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "manager_update_staff" on public.location_staff
  for update using (
    assigned_manager_id = (
      select id from public.location_managers where user_id = auth.uid()
    )
  )
  with check (
    assigned_manager_id = (
      select id from public.location_managers where user_id = auth.uid()
    )
  );
create policy "admin_full_staff_access" on public.location_staff
  for all using (
    exists (
      select 1 from public.admins
      where user_id = auth.uid() and is_active = true
    )
  );

-- Staff Transfer History
alter table public.staff_transfer_history enable row level security;
create policy "view_transfer_history" on public.staff_transfer_history
  for select using (
    exists (
      select 1 from public.admins
      where user_id = auth.uid() and is_active = true
    )
  );

-- Staff Performance
alter table public.staff_performance enable row level security;
create policy "view_performance" on public.staff_performance
  for select using (
    staff_id in (
      select id from public.location_staff
      where assigned_manager_id = (
        select id from public.location_managers where user_id = auth.uid()
      )
    )
    or exists (
      select 1 from public.admins
      where user_id = auth.uid() and is_active = true
    )
  );

-- ---------------------------------------------------------------------------
-- Helper Functions
-- ---------------------------------------------------------------------------

-- Get admin dashboard summary
create or replace function get_admin_dashboard_summary()
returns jsonb as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'total_managers', (select count(*) from public.location_managers where is_active = true),
    'total_staff', (select count(*) from public.location_staff where is_active = true),
    'total_cities', (select count(distinct city_slug) from public.location_managers where is_active = true),
    'staff_by_role', (
      select jsonb_object_agg(staff_role::text, count)
      from (
        select staff_role, count(*) as count
        from public.location_staff
        where is_active = true
        group by staff_role
      ) t
    ),
    'staff_by_city', (
      select jsonb_object_agg(city_slug, count)
      from (
        select city_slug, count(*) as count
        from public.location_staff
        where is_active = true
        group by city_slug
      ) t
    ),
    'managers_by_city', (
      select jsonb_object_agg(city_slug, count)
      from (
        select city_slug, count(*) as count
        from public.location_managers
        where is_active = true
        group by city_slug
      ) t
    )
  ) into result;
  return result;
end;
$$ language plpgsql security definer;

-- Get all managers with their staff count
create or replace function get_managers_with_staff_count()
returns table (
  id uuid,
  full_name text,
  email text,
  phone_number text,
  city_slug text,
  managed_locations text[],
  staff_count bigint,
  is_active boolean
) as $$
select
  m.id,
  m.full_name,
  m.email,
  m.phone_number,
  m.city_slug,
  m.managed_locations,
  count(s.id) as staff_count,
  m.is_active
from public.location_managers m
left join public.location_staff s on s.assigned_manager_id = m.id and s.is_active = true
group by m.id, m.full_name, m.email, m.phone_number, m.city_slug, m.managed_locations, m.is_active
order by m.city_slug, m.full_name;
$$ language sql security definer;

-- Transfer staff to another manager
create or replace function transfer_staff(
  p_staff_id uuid,
  p_new_manager_id uuid,
  p_reason text default null
)
returns jsonb as $$
declare
  v_staff record;
  v_old_manager_id uuid;
  v_result jsonb;
begin
  -- Get current staff and manager info
  select id, assigned_manager_id, full_name, city_slug, assigned_location
  into v_staff
  from public.location_staff
  where id = p_staff_id;

  if v_staff is null then
    return jsonb_build_object('error', 'Staff not found');
  end if;

  v_old_manager_id := v_staff.assigned_manager_id;

  -- Update staff assignment
  update public.location_staff
  set assigned_manager_id = p_new_manager_id,
      updated_at = now()
  where id = p_staff_id;

  -- Log transfer history
  insert into public.staff_transfer_history (
    staff_id, from_manager_id, to_manager_id, from_location, to_location,
    from_city, to_city, reason, transferred_by
  )
  values (
    p_staff_id, v_old_manager_id, p_new_manager_id,
    v_staff.assigned_location, v_staff.assigned_location,
    v_staff.city_slug, v_staff.city_slug, p_reason, auth.uid()
  );

  select jsonb_build_object(
    'success', true,
    'staff_id', v_staff.id,
    'staff_name', v_staff.full_name,
    'old_manager_id', v_old_manager_id,
    'new_manager_id', p_new_manager_id,
    'reason', p_reason
  ) into v_result;

  return v_result;
end;
$$ language plpgsql security definer;

-- Transfer staff to different city
create or replace function transfer_staff_to_city(
  p_staff_id uuid,
  p_new_city_slug text,
  p_new_manager_id uuid default null,
  p_reason text default null
)
returns jsonb as $$
declare
  v_staff record;
  v_old_city text;
  v_old_manager_id uuid;
  v_result jsonb;
begin
  -- Get current staff info
  select id, city_slug, assigned_manager_id, full_name
  into v_staff
  from public.location_staff
  where id = p_staff_id;

  if v_staff is null then
    return jsonb_build_object('error', 'Staff not found');
  end if;

  v_old_city := v_staff.city_slug;
  v_old_manager_id := v_staff.assigned_manager_id;

  -- Update staff city and manager if provided
  update public.location_staff
  set city_slug = p_new_city_slug,
      assigned_manager_id = coalesce(p_new_manager_id, assigned_manager_id),
      updated_at = now()
  where id = p_staff_id;

  -- Log transfer history
  insert into public.staff_transfer_history (
    staff_id, from_manager_id, to_manager_id, from_city, to_city,
    reason, transferred_by
  )
  values (
    p_staff_id, v_old_manager_id, p_new_manager_id,
    v_old_city, p_new_city_slug, p_reason, auth.uid()
  );

  select jsonb_build_object(
    'success', true,
    'staff_id', v_staff.id,
    'staff_name', v_staff.full_name,
    'old_city', v_old_city,
    'new_city', p_new_city_slug,
    'reason', p_reason
  ) into v_result;

  return v_result;
end;
$$ language plpgsql security definer;

-- Get staff by city with filters
create or replace function get_city_staff(
  p_city_slug text,
  p_role staff_role_type default null,
  p_status text default null
)
returns table (
  id uuid,
  full_name text,
  email text,
  phone_number text,
  staff_role staff_role_type,
  assigned_manager_id uuid,
  assigned_location text,
  qualifications text[],
  availability_status text,
  created_at timestamptz
) as $$
select
  s.id,
  s.full_name,
  s.email,
  s.phone_number,
  s.staff_role,
  s.assigned_manager_id,
  s.assigned_location,
  s.qualifications,
  s.availability_status,
  s.created_at
from public.location_staff s
where s.city_slug = p_city_slug
  and s.is_active = true
  and (p_role is null or s.staff_role = p_role)
  and (p_status is null or s.availability_status = p_status)
order by s.full_name;
$$ language sql security definer;
