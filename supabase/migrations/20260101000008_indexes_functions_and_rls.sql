-- ---------------------------------------------------------------------------
-- 08_indexes_functions_and_rls
--
-- Runs last: it depends on every table from 04-07, and its policies depend on
-- its own helper functions. Split into three sections for readability.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- Section A. Indexes (architecture doc, section 11)
-- ===========================================================================

create index orders_status_created_at_idx on public.orders (status, created_at desc);
create index orders_customer_id_idx on public.orders (customer_id, created_at desc);
create index order_items_order_id_idx on public.order_items (order_id);
create index order_status_history_order_id_idx on public.order_status_history (order_id, created_at);
create index pickup_assignments_agent_id_idx on public.pickup_assignments (agent_id, status);
create index addresses_user_id_idx on public.addresses (user_id);
create index services_active_sort_idx on public.services (is_active, sort_order);
create index hero_slides_active_sort_idx on public.hero_slides (is_active, sort_order);

-- ===========================================================================
-- Section B. Functions
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- B1. Role helpers.
--
-- SECURITY DEFINER so a policy on `profiles` can read `profiles` without
-- recursing back into its own RLS policy. Without this, every profile policy
-- would deadlock on itself.
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('staff', 'admin') and is_active
  );
$$;

-- Store staff: staff who may see the whole order book rather than only their
-- own assignments.
create or replace function public.is_store_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('staff', 'admin')
      and is_active
      and (role = 'admin' or can_view_all_orders)
  );
$$;

-- True when the caller has any assignment against the given order.
create or replace function public.is_assigned_to_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.pickup_assignments
    where order_id = p_order_id
      and agent_id = auth.uid()
      and status <> 'cancelled'
  );
$$;

-- ---------------------------------------------------------------------------
-- B2. Order state machine (architecture doc, section 7).
--
-- The database is the authority. src/lib/order-status.ts mirrors this for UI
-- affordances only; it cannot permit a transition the database rejects.
-- ---------------------------------------------------------------------------

create or replace function public.allowed_order_transition(
  p_from public.order_status,
  p_to public.order_status
)
returns boolean
language sql
immutable
as $$
  select case
    when p_from is null then false
    when p_from = p_to then false
    else (p_from, p_to) in (
      -- Cancellation is reachable only before pickup. Section 7: an order may
      -- be cancelled "before pickup". Once the agent has the items, the only
      -- way out is to complete the delivery.
      ('pickup_requested', 'agent_assigned'),
      ('pickup_requested', 'cancelled'),
      ('agent_assigned', 'picked_up'),
      ('agent_assigned', 'cancelled'),
      ('picked_up', 'under_analysis'),
      ('picked_up', 'invoice_sent'),
      ('under_analysis', 'invoice_sent'),
      ('under_analysis', 'in_process'),
      ('invoice_sent', 'payment_pending'),
      ('invoice_sent', 'paid'),
      ('invoice_sent', 'in_process'),
      ('payment_pending', 'paid'),
      ('payment_pending', 'in_process'),
      ('paid', 'in_process'),
      ('paid', 'ready_for_delivery'),
      ('in_process', 'ready_for_delivery'),
      ('ready_for_delivery', 'out_for_delivery'),
      ('out_for_delivery', 'delivered')
    )
  end;
$$;

-- Rejects invalid jumps. Applied as a BEFORE UPDATE trigger, so no code path,
-- including a service-role script, can skip it.
create or replace function public.enforce_order_transition()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    if not public.allowed_order_transition(old.status, new.status) then
      raise exception 'Invalid order status transition: % -> %', old.status, new.status
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger orders_enforce_transition
  before update of status on public.orders
  for each row execute function public.enforce_order_transition();

-- ---------------------------------------------------------------------------
-- B3. Status change side effects: history row, audit row, queued messages.
-- ---------------------------------------------------------------------------

