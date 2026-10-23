-- ---------------------------------------------------------------------------
-- 000021: signup sets the profile's WhatsApp number
-- ---------------------------------------------------------------------------

-- A signup's WhatsApp number starts as the same number the customer just
-- verified: OTPs and every booking/order notification go through WhatsApp to
-- that number on day one.
--
-- My Profile may move the two apart later (mobile is the login number,
-- whatsapp_number where updates land), but at account creation they are born
-- in sync — the trigger reads the exact mobile it already canonicalised, so
-- nothing new can drift.
--
-- No backfill on purpose: accounts created before this migration keep
-- whatsapp_number null ("Not set" in My Profile) instead of quietly claiming a
-- preference nobody recorded.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_name text;
  raw_mobile text;
  canonical text;
begin
  raw_name := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(coalesce(new.email, 'Customer'), '@', 1)
  );
  raw_mobile := coalesce(new.raw_user_meta_data ->> 'mobile', new.phone);

  if raw_mobile is null or btrim(raw_mobile) = '' then
    raise exception
      'auth user % was created without a phone number, so no customer profile can be built',
      coalesce(new.email, new.id::text)
      using errcode = 'not_null_violation';
  end if;

  canonical := public.canonical_mobile(raw_mobile);

  if canonical is null then
    raise exception
      'auth user % has an unusable mobile number: %',
      coalesce(new.email, new.id::text),
      raw_mobile
      using errcode = 'check_violation';
  end if;

  insert into public.profiles (id, full_name, mobile, whatsapp_number)
  values (new.id, left(btrim(raw_name), 120), canonical, canonical)
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Same hook, same name, so the trigger wiring from migration 09 keeps working.
