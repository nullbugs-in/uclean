-- Customer authentication integrity.
--
-- Three problems are fixed here, in the order they have to happen in:
--
--   1. Nothing could stop two accounts for one mobile number. `profiles.mobile`
--      had a format check but no uniqueness, and the format check still let
--      "9876543210" and "+919876543210" both through as separate people.
--   2. Any signed-in customer could promote themselves to admin, because
--      `profiles_update_self` granted a whole-row UPDATE with no column
--      restriction.
--   3. `handle_new_user` inserted the literal string 'pending' when no phone was
--      present, which violates the `profiles_mobile_format` check on the same
--      table, so that path failed with an opaque constraint violation.

-- ---------------------------------------------------------------------------
-- 1. One canonical form for a mobile number
-- ---------------------------------------------------------------------------

-- Mirrors `canonicalizeMobile` in src/lib/mobile.ts. Kept in step with it by
-- hand; the two are covered by the same expectations in their own tests.
--
-- Strips every non-digit, then absorbs a leading 91 (with or without a trunk
-- zero) so all four spellings of a number collapse onto one string.
--
-- The national number must begin 6-9, because every Indian mobile does and
-- without that rule a ten digit number from another country would be relabelled
-- +91 and a one-time code sent to a stranger. Returns null rather than guessing.
create or replace function public.canonical_mobile(input text)
returns text
language sql
immutable
as $$
  with cleaned as (
    select nullif(regexp_replace(input, '\D', '', 'g'), '') as digits
  )
  select case
    when digits is null then null
    when digits ~ '^91[6-9][0-9]{9}$' then '+' || digits
    when digits ~ '^091[6-9][0-9]{9}$' then '+91' || substr(digits, 4)
    when digits ~ '^0[6-9][0-9]{9}$' then '+91' || substr(digits, 2)
    when digits ~ '^[6-9][0-9]{9}$' then '+91' || digits
    else null
  end
  from cleaned;
$$;

comment on function public.canonical_mobile(text) is
  'Canonicalises an Indian mobile number to E.164 (+919876543210), or null if it is not a complete Indian number. Mirrors canonicalizeMobile() in src/lib/mobile.ts.';

-- Applied before the unique index is added, so existing rows are normalised by
-- their next write as well as by the backfill below.
create or replace function public.profiles_canonicalise_mobile()
returns trigger
language plpgsql
as $$
declare
  canonical text;
begin
  canonical := public.canonical_mobile(new.mobile);

  if canonical is null then
    raise exception
      'profiles.mobile must be a complete 10 digit mobile number, got: %',
      new.mobile
      using errcode = 'check_violation';
  end if;

  new.mobile := canonical;
  return new;
end;
$$;

create trigger profiles_canonicalise_mobile
  before insert or update of mobile on public.profiles
  for each row execute function public.profiles_canonicalise_mobile();

-- ---------------------------------------------------------------------------
-- 2. Refuse to guess when duplicates already exist
-- ---------------------------------------------------------------------------

-- The uniqueness constraint below is only meaningful if no two customers are
-- already merged into one number. Nothing is deleted or rewritten here: the
-- migration stops and names the numbers, because merging accounts by hand means
-- deciding which orders belong to whom, and that is not a migration's call.
do $$
declare
  duplicates text;
begin
  select string_agg(mobile, ', ' order by mobile)
  into duplicates
  from (
    select mobile
    from public.profiles
    group by mobile
    having count(*) > 1
  ) as repeated;

  if duplicates is not null then
    raise exception
      'Cannot enforce one account per mobile: % already have more than one profile row. Merge or reassign these by hand, then re-run.',
      duplicates;
  end if;
end;
$$;

-- Backfill every existing row to its canonical form before the index lands.
update public.profiles
set mobile = public.canonical_mobile(mobile)
where mobile is distinct from public.canonical_mobile(mobile);

-- The guarantee. From here on the database itself refuses a second account for
-- a number, so two concurrent signups for the same person cannot both succeed
-- even if both pass the application-level existence check.
create unique index profiles_mobile_unique
  on public.profiles (mobile);

-- ---------------------------------------------------------------------------
-- 3. A customer cannot grant themselves a role
-- ---------------------------------------------------------------------------

-- `profiles_update_self` (migration 08) allows a user to update their own row,
-- and with a table-level grant that includes role, is_active and
-- can_view_all_orders. A signed-in customer could therefore run
-- `update profiles set role = 'admin' where id = auth.uid()` and be an admin.
--
-- The policy itself stays: a customer may still edit their own row. What changes
-- is the privilege, which is narrowed to the columns a customer is actually
-- supposed to be able to change. role, is_active and can_view_all_orders now
-- require the service role or an admin, which is what the comment on the policy
-- always claimed.
revoke update on public.profiles from authenticated;

grant update (full_name, mobile, email, whatsapp_number)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The profile trigger must not invent a mobile number
-- ---------------------------------------------------------------------------

-- The old version fell back to the literal 'pending', which the
-- profiles_mobile_format check rejects, so an auth user created without a phone
-- failed the insert with a constraint violation naming a column rather than the
-- real problem. It now fails with a message that says what is missing.
--
-- Note that raw_user_meta_data is user-editable, so it is only ever used for
-- display data here. It is not, and must not become, an authorisation input.
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

  insert into public.profiles (id, full_name, mobile)
  values (new.id, left(btrim(raw_name), 120), canonical)
  on conflict (id) do nothing;

  return new;
end;
$$;