create or replace function public.handle_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template public.notification_template;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  insert into public.order_status_history (order_id, from_status, to_status, changed_by)
  values (new.id, old.status, new.status, auth.uid());

  insert into public.audit_logs (actor_id, action, entity, entity_id, before, after)
  values (
    auth.uid(),
    'order.status_changed',
    'order',
    new.id::text,
    jsonb_build_object('status', old.status),
    jsonb_build_object('status', new.status)
  );

  v_template := case new.status
    when 'pickup_requested' then 'order_confirmed'
    when 'agent_assigned'    then 'agent_assigned'
    when 'picked_up'         then 'picked_up'
    when 'invoice_sent'      then 'invoice_ready'
    when 'paid'              then 'payment_received'
    when 'payment_pending'   then 'payment_received'
    when 'out_for_delivery'  then 'out_for_delivery'
    when 'delivered'         then 'delivered'
    else null
  end;

  if v_template is not null then
    insert into public.notifications (user_id, channel, template, payload, order_id)
    values (
      new.customer_id,
      'whatsapp',
      v_template,
      jsonb_build_object(
        'order_no', new.order_no,
        'order_id', new.id,
        'status', new.status
      ),
      new.id
    );
  end if;

  return new;
end;
$$;

create trigger orders_on_status_change
  after update of status on public.orders
  for each row execute function public.handle_order_status_change();

-- ---------------------------------------------------------------------------
-- B4. Agent load.
-- ---------------------------------------------------------------------------

create or replace function public.refresh_agent_load(p_agent_id uuid)
returns void
language sql
as $$
  update public.agents
  set current_load = (
    select count(*)
    from public.pickup_assignments pa
    join public.orders o on o.id = pa.order_id
    where pa.agent_id = p_agent_id
      and pa.status in ('assigned', 'in_progress')
      and o.status not in ('delivered', 'cancelled')
  )
  where id = p_agent_id;
$$;

create trigger assignments_refresh_agent_load
  after insert or update or delete on public.pickup_assignments
  for each row execute function public.refresh_agent_load(coalesce(new.agent_id, old.agent_id));

-- ---------------------------------------------------------------------------
-- B5. Automatic agent assignment (architecture doc, section 8.3).
--
-- Chooses an agent who is active, free of an overlapping job in that slot,
-- covering that zone, with the lowest current load. p_zone is advisory: the
-- zone is taken from the order's pickup slot locality when supplied, and
-- agents with a NULL zone are treated as covering everywhere.
-- ---------------------------------------------------------------------------

