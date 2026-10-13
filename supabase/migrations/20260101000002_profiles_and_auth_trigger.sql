-- ---------------------------------------------------------------------------
-- 02_profiles_and_auth_trigger
--
-- profiles.id is auth.users.id. Name and mobile live here once, and every
-- other screen reads them by user id rather than copying them (architecture
-- doc, section 6.1). Invoices and delivered orders keep their own snapshot
-- for accounting accuracy.
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,

  full_name text not null check (length(btrim(full_name)) > 0),
  mobile text not null,
  email text,
  whatsapp_number text,

  role public.app_role not null default 'customer',
  is_active boolean not null default true,

  -- Section 10: staff see only orders assigned to them "(or all, if given the
  -- 'store staff' role)". Modelled as a flag rather than a fourth role value
  -- so profiles.role stays exactly customer/staff/admin per section 11.
  can_view_all_orders boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_mobile_format check (mobile ~ '^\+?[0-9]{10,15}$')
);

comment on column public.profiles.can_view_all_orders is
  'Store-staff flag: true lets staff see every order, false limits them to their own assignments.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Any authenticated signup becomes a customer profile automatically, so the
-- admin customer list (section 8.2) never needs a manual step.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_name text;
  raw_mobile text;
begin
  raw_name := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(coalesce(new.email, 'Customer'), '@', 1)
  );
  raw_mobile := coalesce(new.raw_user_meta_data ->> 'mobile', new.phone);

  insert into public.profiles (id, full_name, mobile)
  values (
    new.id,
    left(btrim(raw_name), 120),
    coalesce(raw_mobile, 'pending')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- A profile must never outlive its auth user.
create or replace function public.handle_user_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.profiles where id = old.id;
  return old;
end;
$$;

create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute function public.handle_user_deleted();
