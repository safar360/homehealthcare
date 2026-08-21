-- Part 2 of 2: photographs for staff and managers.
--
-- Run docs/patch-phase3-docs.sql first.
--
-- This part touches the `storage` schema, which is owned by
-- supabase_storage_admin rather than by you. If the SQL editor refuses any of
-- section 3 with a permission or "does not exist" error, section 2 has still
-- done its job and the bucket can be made by hand — see the note at the end.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Preflight
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'is_staff' and p.pronargs = 0) then
    raise exception 'public.is_staff() is missing. Run supabase-schema.sql first.';
  end if;
  raise notice 'Preflight ok.';
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Where the photo lives on each record
-- ---------------------------------------------------------------------------

alter table public.location_staff    add column if not exists photo_path text;
alter table public.location_managers add column if not exists photo_path text;

do $$
begin
  raise notice 'Part 2 section 2 done: photo_path added to staff and managers.';
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. The bucket
--
-- Private, images only, 256 KB per object. The browser resizes to about 20 KB
-- before uploading, but a client-side limit is a courtesy rather than a
-- control, so the ceiling is enforced here as well.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 262144, array['image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = 262144,
      allowed_mime_types = array['image/jpeg', 'image/webp'];

-- Anyone who works here can see a colleague's photograph; only an admin or a
-- manager can put one there or take it away.
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
  v_policies int;
begin
  select * into v_bucket from storage.buckets where id = 'avatars';
  if not found then
    raise exception 'avatars bucket was not created';
  end if;
  if v_bucket.public then
    raise exception 'avatars bucket is public; staff photographs must not be world-readable';
  end if;
  if coalesce(v_bucket.file_size_limit, 0) > 262144 then
    raise exception 'avatars bucket ceiling is above 256 KB';
  end if;

  select count(*) into v_policies from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and policyname like 'avatars_%';
  if v_policies < 4 then
    raise exception 'only % of the 4 avatars policies were created', v_policies;
  end if;

  raise notice 'Part 2 done: private avatars bucket, capped at 256 KB, % policies.', v_policies;
end;
$$;

-- ---------------------------------------------------------------------------
-- If section 3 was refused
--
-- Some projects do not let the SQL editor write to the storage schema. In that
-- case make the bucket in the dashboard instead:
--
--   Storage -> New bucket
--     Name:            avatars
--     Public bucket:   OFF          <- this matters, they are photographs of people
--     File size limit: 256 KB
--     Allowed MIME:    image/jpeg, image/webp
--
-- then add the four policies under Storage -> Policies on the avatars bucket,
-- using the same expressions as section 3 above.
-- ---------------------------------------------------------------------------
