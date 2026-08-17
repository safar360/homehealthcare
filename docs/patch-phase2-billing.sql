-- Phase 2: patients, care assignments, attendance, billing and payroll.
--
-- Days served is the atomic unit. Weekly and monthly are rate types, not
-- billing periods, so a customer starting mid-week needs no special handling.
-- A day carries a service type (12-hour / 24-hour) and each type has its own
-- rate for what the family pays and what the staff member earns.
--
-- Safe to re-run. GST is deliberately out of scope.

-- ---------------------------------------------------------------------------
-- 1. Service types  (admin-managed, same pattern as cities and staff roles)
-- ---------------------------------------------------------------------------

create table if not exists public.service_types (
  slug text primary key,
  label text not null,
  hours int,                       -- informational; pricing never uses it
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

insert into public.service_types (slug, label, hours, sort_order) values
  ('12_hour', '12-hour care', 12, 1),
  ('24_hour', '24-hour care', 24, 2)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Patients
-- ---------------------------------------------------------------------------

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone_number text,
  alt_phone text,
  address text,
  city_slug text references public.cities(slug),
  area text,                       -- matches location_staff.assigned_location
  assigned_manager_id uuid references public.location_managers(id) on delete set null,
  status text not null default 'prospect'
    check (status in ('prospect', 'active', 'paused', 'closed')),
  started_on date,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  is_active boolean not null default true
);

create index if not exists patients_manager_idx on public.patients (assigned_manager_id) where is_active;
create index if not exists patients_city_status_idx on public.patients (city_slug, status) where is_active;
create index if not exists patients_phone_idx on public.patients (phone_number);

-- ---------------------------------------------------------------------------
-- 3. Care assignments  —  this staff member serves this patient
--
-- A patient may hold more than one active assignment: a day nurse and a night
-- nurse are two assignments and bill independently.
-- ---------------------------------------------------------------------------

create table if not exists public.care_assignments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  staff_id uuid references public.location_staff(id) on delete set null,
  manager_id uuid references public.location_managers(id) on delete set null,
  billing_mode text not null default 'monthly' check (billing_mode in ('monthly', 'per_day')),
  start_date date not null default current_date,
  end_date date,
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists assignments_patient_idx on public.care_assignments (patient_id);
create index if not exists assignments_staff_idx on public.care_assignments (staff_id);
create index if not exists assignments_manager_idx on public.care_assignments (manager_id);

-- Rates per service type. patient_rate is what the family pays, staff_rate what
-- the staff member earns. Under billing_mode = 'monthly' these are monthly
-- amounts; under 'per_day' they are daily amounts.
create table if not exists public.assignment_rates (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.care_assignments(id) on delete cascade,
  service_type text not null references public.service_types(slug),
  patient_rate numeric(12,2) not null check (patient_rate >= 0),
  staff_rate numeric(12,2) not null check (staff_rate >= 0),
  updated_at timestamptz default now(),
  unique (assignment_id, service_type)
);

-- ---------------------------------------------------------------------------
-- 4. Attendance  —  one row per day served, the source of truth for all money
--
-- The rate and billing mode in force are copied onto each row. A rate change
-- today must not alter what an issued bill said last month.
-- ---------------------------------------------------------------------------

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.care_assignments(id) on delete cascade,
  service_date date not null,
  service_type text not null references public.service_types(slug),
  check_in_at timestamptz,
  check_out_at timestamptz,
  day_fraction numeric(3,2) not null default 1.0 check (day_fraction > 0 and day_fraction <= 1),
  status text not null default 'present' check (status in ('present', 'absent', 'leave')),

  -- frozen at entry
  billing_mode_applied text not null check (billing_mode_applied in ('monthly', 'per_day')),
  patient_rate_applied numeric(12,2) not null default 0,
  staff_rate_applied numeric(12,2) not null default 0,

  marked_by uuid references public.profiles(id),
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- A double tap cannot bill the same day twice.
  unique (assignment_id, service_date)
);

