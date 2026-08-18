-- URGENT: close a privilege escalation open to the whole internet.
--
-- handle_new_user() took the new profile's role straight out of
-- raw_user_meta_data. That field is whatever the client sent to the public
-- /auth/v1/signup endpoint, so anyone could run
--
--   POST /auth/v1/signup {"email":"...","password":"...","data":{"role":"admin"}}
--
-- and receive a working admin account. Confirmed against this database on
-- 2026-08-18: the probe signed up and its profile came back with role 'admin'.
--
-- A role is granted, never claimed. New accounts now always start as 'patient'
-- and are raised only by an existing admin, or by the login-provisioning Edge
-- Function which runs with the service role and is itself admin-gated.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. The fix
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- full_name is harmless: it is the user's own display name.
  -- role is NOT read from the client. Ever.
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    'patient'
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
-- 2. Self-test -- abort if the client can still influence the role
-- ---------------------------------------------------------------------------

do $$
declare
  v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'handle_new_user';

  if v_src is null then
    raise exception 'handle_new_user() is missing';
  end if;

  -- The words must not appear together: no path from client metadata to role.
  if v_src ~* 'raw_user_meta_data\s*->>\s*''role''' then
    raise exception 'handle_new_user() still reads role from client metadata';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'on_auth_user_created' and not tgisinternal
  ) then
    raise exception 'on_auth_user_created trigger is not installed';
  end if;

  raise notice 'Signup role escalation closed: new accounts always start as patient.';
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Who currently holds a privileged role?
--
-- Read this output. Anything you do not recognise was either created by you or
-- created through the hole above, and should be demoted and deleted from
-- Authentication -> Users in the dashboard.
-- ---------------------------------------------------------------------------

select
  p.role,
  p.email,
  p.full_name,
  p.created_at,
  case
    when lm.id is not null then 'linked to manager record'
    when ls.id is not null then 'linked to staff record'
    else 'not linked to any manager or staff record'
  end as linkage
from public.profiles p
left join public.location_managers lm on lm.user_id = p.id
left join public.location_staff  ls on ls.user_id = p.id
where p.role in ('admin', 'manager', 'staff')
order by
  case p.role when 'admin' then 1 when 'manager' then 2 else 3 end,
  p.created_at;
