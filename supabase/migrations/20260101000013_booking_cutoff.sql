-- ---------------------------------------------------------------------------
-- 13_booking_cutoff
--
-- The booking cut-off, and the past-slot check it subsumes.
--
-- Section 8.10 asks for a rule that no pickup can be booked inside the next 60
-- minutes. Until now nothing enforced it: `book_pickup` never compared the
-- requested slot against the clock, so the wizard's "hide past slots" filter was
-- the only thing in the way, and a filter that lives in the browser is a
-- suggestion rather than a rule. A crafted request, or simply leaving the
-- confirm step open past the hour, could book a slot that had already gone.
--
-- Timezone. `date + time` compared to `now()` would be read in UTC, and the
-- store is IST, so an evening slot would be measured against a clock five and a
-- half hours behind its own. The zone is therefore stated explicitly. It is
-- hardcoded `Asia/Kolkata` rather than a `time_zone` column on purpose: this is
-- one store in one zone, and a second zone belongs with multi-store work rather
-- than being pre-funded now. A store that moves changes this line and the
-- matching constant in `src/lib/dates.ts`.
--
-- Additive only. No table is dropped, altered destructively, or truncated, and
-- no existing policy is weakened. The one changed object is `book_pickup`,
-- recreated with `create or replace` because plpgsql has no way to patch a
-- single statement inside a function body.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The cut-off itself.
--
-- Stored on `store_settings` rather than on `time_slots` because it is a rule
-- about the store, not about one slot: it applies to every slot equally, and a
-- per-slot cut-off has no business meaning anyone has asked for.
--
-- Defaulted to the 60 minutes the brief asks for, so an existing database gets
-- the rule on migration rather than silently getting no rule until somebody
-- remembers to visit a settings page.
-- ---------------------------------------------------------------------------
alter table public.store_settings
  add column booking_cutoff_minutes integer not null default 60;

comment on column public.store_settings.booking_cutoff_minutes is
  'Pickups starting sooner than this are refused. 0 means up to the minute.';

-- The upper bound is a sanity bound rather than a business rule. Anything past
-- half a day is an admin typing the wrong number, and a cut-off that swallows
-- tomorrow morning reads as "the site is broken" rather than as a setting.
alter table public.store_settings
  add constraint store_settings_booking_cutoff_range
  check (booking_cutoff_minutes >= 0 and booking_cutoff_minutes <= 720);

-- ---------------------------------------------------------------------------
-- book_pickup, with the clock check.
--
-- Everything else is identical to migration 08: same parameters, same order of
-- operations, same lock, same row. The one addition is the comparison below,
-- placed after the slot row is locked and validated (it needs `start_time`) and
-- before the capacity count (it is the cheaper of the two, and the more specific
-- complaint when both would have failed).
--
-- The comparison is a timestamp, not a time-of-day, so it needs no "is this
-- today" branch: a slot on a past date has a start instant in the past and is
-- refused by the same expression, which closes the second gap. Adding 60
-- minutes as an interval rather than comparing times keeps the whole day from
-- rolling over at midnight.
-- ---------------------------------------------------------------------------
create or replace function public.book_pickup(
  p_customer_id uuid,
  p_customer_name text,
  p_customer_mobile text,
  p_address text,
  p_lat double precision,
  p_lng double precision,
  p_distance_km numeric,
  p_pickup_slot_date date,
  p_pickup_slot_id uuid,
  p_accepted_zone_notice_at timestamptz,
  p_whatsapp_number text default null,
  p_notes text default null,
  p_source public.order_source default 'online',
  p_created_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot public.time_slots%rowtype;
  v_store public.store_settings%rowtype;
  v_capacity integer;
  v_booked integer;
  v_order_id uuid;
begin
  if p_accepted_zone_notice_at is null then
    raise exception 'Delivery zone notice must be accepted first'
      using errcode = '23514';
  end if;

  if btrim(coalesce(p_address, '')) = '' then
    raise exception 'Pickup address is required' using errcode = '23514';
  end if;

  select * into v_store from public.store_settings where id = true;

  if not found then
    raise exception 'Store settings row is missing' using errcode = '23514';
  end if;

  -- Exact store coordinates are still unconfirmed in the source design, so the
  -- seed leaves them NULL. Refuse loudly rather than zone-check against (0,0).
  if v_store.lat is null or v_store.lng is null then
    raise exception 'Store location is not configured yet'
      using errcode = '23514';
  end if;

  if p_distance_km > v_store.max_radius_km then
    raise exception 'Address is outside the % km delivery zone (distance % km)',
      v_store.max_radius_km, p_distance_km
      using errcode = '23514';
  end if;

  if exists (select 1 from public.blocked_dates where date = p_pickup_slot_date) then
    raise exception 'Pickups are not available on %', p_pickup_slot_date
      using errcode = '23514';
  end if;

  -- Lock the slot row for the rest of the transaction.
  select * into v_slot
  from public.time_slots
  where id = p_pickup_slot_id
  for update;

  if not found then
    raise exception 'Pickup slot not found' using errcode = '23514';
  end if;

  if not v_slot.is_active then
    raise exception 'Pickup slot is not active' using errcode = '23514';
  end if;

  -- The cut-off. `p_pickup_slot_date + v_slot.start_time` is a bare timestamp,
  -- and `at time zone` is the half of this that says "read it as store-local
  -- time". Without that the comparison runs against UTC and every slot looks
  -- five and a half hours early.
  --
  -- `<=` rather than `<` so a slot starting on the current minute counts as
  -- gone; `src/server/slots.ts` agrees with this exactly, which is what stops
  -- the wizard offering a slot the database then refuses.
  if (p_pickup_slot_date + v_slot.start_time) at time zone 'Asia/Kolkata'
       <= now() + make_interval(mins => v_store.booking_cutoff_minutes) then
    raise exception
      'Pickup slot is too soon: pickups are booked at least % minutes ahead',
      v_store.booking_cutoff_minutes
      using errcode = '23514';
  end if;

  v_capacity := v_slot.capacity;
  select count(*) into v_booked
  from public.slot_bookings
  where slot_date = p_pickup_slot_date and slot_id = p_pickup_slot_id;

  if v_booked >= v_capacity then
    raise exception 'Pickup slot is full' using errcode = '23514';
  end if;

  insert into public.orders (
    customer_id, created_by, source,
    customer_name, customer_mobile, address_snapshot, lat, lng, distance_km,
    pickup_slot_date, pickup_slot_id,
    accepted_zone_notice_at, notes, status
  )
  values (
    p_customer_id, p_created_by, p_source,
    p_customer_name, p_customer_mobile, p_address, p_lat, p_lng, p_distance_km,
    p_pickup_slot_date, p_pickup_slot_id,
    p_accepted_zone_notice_at, p_notes, 'pickup_requested'
  )
  returning id into v_order_id;

  insert into public.slot_bookings (slot_date, slot_id, order_id)
  values (p_pickup_slot_date, p_pickup_slot_id, v_order_id);

  update public.profiles
  set whatsapp_number = coalesce(p_whatsapp_number, whatsapp_number)
  where id = p_customer_id;

  -- The order_confirmed message for the initial status.
  insert into public.notifications (user_id, channel, template, payload, order_id)
  values (
    p_customer_id,
    'whatsapp',
    'order_confirmed',
    jsonb_build_object('order_no', (select order_no from public.orders where id = v_order_id)),
    v_order_id
  );

  return v_order_id;
end;
$$;

revoke all on function public.book_pickup from public, anon;
grant execute on function public.book_pickup to authenticated, service_role;
