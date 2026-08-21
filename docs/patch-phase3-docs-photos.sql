-- Staff document verification, and photos for staff and managers.
--
-- Two deliberate omissions, both about liability rather than effort:
--
--   * No column holds an Aadhaar or PAN *number*. Only the document type, a
--     link to where the scan lives, and whether an admin has checked it.
--     Holding Aadhaar numbers brings the Aadhaar Act's storage duties on top of
--     the DPDP Act, and buys nothing operationally when you have the document.
--
--   * Photos go in a PRIVATE bucket with a hard size ceiling. A photograph of a
--     care worker is personal data; a public bucket makes every one of them
--     readable by anyone who learns the URL.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Document types  (admin-managed, same pattern as cities and staff roles)
-- ---------------------------------------------------------------------------

create table if not exists public.document_types (
  slug text primary key,
  label text not null,
  description text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

insert into public.document_types (slug, label, sort_order) values
  ('aadhaar',   'Aadhaar card',          1),
  ('pan',       'PAN card',              2),
  ('education', 'Education certificate', 3),
  ('voter_id',  'Voter ID',              4),
  ('other',     'Other',                 9)
on conflict (slug) do nothing;

alter table public.document_types enable row level security;

drop policy if exists "document_types_read" on public.document_types;
create policy "document_types_read" on public.document_types
  for select using (is_active or public.is_staff());

drop policy if exists "document_types_admin" on public.document_types;
create policy "document_types_admin" on public.document_types
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. Staff documents
--
-- A manager attaches the link; only an admin marks it verified. That split is
-- the whole point of the feature, so it is enforced in the database and not
-- merely in the screen.
-- ---------------------------------------------------------------------------

create table if not exists public.staff_documents (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.location_staff(id) on delete cascade,
  doc_type text not null references public.document_types(slug),
  drive_url text not null,
  label text,                       -- what "Other" actually is
  is_verified boolean not null default false,
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  note text,
  added_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (staff_id, doc_type)
);

create index if not exists staff_documents_staff_idx on public.staff_documents (staff_id);

alter table public.staff_documents enable row level security;

drop policy if exists "staff_documents_read" on public.staff_documents;
create policy "staff_documents_read" on public.staff_documents
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.location_staff s
      where s.id = staff_documents.staff_id
        and (s.assigned_manager_id = public.current_manager_id()
             or s.id = public.current_staff_id())
    )
  );

-- A manager may attach and remove documents for their own team.
drop policy if exists "staff_documents_manager_write" on public.staff_documents;
create policy "staff_documents_manager_write" on public.staff_documents
  for all using (
    exists (select 1 from public.location_staff s
            where s.id = staff_documents.staff_id
              and s.assigned_manager_id = public.current_manager_id())
  )
  with check (
    exists (select 1 from public.location_staff s
            where s.id = staff_documents.staff_id
              and s.assigned_manager_id = public.current_manager_id())
  );

drop policy if exists "staff_documents_admin" on public.staff_documents;
create policy "staff_documents_admin" on public.staff_documents
  for all using (public.is_admin()) with check (public.is_admin());

-- Verification is an admin's word. RLS governs rows, never columns, so without
-- this a manager could PATCH is_verified straight over PostgREST and mark their
-- own team's documents checked.
create or replace function public.guard_staff_document_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.request_role() not in ('anon', 'authenticated') then
    return new;
  end if;

  if coalesce(current_setting('app.document_verifying', true), '') = 'on' then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if new.is_verified is distinct from old.is_verified
     or new.verified_by is distinct from old.verified_by
     or new.verified_at is distinct from old.verified_at then
    raise exception 'Only an admin can mark a document verified'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_staff_document_update on public.staff_documents;
create trigger guard_staff_document_update
  before update on public.staff_documents
  for each row execute function public.guard_staff_document_update();

-- Changing the link must drop the verification with it: otherwise a checked
-- Aadhaar card can be swapped for anything while keeping its green tick.
create or replace function public.reset_verification_on_link_change()
returns trigger
language plpgsql
as $$
begin
  if new.drive_url is distinct from old.drive_url and old.is_verified then
    new.is_verified := false;
    new.verified_by := null;
    new.verified_at := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists reset_verification_on_link_change on public.staff_documents;
create trigger reset_verification_on_link_change
  before update on public.staff_documents
  for each row execute function public.reset_verification_on_link_change();

create or replace function public.verify_document(
  p_id uuid,
  p_verified boolean default true,
  p_note text default null
)
returns public.staff_documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.staff_documents%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can verify a document' using errcode = '42501';
  end if;

  perform set_config('app.document_verifying', 'on', true);

  update public.staff_documents
  set is_verified = p_verified,
      verified_by = case when p_verified then auth.uid() else null end,
      verified_at = case when p_verified then now() else null end,
      note = coalesce(p_note, note),
      updated_at = now()
  where id = p_id
  returning * into v_row;

  perform set_config('app.document_verifying', 'off', true);

  if not found then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

revoke execute on function public.verify_document(uuid, boolean, text) from anon;

-- ---------------------------------------------------------------------------
-- 3. Photos
-- ---------------------------------------------------------------------------

alter table public.location_staff    add column if not exists photo_path text;
alter table public.location_managers add column if not exists photo_path text;

-- A private bucket, capped at 256 KB per object and images only. The client
-- resizes before upload, but the ceiling is enforced here too -- a client-side
-- limit is a courtesy, not a control.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 262144, array['image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = 262144,
      allowed_mime_types = array['image/jpeg', 'image/webp'];

drop policy if exists "avatars_read" on storage.objects;
create policy "avatars_read" on storage.objects
  for select using (bucket_id = 'avatars' and public.is_staff());

drop policy if exists "avatars_insert" on storage.objects;
create policy "avatars_insert" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and (public.is_admin() or public.current_manager_id() is not null)
  );

drop policy if exists "avatars_update" on storage.objects;
create policy "avatars_update" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and (public.is_admin() or public.current_manager_id() is not null)
  );

drop policy if exists "avatars_delete" on storage.objects;
create policy "avatars_delete" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and (public.is_admin() or public.current_manager_id() is not null)
  );

-- ---------------------------------------------------------------------------
-- 4. Self-test
-- ---------------------------------------------------------------------------

do $$
declare
  v_bucket record;
begin
  if not exists (select 1 from pg_trigger
                 where tgname = 'guard_staff_document_update' and not tgisinternal) then
    raise exception 'guard_staff_document_update is not installed';
  end if;

  if not exists (select 1 from pg_trigger
                 where tgname = 'reset_verification_on_link_change' and not tgisinternal) then
    raise exception 'reset_verification_on_link_change is not installed';
  end if;

  select * into v_bucket from storage.buckets where id = 'avatars';
  if not found then
    raise exception 'avatars bucket was not created';
  end if;
  if v_bucket.public then
    raise exception 'avatars bucket is public; staff photographs must not be world-readable';
  end if;
  if coalesce(v_bucket.file_size_limit, 0) > 262144 then
    raise exception 'avatars bucket size ceiling is higher than 256 KB';
  end if;

  if (select count(*) from public.document_types where is_active) < 5 then
    raise exception 'document types were not seeded';
  end if;

  raise notice 'Documents and photos ready. Bucket is private, capped at 256 KB.';
end;
$$;
