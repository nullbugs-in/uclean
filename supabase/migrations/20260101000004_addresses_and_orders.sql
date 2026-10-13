-- ---------------------------------------------------------------------------
-- 04_addresses_and_orders
--
-- Customer addresses and the order itself, including the snapshot fields the
-- architecture doc requires for accounting accuracy (section 6.1).
-- ---------------------------------------------------------------------------

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  label text not null default 'Home',
  address_text text not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  -- Driving distance from the store, computed server side and cached here so
  -- the booking wizard can re-display the zone check without another API call.
  distance_km numeric(6, 2),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint addresses_lng_range check (lng between -180 and 180)
);

create trigger addresses_set_updated_at
  before update on public.addresses
  for each row execute function public.set_updated_at();

-- At most one default address per customer.
create unique index addresses_one_default_per_user
  on public.addresses (user_id)
  where is_default;

-- ---------------------------------------------------------------------------

create sequence public.order_no_seq start 1001;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique default ('UC' || lpad(nextval('public.order_no_seq')::text, 6, '0')),

  -- Walk-in customers (section 8.11) are created as profiles by an admin, so
  -- customer_id is always populated. created_by records the staff member or
  -- admin who entered the order, which is NULL for a self-service booking.
  customer_id uuid not null references public.profiles (id) on delete restrict,
  created_by uuid references public.profiles (id) on delete set null,
  source public.order_source not null default 'online',

  -- Snapshot: taken at booking time and never updated, so a later profile edit
  -- does not rewrite history on a delivered order.
  customer_name text not null,
  customer_mobile text not null,
  address_snapshot text not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  distance_km numeric(6, 2) not null,

  pickup_slot_date date not null,
  pickup_slot_id uuid not null references public.time_slots (id) on delete restrict,
  delivery_slot_date date,
  delivery_slot_id uuid references public.time_slots (id) on delete restrict,

  status public.order_status not null default 'pickup_requested',
  payment_mode public.payment_mode not null default 'cod',

  -- Section 6.2 step 0: the user must accept the 6 km notice before continuing.
  accepted_zone_notice_at timestamptz,

  notes text,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint orders_lng_range check (lng between -180 and 180),
  constraint orders_delivery_slot_pair check (
    (delivery_slot_id is null) = (delivery_slot_date is null)
  )
);

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- A booking is only valid if the user actually accepted the delivery-zone
-- notice. Enforced here as well as in book_pickup so no other insert path can
-- create an order that skips it.
create or replace function public.enforce_zone_notice_accepted()
returns trigger
language plpgsql
as $$
begin
  if new.accepted_zone_notice_at is null then
    raise exception 'Delivery zone notice must be accepted before an order can be created'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger orders_require_zone_notice
  before insert on public.orders
  for each row execute function public.enforce_zone_notice_accepted();

-- --- Line items ------------------------------------------------------------

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  service_id uuid references public.services (id) on delete set null,
  item_name text not null,
  qty numeric(10, 2) not null default 1 check (qty > 0),
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  notes text,
  -- Photos taken at pickup, stored in Supabase Storage (section 2).
  photo_url text,
  created_at timestamptz not null default now()
);

-- --- Audit trail -----------------------------------------------------------
-- Section 7: every transition is recorded with who, when, from and to.

create table public.order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  changed_by uuid references public.profiles (id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