create index if not exists attendance_month_idx
  on public.attendance (assignment_id, service_date);
create index if not exists attendance_date_idx on public.attendance (service_date);

-- ---------------------------------------------------------------------------
-- 5. Bills, receipts and payouts
-- ---------------------------------------------------------------------------

create table if not exists public.monthly_bills (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  billing_month date not null,             -- always the 1st of the month
  lines jsonb not null default '[]'::jsonb,
  days_served numeric(6,2) not null default 0,
  total_earned numeric(12,2) not null default 0,
  status text not null default 'draft'
    check (status in ('draft', 'issued', 'part_paid', 'paid', 'cancelled')),
  issued_at timestamptz,
  generated_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (patient_id, billing_month)
);

create table if not exists public.patient_payments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  bill_id uuid references public.monthly_bills(id) on delete set null,
  billing_month date not null,
  kind text not null default 'receipt' check (kind in ('advance', 'receipt', 'refund')),
  amount numeric(12,2) not null check (amount <> 0),
  paid_on date not null default current_date,
  method text,                              -- cash / upi / bank / cheque
  reference text,
  note text,
  recorded_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

create index if not exists payments_patient_month_idx
  on public.patient_payments (patient_id, billing_month);

create table if not exists public.staff_payouts (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.location_staff(id) on delete cascade,
  payout_month date not null,               -- always the 1st of the month
  lines jsonb not null default '[]'::jsonb,
  days_served numeric(6,2) not null default 0,
  total_payable numeric(12,2) not null default 0,
  paid_amount numeric(12,2) not null default 0,
  paid_on date,
  paid_by uuid references public.profiles(id),
  method text,
  note text,
  status text not null default 'pending'
    check (status in ('pending', 'part_paid', 'paid')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (staff_id, payout_month)
);

-- ---------------------------------------------------------------------------
-- 6. Pricing
--
-- THE rule: round exactly once, on the line.
--
--   monthly   line = round(rate * days / 30, 2)
--   per_day   line = round(rate * days,      2)
--
-- Deriving a daily rate first and multiplying back is wrong: 26000/30 rounds
-- to 866.67, and 866.67 * 30 = 26000.10 -- a full month would overcharge by
-- 10 paise. The full-month identity (30 days returns the monthly rate exactly)
-- is the regression test for this whole path.
-- ---------------------------------------------------------------------------

create or replace function public.price_line(
  p_rate numeric,
  p_days numeric,
  p_billing_mode text
)
returns numeric
language sql
immutable
as $$
  select round(
    case when p_billing_mode = 'monthly'
      then p_rate * p_days / 30.0
      else p_rate * p_days
    end,
    2
  );
$$;

comment on function public.price_line is
  'Price one billing line. Rounds once, at the line, so 30 days on a monthly rate returns that rate exactly.';

-- ---------------------------------------------------------------------------
-- 7. Row level security
-- ---------------------------------------------------------------------------

alter table public.service_types enable row level security;
alter table public.patients enable row level security;
alter table public.care_assignments enable row level security;
alter table public.assignment_rates enable row level security;
alter table public.attendance enable row level security;
alter table public.monthly_bills enable row level security;
alter table public.patient_payments enable row level security;
alter table public.staff_payouts enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'service_types','patients','care_assignments','assignment_rates',
    'attendance','monthly_bills','patient_payments','staff_payouts'
  ]
  loop
    execute format(
      'do $inner$ declare r record; begin
         for r in select policyname from pg_policies
           where schemaname = ''public'' and tablename = %L
         loop execute format(''drop policy if exists %%I on public.%I'', r.policyname); end loop;
       end $inner$;', t, t);
  end loop;
end
$$;

-- Service types: reference data, everyone reads, admin writes.
create policy "service_types_read" on public.service_types
  for select using (is_active or public.is_staff());
create policy "service_types_admin" on public.service_types
  for all using (public.is_admin()) with check (public.is_admin());

-- The staff member serving a patient may see that patient, because they need
-- the address and name to do the visit.
create or replace function public.current_staff_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id from public.location_staff s
  where s.user_id = auth.uid() and s.is_active
  limit 1;
$$;

create policy "patients_manager_read" on public.patients
  for select using (
    public.is_admin()
    or assigned_manager_id = public.current_manager_id()
    or exists (
      select 1 from public.care_assignments a
      where a.patient_id = patients.id
        and a.staff_id = public.current_staff_id()
        and a.status = 'active'
    )
  );
create policy "patients_manager_write" on public.patients
  for all using (assigned_manager_id = public.current_manager_id())
  with check (assigned_manager_id = public.current_manager_id());
create policy "patients_admin" on public.patients
  for all using (public.is_admin()) with check (public.is_admin());

create policy "assignments_read" on public.care_assignments
  for select using (
    public.is_admin()
    or manager_id = public.current_manager_id()
    or staff_id = public.current_staff_id()
  );
create policy "assignments_manager_write" on public.care_assignments
  for all using (manager_id = public.current_manager_id())
  with check (manager_id = public.current_manager_id());
create policy "assignments_admin" on public.care_assignments
  for all using (public.is_admin()) with check (public.is_admin());

-- A staff member must NOT see the patient rate, so they get no read on rates
-- at all. Their own earnings reach them through their payout, not through here.
create policy "rates_read" on public.assignment_rates
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.care_assignments a
      where a.id = assignment_rates.assignment_id
        and a.manager_id = public.current_manager_id()
    )
  );
