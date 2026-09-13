-- Build 03 follow-up: ensure none of the authenticated RPCs are callable by
-- the anonymous role. The authenticated grants remain intentionally narrow.

revoke execute on function public.delete_own_account(text) from anon;
revoke execute on function public.moderate_case(uuid, text, text, integer) from anon;
revoke execute on function public.review_moderation_appeal(uuid, text, text) from anon;
revoke execute on function public.submit_moderation_appeal(uuid, text) from anon;