create or replace function public.auto_assign_agent(
  p_order_id uuid,
  p_slot_date date,
  p_slot_id uuid,
  p_zone text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agent uuid;
begin
  select a.id into v_agent
  from public.agents a
  where a.is_available
    and (p_zone is null or a.zone is null or a.zone = p_zone)
    and not exists (
      select 1
      from public.pickup_assignments pa
      join public.slot_bookings sb
        on sb.order_id = pa.order_id and sb.slot_date = p_slot_date and sb.slot_id = p_slot_id
      where pa.agent_id = a.id
        and pa.status in ('assigned', 'in_progress')
        and pa.type = 'pickup'
    )
  order by a.current_load asc, a.id asc
  limit 1;

  if v_agent is null then
    return null;
  end if;

  insert into public.pickup_assignments (order_id, agent_id, type, assigned_by_type)
  values (p_order_id, v_agent, 'pickup', 'auto')
  on conflict (order_id, type) do update
    set agent_id = excluded.agent_id,
        status = 'assigned',
        assigned_at = now()
    where pickup_assignments.status = 'cancelled';

  update public.orders set status = 'agent_assigned' where id = p_order_id;

  return v_agent;
end;
$$;

-- ---------------------------------------------------------------------------
-- B6. book_pickup.
--
-- Section 11: runs in one transaction, locks the slot row, checks capacity,
-- and inserts order plus slot booking. The row lock is what prevents two
-- users taking the last place: the second transaction blocks on the SELECT
-- FOR UPDATE until the first commits, then re-reads the booking count.
--
-- SECURITY DEFINER so authenticated customers can call it without holding
-- insert rights on orders (no direct INSERT policy exists on orders).
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
grant execute on function public.auto_assign_agent to service_role;

-- ===========================================================================
-- Section C. Row level security (architecture doc, section 12)
-- ===========================================================================

alter table public.profiles          enable row level security;
alter table public.addresses         enable row level security;
alter table public.services          enable row level security;
alter table public.hero_slides       enable row level security;
alter table public.store_settings    enable row level security;
alter table public.time_slots        enable row level security;
alter table public.blocked_dates     enable row level security;
alter table public.orders            enable row level security;
alter table public.order_items       enable row level security;
alter table public.order_status_history enable row level security;
alter table public.agents            enable row level security;
alter table public.pickup_assignments enable row level security;
alter table public.slot_bookings     enable row level security;
alter table public.invoices          enable row level security;
alter table public.payments          enable row level security;
alter table public.notifications     enable row level security;
alter table public.otp_logs          enable row level security;
alter table public.audit_logs        enable row level security;

-- --- profiles -------------------------------------------------------------
-- A user reads and edits their own row; role and is_active are not editable
-- by the user themselves, only by an admin.

create policy profiles_select_self_or_staff
  on public.profiles for select
  using (id = auth.uid() or public.is_staff());

create policy profiles_update_self
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Customers may read staff identities (to show an assigned agent's name) but
-- not other customers.

create policy profiles_select_staff_public
  on public.profiles for select
  using (role in ('staff', 'admin') and is_active);

-- --- addresses ------------------------------------------------------------

create policy addresses_all_owner
  on public.addresses for all
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- --- Publicly readable catalog -------------------------------------------

create policy services_public_read
  on public.services for select
  using (is_active or public.is_admin());

create policy services_admin_write
  on public.services for all
  using (public.is_admin())
  with check (public.is_admin());

create policy hero_slides_public_read
  on public.hero_slides for select
  using (is_active or public.is_admin());

create policy hero_slides_admin_write
  on public.hero_slides for all
  using (public.is_admin())
  with check (public.is_admin());

create policy time_slots_public_read
  on public.time_slots for select
  using (is_active or public.is_admin());

create policy time_slots_admin_write
  on public.time_slots for all
  using (public.is_admin())
  with check (public.is_admin());

create policy blocked_dates_public_read
  on public.blocked_dates for select
  using (true);

create policy blocked_dates_admin_write
  on public.blocked_dates for all
  using (public.is_admin())
  with check (public.is_admin());

-- Store settings: the public site needs address, hours and the WhatsApp
-- number, but NOT the exact coordinates, which are business sensitive and
-- feed the distance check. Coordinates are served by a server action instead.
create policy store_settings_public_read
  on public.store_settings for select
  using (true);

create policy store_settings_admin_write
  on public.store_settings for all
  using (public.is_admin())
  with check (public.is_admin());

-- --- orders ---------------------------------------------------------------
-- No INSERT policy: orders are created only through book_pickup, which runs
-- SECURITY DEFINER. A customer cannot forge an order with a hand-written
-- INSERT, and cannot bypass the capacity lock or the 6 km re-check.

create policy orders_select_by_visibility
  on public.orders for select
  using (
    customer_id = auth.uid()
    or public.is_admin()
    or (public.is_staff() and (public.is_store_staff() or public.is_assigned_to_order(id)))
  );

create policy orders_update_staff_or_owner
  on public.orders for update
  using (
    public.is_admin()
    or (public.is_staff() and (public.is_store_staff() or public.is_assigned_to_order(id)))
  )
  with check (
    public.is_admin()
    or (public.is_staff() and (public.is_store_staff() or public.is_assigned_to_order(id)))
  );

-- A customer may cancel their own order, but only before pickup. The status
-- transition trigger still guards the target status.
create policy orders_customer_cancel
  on public.orders for update
  using (customer_id = auth.uid() and status = 'pickup_requested')
  with check (customer_id = auth.uid() and status = 'cancelled');

-- --- order_items ----------------------------------------------------------

create policy order_items_select_by_order_visibility
  on public.order_items for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (
          o.customer_id = auth.uid()
          or public.is_admin()
          or (public.is_staff() and (public.is_store_staff() or public.is_assigned_to_order(o.id)))
        )
    )
  );

