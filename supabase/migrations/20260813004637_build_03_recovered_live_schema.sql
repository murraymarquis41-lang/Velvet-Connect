-- Velvet Connect Build 03 recovered live-schema baseline
-- Reconstructed 2026-08-26 from the authoritative Supabase staging project
-- (project ref qqintbwoalvoegvqoxlo). This is a faithful current-schema
-- reconstruction, not a claim to be the original historical SQL text.

create schema if not exists private;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default ''::text check (char_length(display_name) <= 60),
  age integer check (age >= 18 and age <= 120),
  city text check (char_length(city) <= 120),
  bio text check (char_length(bio) <= 800),
  interests text[] not null default '{}'::text[],
  avatar_url text,
  verified boolean not null default false,
  pronouns text check (char_length(pronouns) <= 80),
  gender_identity text check (char_length(gender_identity) <= 80),
  orientation text check (char_length(orientation) <= 80),
  intention text check (char_length(intention) <= 120),
  looking_for text[] not null default '{}'::text[],
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profile_photos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  position integer not null default 0 check (position >= 0 and position <= 5),
  created_at timestamptz not null default now(),
  unique (profile_id, position)
);

create table public.swipes (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  liked boolean not null,
  created_at timestamptz not null default now(),
  unique (actor_id, target_id),
  check (actor_id <> target_id)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  user_a_id uuid not null references public.profiles(id) on delete cascade,
  user_b_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_a_id, user_b_id),
  check (user_a_id < user_b_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) >= 1 and char_length(body) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  read_at timestamptz
);

create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(reason) >= 1 and char_length(reason) <= 120),
  details text check (char_length(details) <= 2000),
  status text not null default 'open'::text check (status = any (array['open'::text,'reviewing'::text,'resolved'::text,'dismissed'::text])),
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_id)
);

