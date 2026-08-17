-- Phase 2b: the manager records, corrects and approves attendance.
--
-- Staff check-in stays in the model and arrives in a later phase. Until then a
-- manager enters the days their staff served, and when staff do start checking
-- in, the same screen is how a manager corrects and approves what they entered.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. The frozen rate columns must be immutable
--
-- attendance freezes the rate that applied on the day, so an issued bill can
-- never silently change. But "attendance_manager_write" is FOR ALL, and RLS
-- governs rows, never columns -- so today a manager can PATCH
-- patient_rate_applied straight over PostgREST and reprice history.
--
-- A trigger supplies the column-level rule RLS cannot. mark_attendance() below
-- is the only sanctioned way to change a frozen rate, and it announces itself
-- with a transaction-local flag a client has no way to set.
-- ---------------------------------------------------------------------------

create or replace function public.guard_attendance_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Server-side callers (triggers, migrations, the dashboard) are not requests.
  -- request_role() reads the JWT, NOT current_user: inside a security definer
  -- function current_user is the function owner, which would match every
  -- request and disable this guard entirely.
  if public.request_role() not in ('anon', 'authenticated') then
    return new;
  end if;

  if coalesce(current_setting('app.attendance_repricing', true), '') = 'on' then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if new.assignment_id is distinct from old.assignment_id
     or new.service_date is distinct from old.service_date then
    raise exception 'An attendance row cannot be moved to another assignment or date'
      using errcode = '42501';
  end if;

  if new.patient_rate_applied is distinct from old.patient_rate_applied
     or new.staff_rate_applied is distinct from old.staff_rate_applied
     or new.billing_mode_applied is distinct from old.billing_mode_applied then
    raise exception 'The rate frozen on an attendance row cannot be edited'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_attendance_update on public.attendance;
create trigger guard_attendance_update
  before update on public.attendance
  for each row execute function public.guard_attendance_update();

-- ---------------------------------------------------------------------------
-- 2. Recording a day
--
-- One entry point for "this day was served", whoever records it: a manager
-- entering the week, a manager correcting a staff check-in, or a staff member
-- checking in from their phone later on.
--
-- Rates are read from the assignment here, server-side. A client never chooses
-- what it will be billed at.
-- ---------------------------------------------------------------------------

create or replace function public.mark_attendance(
  p_assignment_id uuid,
  p_service_date date,
  p_service_type text,
  p_status text default 'present',
  p_day_fraction numeric default 1.0,
  p_check_in_at timestamptz default null,
  p_check_out_at timestamptz default null,
  p_note text default null
)
returns public.attendance
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asg public.care_assignments%rowtype;
  v_rate public.assignment_rates%rowtype;
  v_existing public.attendance%rowtype;
  v_row public.attendance%rowtype;
  v_is_manager boolean;
begin
  select * into v_asg from public.care_assignments where id = p_assignment_id;
  if not found then
    raise exception 'Assignment not found' using errcode = 'P0002';
  end if;

  v_is_manager := public.is_admin() or v_asg.manager_id = public.current_manager_id();

  if not (v_is_manager or v_asg.staff_id = public.current_staff_id()) then
    raise exception 'Not your assignment' using errcode = '42501';
  end if;

  -- A manager may correct a paused or ended engagement; a staff member may only
  -- record against a live one.
  if not v_is_manager and v_asg.status <> 'active' then
    raise exception 'This assignment is %, so attendance cannot be recorded', v_asg.status
      using errcode = 'P0001';
  end if;

  if p_status not in ('present', 'absent', 'leave') then
    raise exception 'Unknown attendance status: %', p_status using errcode = 'P0001';
  end if;
  if p_day_fraction <= 0 or p_day_fraction > 1 then
    raise exception 'A day fraction must be greater than 0 and at most 1' using errcode = 'P0001';
  end if;

  select * into v_rate from public.assignment_rates
  where assignment_id = p_assignment_id and service_type = p_service_type;
  if not found then
    raise exception 'No rate is set for % on this assignment', p_service_type
      using errcode = 'P0002';
  end if;

  select * into v_existing from public.attendance
  where assignment_id = p_assignment_id and service_date = p_service_date;

  -- Re-freeze only when the day is new or its service type changed. Re-saving
  -- an untouched day after a rate change must not silently reprice it.
  if found and v_existing.service_type = p_service_type then
    update public.attendance
    set status = p_status,
        day_fraction = p_day_fraction,
        check_in_at = coalesce(p_check_in_at, check_in_at),
        check_out_at = coalesce(p_check_out_at, check_out_at),
        note = coalesce(p_note, note),
        updated_at = now()
    where id = v_existing.id
    returning * into v_row;
    return v_row;
  end if;

  perform set_config('app.attendance_repricing', 'on', true);

  insert into public.attendance (
    assignment_id, service_date, service_type, status, day_fraction,
    check_in_at, check_out_at, note,
    billing_mode_applied, patient_rate_applied, staff_rate_applied, marked_by
  )
  values (
    p_assignment_id, p_service_date, p_service_type, p_status, p_day_fraction,
    p_check_in_at, p_check_out_at, p_note,
    v_asg.billing_mode, v_rate.patient_rate, v_rate.staff_rate, auth.uid()
  )
  on conflict (assignment_id, service_date) do update
    set service_type          = excluded.service_type,
        status                = excluded.status,
        day_fraction          = excluded.day_fraction,
        check_in_at           = coalesce(excluded.check_in_at, public.attendance.check_in_at),
        check_out_at          = coalesce(excluded.check_out_at, public.attendance.check_out_at),
        note                  = coalesce(excluded.note, public.attendance.note),
        billing_mode_applied  = excluded.billing_mode_applied,
        patient_rate_applied  = excluded.patient_rate_applied,
        staff_rate_applied    = excluded.staff_rate_applied,
        updated_at            = now()
  returning * into v_row;

  perform set_config('app.attendance_repricing', 'off', true);

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Approval and removal -- a manager's calls, not a staff member's
-- ---------------------------------------------------------------------------