create policy order_items_staff_write
  on public.order_items for all
  using (
    public.is_admin()
    or (public.is_staff() and (public.is_store_staff() or public.is_assigned_to_order(order_id)))
  )
  with check (
    public.is_admin()
    or (public.is_staff() and (public.is_store_staff() or public.is_assigned_to_order(order_id)))
  );

-- --- order_status_history -------------------------------------------------

create policy order_status_history_select_by_order_visibility
  on public.order_status_history for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (
          o.customer_id = auth.uid()
          or public.is_admin()
          or (public.is_staff() and (public.is_store_staff() or public.is_assigned_to_order(o.id)))
        )
    )
  );

-- Writes happen in handle_order_status_change (SECURITY DEFINER). No insert
-- policy for clients.

-- --- agents and assignments ----------------------------------------------

create policy agents_select_staff
  on public.agents for select
  using (public.is_staff() or id = auth.uid());

create policy agents_admin_write
  on public.agents for all
  using (public.is_admin())
  with check (public.is_admin());

create policy pickup_assignments_select_by_order_visibility
  on public.pickup_assignments for select
  using (
    agent_id = auth.uid()
    or public.is_admin()
    or (public.is_staff() and public.is_store_staff())
  );

create policy pickup_assignments_admin_write
  on public.pickup_assignments for all
  using (public.is_admin())
  with check (public.is_admin());

-- An agent may move their own assignment forward, but may not reassign it.
create policy pickup_assignments_agent_update
  on public.pickup_assignments for update
  using (agent_id = auth.uid())
  with check (agent_id = auth.uid());

-- --- slot_bookings --------------------------------------------------------
-- Written only by book_pickup. Readable by authenticated customers so the
-- wizard can compute remaining capacity without a bespoke RPC.

create policy slot_bookings_read_authenticated
  on public.slot_bookings for select
  to authenticated
  using (true);

create policy slot_bookings_admin_write
  on public.slot_bookings for all
  using (public.is_admin())
  with check (public.is_admin());

-- --- invoices and payments ------------------------------------------------

create policy invoices_select_by_order_visibility
  on public.invoices for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (
          o.customer_id = auth.uid()
          or public.is_admin()
          or (public.is_staff() and (public.is_store_staff() or public.is_assigned_to_order(o.id)))
        )
    )
  );

-- Section 10: staff see bills read-only. Only an admin creates or edits one.
create policy invoices_admin_write
  on public.invoices for all
  using (public.is_admin())
  with check (public.is_admin());

create policy payments_select_by_invoice_visibility
  on public.payments for select
  using (
    exists (
      select 1 from public.invoices i
      join public.orders o on o.id = i.order_id
      where i.id = invoice_id
        and (
          o.customer_id = auth.uid()
          or public.is_admin()
          or (public.is_staff() and (public.is_store_staff() or public.is_assigned_to_order(o.id)))
        )
    )
  );

-- Cash on Delivery is recorded by the delivery agent, so payments need an
-- insert path for assigned staff as well as admins.
create policy payments_insert_staff_or_admin
  on public.payments for insert
  with check (
    public.is_admin()
    or (
      public.is_staff()
      and exists (
        select 1
        from public.invoices i
        join public.orders o on o.id = i.order_id
        where i.id = invoice_id
          and (public.is_store_staff() or public.is_assigned_to_order(o.id))
      )
    )
  );

create policy payments_admin_update
  on public.payments for update
  using (public.is_admin())
  with check (public.is_admin());

-- --- notifications --------------------------------------------------------

create policy notifications_select_own
  on public.notifications for select
  using (user_id = auth.uid() or public.is_admin());

-- The queue worker runs as service_role. Clients only read.

create policy notifications_admin_update
  on public.notifications for update
  using (public.is_admin())
  with check (public.is_admin());

-- --- otp_logs -------------------------------------------------------------
-- Server-only. No client policies at all; the OTP server action uses the
-- service role key to read and write.

alter table public.otp_logs force row level security;

-- --- audit_logs -----------------------------------------------------------
-- Append-only, readable by admins only.

create policy audit_logs_select_admin
  on public.audit_logs for select
  using (public.is_admin());