create index blocks_blocked_blocker_idx on public.blocks (blocked_id, blocker_id);
create index blocks_blocked_id_idx on public.blocks (blocked_id);
create index matches_user_a_idx on public.matches (user_a_id, created_at desc);
create index matches_user_b_idx on public.matches (user_b_id, created_at desc);
create index messages_match_created_idx on public.messages (match_id, created_at);
create index messages_sender_id_idx on public.messages (sender_id);
create index reports_reported_created_idx on public.reports (reported_id, created_at desc);
create index reports_reporter_id_idx on public.reports (reporter_id);
create index swipes_target_liked_idx on public.swipes (target_id, liked);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.members_are_blocked(member_a uuid, member_b uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select case
    when member_a is null or member_b is null then true
    else exists (
      select 1 from public.blocks b
      where (b.blocker_id = member_a and b.blocked_id = member_b)
         or (b.blocker_id = member_b and b.blocked_id = member_a)
    )
  end;
$$;

create or replace function private.is_blocked_pair(user_a uuid, user_b uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select (select auth.uid()) is not null
    and (select auth.uid()) in (user_a, user_b)
    and exists (
      select 1 from public.blocks
      where (blocker_id = user_a and blocked_id = user_b)
         or (blocker_id = user_b and blocked_id = user_a)
    );
$$;

create or replace function private.is_profile_discoverable_to(viewer_id uuid, target_id uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select (select auth.uid()) = viewer_id
    and viewer_id <> target_id
    and exists (
      select 1
      from public.profiles viewer
      join public.profiles target on target.id = target_id
      where viewer.id = viewer_id
        and viewer.verified
        and viewer.onboarding_completed
        and target.verified
        and target.onboarding_completed
    )
    and not exists (
      select 1 from public.blocks
      where (blocker_id = viewer_id and blocked_id = target_id)
         or (blocker_id = target_id and blocked_id = viewer_id)
    );
$$;

create or replace function private.create_match_on_mutual_like()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  first_member uuid;
  second_member uuid;
begin
  if new.actor_id is distinct from auth.uid() then
    return new;
  end if;

  first_member := least(new.actor_id, new.target_id);
  second_member := greatest(new.actor_id, new.target_id);

  if not new.liked then
    delete from public.matches
    where user_a_id = first_member and user_b_id = second_member;
    return new;
  end if;

  if private.is_blocked_pair(new.actor_id, new.target_id) then
    return new;
  end if;

  if exists (
    select 1 from public.swipes reciprocal
    where reciprocal.actor_id = new.target_id
      and reciprocal.target_id = new.actor_id
      and reciprocal.liked
  ) then
    insert into public.matches (user_a_id, user_b_id)
    values (first_member, second_member)
    on conflict (user_a_id, user_b_id) do nothing;
  end if;

  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger messages_set_updated_at
before update on public.messages
for each row execute function public.set_updated_at();

create trigger swipes_create_match_on_mutual_like
after insert or update on public.swipes
for each row execute function private.create_match_on_mutual_like();

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.profile_photos enable row level security;
alter table public.swipes enable row level security;
alter table public.matches enable row level security;
alter table public.messages enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;

create policy "Members create own unverified profile" on public.profiles
for insert to authenticated
with check ((select auth.uid()) = id and verified = false);

create policy "Members discover eligible unblocked profiles" on public.profiles
for select to authenticated
using ((select auth.uid()) = id or private.is_profile_discoverable_to((select auth.uid()), id));

create policy "Members update own profile" on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "Members add own profile photos" on public.profile_photos
for insert to authenticated
with check ((select auth.uid()) = profile_id);

create policy "Members delete own profile photos" on public.profile_photos
for delete to authenticated
using ((select auth.uid()) = profile_id);

create policy "Members update own profile photos" on public.profile_photos
for update to authenticated
using ((select auth.uid()) = profile_id)
with check ((select auth.uid()) = profile_id);

create policy "Members view eligible unblocked profile photos" on public.profile_photos
for select to authenticated
using ((select auth.uid()) = profile_id or private.is_profile_discoverable_to((select auth.uid()), profile_id));

create policy "Members create own unblocked swipes" on public.swipes
for insert to authenticated
with check ((select auth.uid()) = actor_id and private.is_profile_discoverable_to(actor_id, target_id));

create policy "Members read own swipes" on public.swipes
for select to authenticated
using ((select auth.uid()) = actor_id);

create policy "Members update own unblocked swipes" on public.swipes
for update to authenticated
using ((select auth.uid()) = actor_id)
with check ((select auth.uid()) = actor_id and private.is_profile_discoverable_to(actor_id, target_id));

create policy "Participants read unblocked matches" on public.matches
for select to authenticated
using ((((select auth.uid()) = user_a_id) or ((select auth.uid()) = user_b_id)) and not private.is_blocked_pair(user_a_id, user_b_id));

create policy "Participants read unblocked messages" on public.messages
for select to authenticated
using (exists (
  select 1 from public.matches m
  where m.id = messages.match_id
    and (((select auth.uid()) = m.user_a_id) or ((select auth.uid()) = m.user_b_id))
    and not private.is_blocked_pair(m.user_a_id, m.user_b_id)
));

create policy "Participants send as themselves unblocked" on public.messages
for insert to authenticated
with check ((select auth.uid()) = sender_id and exists (
  select 1 from public.matches m
  where m.id = messages.match_id
    and (((select auth.uid()) = m.user_a_id) or ((select auth.uid()) = m.user_b_id))
    and not private.is_blocked_pair(m.user_a_id, m.user_b_id)
));

create policy "Participants mark received unblocked messages read" on public.messages
for update to authenticated
using (sender_id <> (select auth.uid()) and exists (
  select 1 from public.matches m
  where m.id = messages.match_id
    and (((select auth.uid()) = m.user_a_id) or ((select auth.uid()) = m.user_b_id))
    and not private.is_blocked_pair(m.user_a_id, m.user_b_id)
))
with check (sender_id <> (select auth.uid()) and read_at is not null and exists (
  select 1 from public.matches m
  where m.id = messages.match_id
    and (((select auth.uid()) = m.user_a_id) or ((select auth.uid()) = m.user_b_id))
    and not private.is_blocked_pair(m.user_a_id, m.user_b_id)
));

create policy "Members create own blocks" on public.blocks
for insert to authenticated
with check ((select auth.uid()) = blocker_id);

create policy "Members delete own blocks" on public.blocks
for delete to authenticated
using ((select auth.uid()) = blocker_id);

create policy "Members read own blocks" on public.blocks
for select to authenticated
using ((select auth.uid()) = blocker_id);

create policy "Members create own open reports" on public.reports
for insert to authenticated
with check ((select auth.uid()) = reporter_id and status = 'open'::text);

create policy "Reporters read their reports" on public.reports
for select to authenticated
using (reporter_id = (select auth.uid()));

revoke all on table public.profiles from anon;
grant select, insert on table public.profiles to authenticated;
grant update (display_name, age, city, bio, interests, avatar_url, pronouns, gender_identity, orientation, intention, looking_for, onboarding_completed) on table public.profiles to authenticated;

grant all on table public.profile_photos to authenticated;
grant all on table public.swipes to authenticated;
grant select, update, delete, truncate, references, trigger on table public.matches to authenticated;
grant select, insert, delete, truncate, references, trigger on table public.messages to authenticated;
grant all on table public.blocks to authenticated;
grant all on table public.reports to authenticated;

revoke all on function private.is_blocked_pair(uuid, uuid) from public;
revoke all on function private.is_profile_discoverable_to(uuid, uuid) from public;
grant execute on function private.is_blocked_pair(uuid, uuid) to authenticated;
grant execute on function private.is_profile_discoverable_to(uuid, uuid) to authenticated;
