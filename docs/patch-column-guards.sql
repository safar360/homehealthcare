-- Security patch v3 -- REPLACES v1 and v2. Run this even if you ran v2.
--
-- v2 was ineffective. It gated the guards on
--     current_user not in ('anon','authenticated')
-- but inside a SECURITY DEFINER function current_user is the function OWNER
-- (postgres), never the caller. So the bypass matched on every single request
-- and the guards did nothing at all -- the privilege escalation was still live.
--
-- v3 reads the request JWT instead, which reflects the actual caller:
--     ''            -> no JWT: SQL editor / direct connection  -> trusted
--     'service_role'-> backend                                 -> trusted
--     'anon'        -> browser, signed out                     -> guarded
--     'authenticated' -> browser, signed in                    -> guarded
--
-- Safe to re-run. Folded into supabase-schema.sql (section 9b).

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
-- Repair the rows the exploit test mutated while v2 was ineffective.
-- ---------------------------------------------------------------------------

update public.profiles
set role = 'manager', full_name = 'Sunil Rao'
where email = 'test_manager@gmail.com';

update public.location_managers
set city_slug = 'mumbai', managed_locations = array['Powai']
where email = 'sunil.mgr@example.com';

-- Verify: role must be 'manager', city must be 'mumbai'.
select p.email, p.role, m.full_name, m.city_slug, m.managed_locations
from public.profiles p
left join public.location_managers m on m.user_id = p.id
where p.email = 'test_manager@gmail.com';
