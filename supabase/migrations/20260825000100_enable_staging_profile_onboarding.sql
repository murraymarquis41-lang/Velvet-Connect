-- Staging-only WP-01C onboarding correction.
-- RLS remains authoritative; verification stays server controlled.

revoke all on table public.profiles from anon;
grant select, insert on table public.profiles to authenticated;

revoke update on table public.profiles from authenticated;
grant update (
  display_name,
  age,
  city,
  bio,
  interests,
  avatar_url,
  pronouns,
  gender_identity,
  orientation,
  intention,
  looking_for,
  onboarding_completed
) on table public.profiles to authenticated;
