-- Build 03 follow-up: grant only the columns that authenticated members need.

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
  onboarding_completed,
  date_of_birth,
  adult_attested_at,
  terms_accepted_at
) on table public.profiles to authenticated;

grant update (read_at) on table public.messages to authenticated;