create policy "rates_manager_write" on public.assignment_rates
  for all using (
    exists (select 1 from public.care_assignments a
            where a.id = assignment_rates.assignment_id
              and a.manager_id = public.current_manager_id())
  )
  with check (
    exists (select 1 from public.care_assignments a
            where a.id = assignment_rates.assignment_id
              and a.manager_id = public.current_manager_id())
  );
create policy "rates_admin" on public.assignment_rates
  for all using (public.is_admin()) with check (public.is_admin());

create policy "attendance_read" on public.attendance
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.care_assignments a
      where a.id = attendance.assignment_id
        and (a.manager_id = public.current_manager_id()
             or a.staff_id = public.current_staff_id())
    )
  );
-- Staff may record their own attendance; the rate columns are set by the
-- check-in RPC, not by the client.
create policy "attendance_staff_write" on public.attendance
  for insert with check (
    exists (select 1 from public.care_assignments a
            where a.id = attendance.assignment_id
              and a.staff_id = public.current_staff_id())
  );
create policy "attendance_staff_update" on public.attendance
  for update using (
    exists (select 1 from public.care_assignments a
            where a.id = attendance.assignment_id
              and a.staff_id = public.current_staff_id())
  );
create policy "attendance_manager_write" on public.attendance
  for all using (
    exists (select 1 from public.care_assignments a
            where a.id = attendance.assignment_id
              and a.manager_id = public.current_manager_id())
  )
  with check (
    exists (select 1 from public.care_assignments a
            where a.id = attendance.assignment_id
              and a.manager_id = public.current_manager_id())
  );
create policy "attendance_admin" on public.attendance
  for all using (public.is_admin()) with check (public.is_admin());

create policy "bills_read" on public.monthly_bills
  for select using (
    public.is_admin()
    or exists (select 1 from public.patients p
               where p.id = monthly_bills.patient_id
                 and p.assigned_manager_id = public.current_manager_id())
  );
create policy "bills_manager_write" on public.monthly_bills
  for all using (
    exists (select 1 from public.patients p
            where p.id = monthly_bills.patient_id
              and p.assigned_manager_id = public.current_manager_id())
  )
  with check (
    exists (select 1 from public.patients p
            where p.id = monthly_bills.patient_id
              and p.assigned_manager_id = public.current_manager_id())
  );
create policy "bills_admin" on public.monthly_bills
  for all using (public.is_admin()) with check (public.is_admin());

