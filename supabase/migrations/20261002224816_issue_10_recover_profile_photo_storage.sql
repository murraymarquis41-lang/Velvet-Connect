-- Issue #10: recover the actual private profile-photo bucket and Storage RLS.
-- Source: read-only staging storage.buckets/pg_policies capture 2026-10-02,
-- with historical foundation/photo/gating SQL retained as provenance.
-- Supabase-managed Storage schema, objects table and foldername(text) function
-- must exist. This migration does not synthesize or replace platform objects.
-- No evidence uploads, intake, public bucket or hosted deployment authorized.

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 8388608,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update set name=excluded.name, public=excluded.public,
  file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

alter table storage.objects enable row level security;

-- Replace only this application's named policies; preserve unrelated buckets.
drop policy if exists "Authenticated members view profile images" on storage.objects;

drop policy if exists "Eligible members view profile images" on storage.objects;
create policy "Eligible members view profile images" on storage.objects
for select to authenticated
using (((bucket_id = 'profile-photos'::text) AND (((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) OR (EXISTS ( SELECT 1
   FROM public.profile_photos photo
  WHERE ((photo.storage_path = objects.name) AND private.is_profile_discoverable_to(( SELECT auth.uid() AS uid), photo.profile_id)))))));

drop policy if exists "Members delete own profile images" on storage.objects;
create policy "Members delete own profile images" on storage.objects
for delete to authenticated
using (((bucket_id = 'profile-photos'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

drop policy if exists "Members update own profile images" on storage.objects;
create policy "Members update own profile images" on storage.objects
for update to authenticated
using (((bucket_id = 'profile-photos'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)))
with check (((bucket_id = 'profile-photos'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

drop policy if exists "Members upload own profile images" on storage.objects;
create policy "Members upload own profile images" on storage.objects
for insert to authenticated
with check (((bucket_id = 'profile-photos'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