create or replace function public.verify_attendance(
  p_id uuid,
  p_verified boolean default true
)
returns public.attendance
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.attendance%rowtype;
  v_mgr uuid;
begin
  select a.*, ca.manager_id into v_row, v_mgr
  from public.attendance a
  join public.care_assignments ca on ca.id = a.assignment_id
  where a.id = p_id;

  if not found then
    raise exception 'Attendance row not found' using errcode = 'P0002';
  end if;
  if not (public.is_admin() or v_mgr = public.current_manager_id()) then
    raise exception 'Not your assignment' using errcode = '42501';
  end if;

  -- Stamped server-side, so an approval always names the person who gave it.
  update public.attendance
  set verified_by = case when p_verified then auth.uid() else null end,
      verified_at = case when p_verified then now() else null end,
      updated_at = now()
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.clear_attendance(
  p_assignment_id uuid,
  p_service_date date
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mgr uuid;
begin
  select manager_id into v_mgr from public.care_assignments where id = p_assignment_id;
  if not found then
    raise exception 'Assignment not found' using errcode = 'P0002';
  end if;
  if not (public.is_admin() or v_mgr = public.current_manager_id()) then
    raise exception 'Not your assignment' using errcode = '42501';
  end if;

  delete from public.attendance
  where assignment_id = p_assignment_id and service_date = p_service_date;

  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. The staff check-in screen, for when staff logins arrive
--
-- A staff member has no read on assignment_rates, deliberately -- they must
-- never see what the family pays. But check-in takes a service type, so the
-- screen needs the types that have a rate configured. This returns the slugs
-- and labels, never the amounts.
-- ---------------------------------------------------------------------------

create or replace function public.my_day(p_date date default current_date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'assignment_id', ca.id,
      'patient_name',  p.full_name,
      'phone_number',  p.phone_number,
      'address',       p.address,
      'area',          p.area,
      'service_types', (
        select coalesce(jsonb_agg(
          jsonb_build_object('slug', r.service_type, 'label', coalesce(st.label, r.service_type))
          order by st.sort_order
        ), '[]'::jsonb)
        from public.assignment_rates r
        left join public.service_types st on st.slug = r.service_type
        where r.assignment_id = ca.id
      ),
      'today', (
        select case when a.id is null then null else jsonb_build_object(
          'id',           a.id,
          'service_type', a.service_type,
          'check_in_at',  a.check_in_at,
          'check_out_at', a.check_out_at,
          'status',       a.status
        ) end
        from public.attendance a
        where a.assignment_id = ca.id and a.service_date = p_date
      )
    ) order by p.full_name
  ), '[]'::jsonb)
  from public.care_assignments ca
  join public.patients p on p.id = ca.patient_id
  where ca.staff_id = public.current_staff_id()
    and ca.status = 'active'
    and ca.start_date <= p_date
    and (ca.end_date is null or ca.end_date >= p_date);
$$;

revoke execute on function public.mark_attendance(uuid, date, text, text, numeric, timestamptz, timestamptz, text) from anon;
revoke execute on function public.verify_attendance(uuid, boolean) from anon;
revoke execute on function public.clear_attendance(uuid, date) from anon;
revoke execute on function public.my_day(date) from anon;

-- ---------------------------------------------------------------------------
-- 5. Self-test -- aborts the migration if the audit trail is not actually sealed
-- ---------------------------------------------------------------------------

do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from pg_trigger
  where tgrelid = 'public.attendance'::regclass
    and tgname = 'guard_attendance_update'
    and not tgisinternal;

  if v_count <> 1 then
    raise exception 'guard_attendance_update is not installed on public.attendance';
  end if;

  raise notice 'Attendance guard installed; mark/verify/clear ready.';
end;
$$;