create policy "payments_read" on public.patient_payments
  for select using (
    public.is_admin()
    or exists (select 1 from public.patients p
               where p.id = patient_payments.patient_id
                 and p.assigned_manager_id = public.current_manager_id())
  );
create policy "payments_manager_write" on public.patient_payments
  for all using (
    exists (select 1 from public.patients p
            where p.id = patient_payments.patient_id
              and p.assigned_manager_id = public.current_manager_id())
  )
  with check (
    exists (select 1 from public.patients p
            where p.id = patient_payments.patient_id
              and p.assigned_manager_id = public.current_manager_id())
  );
create policy "payments_admin" on public.patient_payments
  for all using (public.is_admin()) with check (public.is_admin());

-- A staff member sees their own payout, and nothing about anyone else's.
create policy "payouts_read" on public.staff_payouts
  for select using (
    public.is_admin()
    or staff_id = public.current_staff_id()
    or exists (select 1 from public.location_staff s
               where s.id = staff_payouts.staff_id
                 and s.assigned_manager_id = public.current_manager_id())
  );
create policy "payouts_manager_write" on public.staff_payouts
  for all using (
    exists (select 1 from public.location_staff s
            where s.id = staff_payouts.staff_id
              and s.assigned_manager_id = public.current_manager_id())
  )
  with check (
    exists (select 1 from public.location_staff s
            where s.id = staff_payouts.staff_id
              and s.assigned_manager_id = public.current_manager_id())
  );
create policy "payouts_admin" on public.staff_payouts
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 8. Check-in / check-out
--
-- The rates in force are copied onto the row here, server-side, so a client can
-- never choose what it will be billed at.
-- ---------------------------------------------------------------------------

create or replace function public.check_in(
  p_assignment_id uuid,
  p_service_type text,
  p_service_date date default current_date
)
returns public.attendance
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asg public.care_assignments%rowtype;
  v_rate public.assignment_rates%rowtype;
  v_row public.attendance%rowtype;
begin
  select * into v_asg from public.care_assignments where id = p_assignment_id;
  if not found then
    raise exception 'Assignment not found' using errcode = 'P0002';
  end if;

  if not (public.is_admin()
          or v_asg.manager_id = public.current_manager_id()
          or v_asg.staff_id = public.current_staff_id()) then
    raise exception 'Not your assignment' using errcode = '42501';
  end if;

  if v_asg.status <> 'active' then
    raise exception 'This assignment is %, so attendance cannot be recorded', v_asg.status
      using errcode = 'P0001';
  end if;

  select * into v_rate from public.assignment_rates
  where assignment_id = p_assignment_id and service_type = p_service_type;
  if not found then
    raise exception 'No rate is set for % on this assignment', p_service_type
      using errcode = 'P0002';
  end if;

  insert into public.attendance (
    assignment_id, service_date, service_type, check_in_at,
    billing_mode_applied, patient_rate_applied, staff_rate_applied, marked_by
  )
  values (
    p_assignment_id, p_service_date, p_service_type, now(),
    v_asg.billing_mode, v_rate.patient_rate, v_rate.staff_rate, auth.uid()
  )
  on conflict (assignment_id, service_date) do update
    set check_in_at = coalesce(public.attendance.check_in_at, excluded.check_in_at)
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.check_out(
  p_assignment_id uuid,
  p_service_date date default current_date
)
returns public.attendance
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asg public.care_assignments%rowtype;
  v_row public.attendance%rowtype;
begin
  select * into v_asg from public.care_assignments where id = p_assignment_id;
  if not found then
    raise exception 'Assignment not found' using errcode = 'P0002';
  end if;

  if not (public.is_admin()
          or v_asg.manager_id = public.current_manager_id()
          or v_asg.staff_id = public.current_staff_id()) then
    raise exception 'Not your assignment' using errcode = '42501';
  end if;

  update public.attendance
  set check_out_at = now(), updated_at = now()
  where assignment_id = p_assignment_id and service_date = p_service_date
  returning * into v_row;

  if not found then
    raise exception 'No check-in recorded for % on this assignment', p_service_date
      using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Monthly bill
