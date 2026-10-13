-- ---------------------------------------------------------------------------
-- 05_logistics
--
-- Agents, pickup/delivery assignments, and slot capacity accounting.
-- ---------------------------------------------------------------------------

-- Decision #1 in the source doc assumes agents are staff users who also carry
-- an agent profile, so agents.id is a profile id, not a fresh identity.
create table public.agents (
  id uuid primary key references public.profiles (id) on delete cascade,
  zone text,
  is_available boolean not null default true,
  -- Denormalised running total of open assignments. Maintained by the
  -- auto-assignment function and refreshed on assignment completion.
  current_load integer not null default 0 check (current_load >= 0),
  vehicle text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger agents_set_updated_at
  before update on public.agents
  for each row execute function public.set_updated_at();

-- Section 8.3: every assignment, automatic or manual, is saved here.
create table public.pickup_assignments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete restrict,
  type public.assignment_type not null,
  status public.assignment_status not null default 'assigned',
  -- 'auto' when chosen by the assignment function, 'manual' when an admin
  -- overrode it from the dropdown of free agents.
  assigned_by_type text not null default 'auto' check (assigned_by_type in ('auto', 'manual')),
  assigned_by uuid references public.profiles (id) on delete set null,
  assigned_at timestamptz not null default now(),
  completed_at timestamptz,

  constraint pickup_assignments_unique_per_order_type unique (order_id, type),
  constraint pickup_assignments_completed_requires_time check (
    status <> 'completed' or completed_at is not null
  )
);

-- ---------------------------------------------------------------------------
-- Slot capacity accounting.
--
-- One row per order/slot/date. The unique constraint is what stops two users
-- taking the last place in a slot: book_pickup locks the parent slot row
-- before inserting, so the second transaction blocks until the first commits
-- and then sees the updated count.
-- ---------------------------------------------------------------------------

create table public.slot_bookings (
  id uuid primary key default gen_random_uuid(),
  slot_date date not null,
  slot_id uuid not null references public.time_slots (id) on delete restrict,
  order_id uuid not null references public.orders (id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint slot_bookings_unique_per_order_slot unique (slot_date, slot_id, order_id)
);

-- One pickup booking per order per date, so an order cannot hold two places in
-- the same day's pickup slot.
create unique index slot_bookings_one_pickup_per_order_per_date
  on public.slot_bookings (order_id, slot_date);

create index slot_bookings_lookup
  on public.slot_bookings (slot_date, slot_id);
