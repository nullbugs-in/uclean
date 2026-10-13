-- ---------------------------------------------------------------------------
-- 03_catalog
--
-- Public, admin-editable content: services and price list, home page hero
-- carousel, store configuration, and the slot schedule.
-- ---------------------------------------------------------------------------

-- Single-row table. The architecture doc asks (decision #3) whether the 6 km
-- radius is measured from one store; that is confirmed as a single store, so
-- this table holds exactly one row enforced by the primary key below.
create table public.store_settings (
  id boolean primary key default true check (id),

  -- Left NULL on purpose. The exact store coordinates are still an open
  -- question in the source doc; the distance check refuses to run until an
  -- admin sets them rather than guessing and silently mis-zone-ing customers.
  lat double precision,
  lng double precision,

  address text,
  phone text,
  whatsapp_number text,

  max_radius_km numeric(5, 2) not null default 6 check (max_radius_km > 0),

  opening_time time not null default '10:00',
  closing_time time not null default '20:00',
  break_start time not null default '14:00',
  break_end time not null default '15:00',

  gstin text,
  updated_at timestamptz not null default now(),

  constraint store_settings_has_coordinates check (lat is null or lng is null or (lat between -90 and 90)),
  constraint store_settings_lng_range check (lng is null or lng between -180 and 180)
);

comment on table public.store_settings is
  'Exactly one row. lat/lng are required before pickup bookings can be created.';

create trigger store_settings_set_updated_at
  before update on public.store_settings
  for each row execute function public.set_updated_at();

-- --- Price list ------------------------------------------------------------

create table public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  unit text not null default 'item',
  price numeric(10, 2) not null check (price >= 0),
  image_url text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint services_name_unique unique (name)
);

create trigger services_set_updated_at
  before update on public.services
  for each row execute function public.set_updated_at();

-- --- Home page carousel ----------------------------------------------------
-- Table driven so Phase 2 poster cards can be added without a code change
-- (architecture doc, section 5.1).
create table public.hero_slides (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  image_url text not null,
  link text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger hero_slides_set_updated_at
  before update on public.hero_slides
  for each row execute function public.set_updated_at();

-- --- Slots -----------------------------------------------------------------
-- The nine daily slots from the architecture doc (section 6.2 step 3).
create table public.time_slots (
  id uuid primary key default gen_random_uuid(),
  start_time time not null,
  end_time time not null,
  label text,
  -- Capacity is NOT defaulted. It is an open question in the source doc
  -- (decision #2: "how many pickups per hourly slot?"), so it must be set by
  -- an admin rather than seeded with an invented number. A capacity of 0 means
  -- the slot is full and book_pickup will refuse it.
  capacity integer not null check (capacity >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint time_slots_unique_window unique (start_time, end_time),
  constraint time_slots_ordered_window check (end_time > start_time)
);

create trigger time_slots_set_updated_at
  before update on public.time_slots
  for each row execute function public.set_updated_at();

-- --- Holidays and blocked days --------------------------------------------

create table public.blocked_dates (
  date date primary key,
  reason text,
  created_at timestamptz not null default now()
);

comment on table public.blocked_dates is
  'Dates on which no pickups are accepted, e.g. store holidays.';