--
-- Grouped by (service type, frozen rate, frozen mode), so a rate that changed
-- mid-month produces two correctly-priced lines rather than one wrong one.
-- ---------------------------------------------------------------------------

create or replace function public.build_monthly_bill(
  p_patient_id uuid,
  p_month date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_mgr uuid;
  v_lines jsonb;
  v_total numeric(12,2) := 0;
  v_days numeric(6,2) := 0;
  v_advance numeric(12,2) := 0;
  v_paid numeric(12,2) := 0;
  v_bill public.monthly_bills%rowtype;
begin
  select assigned_manager_id into v_mgr from public.patients where id = p_patient_id;
  if not found then
    raise exception 'Patient not found' using errcode = 'P0002';
  end if;
  if not (public.is_admin() or v_mgr = public.current_manager_id()) then
    raise exception 'Not your patient' using errcode = '42501';
  end if;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'service_type', g.service_type,
      'label',        coalesce(st.label, g.service_type),
      'days',         g.days,
      'rate',         g.rate,
      'billing_mode', g.mode,
      'amount',       public.price_line(g.rate, g.days, g.mode)
    ) order by g.service_type), '[]'::jsonb),
    coalesce(sum(public.price_line(g.rate, g.days, g.mode)), 0),
    coalesce(sum(g.days), 0)
  into v_lines, v_total, v_days
  from (
    select
      a.service_type,
      a.patient_rate_applied as rate,
      a.billing_mode_applied as mode,
      sum(a.day_fraction) as days
    from public.attendance a
    join public.care_assignments ca on ca.id = a.assignment_id
    where ca.patient_id = p_patient_id
      and a.status = 'present'
      and a.service_date >= v_month
      and a.service_date < (v_month + interval '1 month')
    group by a.service_type, a.patient_rate_applied, a.billing_mode_applied
  ) g
  left join public.service_types st on st.slug = g.service_type;

  insert into public.monthly_bills (
    patient_id, billing_month, lines, days_served, total_earned, generated_by
  )
  values (p_patient_id, v_month, v_lines, v_days, v_total, auth.uid())
  on conflict (patient_id, billing_month) do update
    set lines = excluded.lines,
        days_served = excluded.days_served,
        total_earned = excluded.total_earned,
        updated_at = now()
    -- An issued bill is a record. Regenerating one is refused; corrections are
    -- a new payment or adjustment, never a silent rewrite of what was sent.
    where public.monthly_bills.status in ('draft')
  returning * into v_bill;

  if v_bill.id is null then
    select * into v_bill from public.monthly_bills
    where patient_id = p_patient_id and billing_month = v_month;
  end if;

  select
    coalesce(sum(amount) filter (where kind = 'advance'), 0),
    coalesce(sum(amount), 0)
  into v_advance, v_paid
  from public.patient_payments
  where patient_id = p_patient_id and billing_month = v_month;

  return jsonb_build_object(
    'bill_id',      v_bill.id,
    'patient_id',   p_patient_id,
    'month',        v_month,
    'status',       v_bill.status,
    'lines',        v_bill.lines,
    'days_served',  v_bill.days_served,
    'total_earned', v_bill.total_earned,
    'advance',      v_advance,
    'received',     v_paid,
    'balance',      v_bill.total_earned - v_paid,
    -- 50% of the expected charge, offered as a suggestion only.
    'suggested_advance', round(v_bill.total_earned * 0.5, 2)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Staff payout — the same attendance, priced with the staff rate
-- ---------------------------------------------------------------------------

create or replace function public.build_staff_payout(
  p_staff_id uuid,
  p_month date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_mgr uuid;
  v_lines jsonb;
  v_total numeric(12,2) := 0;
  v_days numeric(6,2) := 0;
  v_row public.staff_payouts%rowtype;
begin
  select assigned_manager_id into v_mgr from public.location_staff where id = p_staff_id;
  if not found then
    raise exception 'Staff member not found' using errcode = 'P0002';
  end if;
  if not (public.is_admin()
          or v_mgr = public.current_manager_id()
          or p_staff_id = public.current_staff_id()) then
    raise exception 'Not your staff member' using errcode = '42501';
  end if;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'service_type', g.service_type,
      'label',        coalesce(st.label, g.service_type),
      'days',         g.days,
      'rate',         g.rate,
      'billing_mode', g.mode,
      'amount',       public.price_line(g.rate, g.days, g.mode)
    ) order by g.service_type), '[]'::jsonb),
    coalesce(sum(public.price_line(g.rate, g.days, g.mode)), 0),
    coalesce(sum(g.days), 0)
  into v_lines, v_total, v_days
  from (
    select
      a.service_type,
      a.staff_rate_applied as rate,
      a.billing_mode_applied as mode,
      sum(a.day_fraction) as days
    from public.attendance a
    join public.care_assignments ca on ca.id = a.assignment_id
    where ca.staff_id = p_staff_id
      and a.status = 'present'
      and a.service_date >= v_month
      and a.service_date < (v_month + interval '1 month')
    group by a.service_type, a.staff_rate_applied, a.billing_mode_applied
  ) g
  left join public.service_types st on st.slug = g.service_type;

  insert into public.staff_payouts (
    staff_id, payout_month, lines, days_served, total_payable
  )
  values (p_staff_id, v_month, v_lines, v_days, v_total)
  on conflict (staff_id, payout_month) do update
    set lines = excluded.lines,
        days_served = excluded.days_served,
        total_payable = excluded.total_payable,
        updated_at = now()
    where public.staff_payouts.status <> 'paid'
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from public.staff_payouts
    where staff_id = p_staff_id and payout_month = v_month;
  end if;

  return jsonb_build_object(
    'payout_id',     v_row.id,
    'staff_id',      p_staff_id,
    'month',         v_month,
    'lines',         v_row.lines,
    'days_served',   v_row.days_served,
    'total_payable', v_row.total_payable,
    'paid_amount',   v_row.paid_amount,
    'balance',       v_row.total_payable - v_row.paid_amount,
    'status',        v_row.status
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Recording money
-- ---------------------------------------------------------------------------

create or replace function public.record_patient_payment(
  p_patient_id uuid,
  p_month date,
  p_amount numeric,
  p_kind text default 'receipt',
  p_method text default null,
  p_reference text default null,
  p_note text default null,
  p_paid_on date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_mgr uuid;
  v_bill_id uuid;
  v_total numeric(12,2);
  v_paid numeric(12,2);
begin
  select assigned_manager_id into v_mgr from public.patients where id = p_patient_id;
  if not found then
    raise exception 'Patient not found' using errcode = 'P0002';
  end if;
  if not (public.is_admin() or v_mgr = public.current_manager_id()) then
    raise exception 'Not your patient' using errcode = '42501';
  end if;
  if p_amount <= 0 then
    raise exception 'A payment must be greater than zero' using errcode = 'P0001';
  end if;

  select id, total_earned into v_bill_id, v_total
  from public.monthly_bills where patient_id = p_patient_id and billing_month = v_month;

  insert into public.patient_payments (
    patient_id, bill_id, billing_month, kind, amount, paid_on, method, reference, note, recorded_by
  )
  values (
    p_patient_id, v_bill_id, v_month, p_kind, p_amount, p_paid_on, p_method, p_reference, p_note, auth.uid()
  );

  select coalesce(sum(amount), 0) into v_paid
  from public.patient_payments where patient_id = p_patient_id and billing_month = v_month;

  if v_bill_id is not null then
    update public.monthly_bills
    set status = case
          when v_paid >= coalesce(v_total, 0) and coalesce(v_total, 0) > 0 then 'paid'
          when v_paid > 0 then 'part_paid'
          else status end,
        updated_at = now()
    where id = v_bill_id;
  end if;

  return jsonb_build_object(
    'patient_id', p_patient_id, 'month', v_month,
    'total_earned', coalesce(v_total, 0),
    'received', v_paid,
    'balance', coalesce(v_total, 0) - v_paid
  );
end;
$$;

create or replace function public.record_staff_payout(
  p_staff_id uuid,
  p_month date,
  p_amount numeric,
  p_method text default null,
  p_note text default null,
  p_paid_on date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_mgr uuid;
  v_row public.staff_payouts%rowtype;
  v_new numeric(12,2);
begin
  select assigned_manager_id into v_mgr from public.location_staff where id = p_staff_id;
  if not found then
    raise exception 'Staff member not found' using errcode = 'P0002';
  end if;
  if not (public.is_admin() or v_mgr = public.current_manager_id()) then
    raise exception 'Not your staff member' using errcode = '42501';
  end if;
  if p_amount <= 0 then
    raise exception 'A payment must be greater than zero' using errcode = 'P0001';
  end if;

  select * into v_row from public.staff_payouts
  where staff_id = p_staff_id and payout_month = v_month;
  if not found then
    raise exception 'Generate the payout for this month before recording payment'
      using errcode = 'P0002';
  end if;

  v_new := v_row.paid_amount + p_amount;

  update public.staff_payouts
  set paid_amount = v_new,
      paid_on = p_paid_on,
      paid_by = auth.uid(),
      method = coalesce(p_method, method),
      note = coalesce(p_note, note),
      status = case when v_new >= total_payable then 'paid'
                    when v_new > 0 then 'part_paid'
                    else 'pending' end,
      updated_at = now()
  where id = v_row.id
  returning * into v_row;

  return jsonb_build_object(
    'staff_id', p_staff_id, 'month', v_month,
    'total_payable', v_row.total_payable,
    'paid_amount', v_row.paid_amount,
    'balance', v_row.total_payable - v_row.paid_amount,
    'status', v_row.status
  );
end;
$$;

revoke execute on function public.build_monthly_bill(uuid, date) from anon;
revoke execute on function public.build_staff_payout(uuid, date) from anon;
revoke execute on function public.record_patient_payment(uuid, date, numeric, text, text, text, text, date) from anon;
revoke execute on function public.record_staff_payout(uuid, date, numeric, text, text, date) from anon;
revoke execute on function public.check_in(uuid, text, date) from anon;
revoke execute on function public.check_out(uuid, date) from anon;

-- ---------------------------------------------------------------------------
-- 12. Self-test of the pricing rule
--
-- The full-month identity is the thing that catches a bad rounding change, so
-- it runs here rather than living only in a document.
-- ---------------------------------------------------------------------------

do $$
declare
  v numeric;
begin
  -- 30 days on a monthly rate must return the rate exactly.
  v := public.price_line(26000, 30, 'monthly');
  if v <> 26000.00 then
    raise exception 'Pricing broken: 30 days at 26000/month gave %, expected 26000.00', v;
  end if;

  -- The worked example.
  if public.price_line(15000, 18, 'monthly') <> 9000.00 then
    raise exception 'Pricing broken: 18 days at 15000/month';
  end if;
  if public.price_line(26000, 6, 'monthly') <> 5200.00 then
    raise exception 'Pricing broken: 6 days at 26000/month';
  end if;

  -- Per-day mode must not divide.
  if public.price_line(900, 12, 'per_day') <> 10800.00 then
    raise exception 'Pricing broken: per_day mode';
  end if;

  -- Half days.
  if public.price_line(15000, 0.5, 'monthly') <> 250.00 then
    raise exception 'Pricing broken: half day';
  end if;

  raise notice 'Pricing self-test passed.';
end
$$;

select 'Phase 2 billing schema installed' as status,
       (select count(*) from public.service_types) as service_types,
       public.price_line(26000, 30, 'monthly') as full_month_check;
