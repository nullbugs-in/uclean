-- ---------------------------------------------------------------------------
-- 12_admin_booking_process
--
-- Supports the admin Bookings module driving a booking through its operational
-- stages: a per-stage process note, optimistic concurrency on the status
-- change, and the indexes the admin list filters need.
--
-- Additive only. No table is dropped, altered destructively, or truncated, and
-- no existing policy is weakened. The two changes to existing objects are both
-- `create or replace` on a function the admin path is the only caller of.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- Section A. Indexes for the admin bookings list
-- ===========================================================================

-- The list filters on pickup date and sorts on pickup time. Without these both
-- are sequential scans, which is fine at a single store's booking volume and
-- is not fine the moment an admin filters by a date range on a busy day.
create index if not exists orders_pickup_slot_date_idx
  on public.orders (pickup_slot_date);

-- The default sort is newest first. `orders_status_created_at_idx` already
-- covers (status, created_at desc); this covers the unfiltered ordering.
create index if not exists orders_created_at_idx
  on public.orders (created_at desc);

-- ---------------------------------------------------------------------------
-- Trigram index for the admin search box.
--
-- The search is an ILIKE over order_no, customer_name and customer_mobile, which
-- Postgres can only satisfy with a sequential scan without pg_trgm. This was a
-- documented caveat rather than a bug; the admin list is the only thing that
-- searches on these columns, so this is where the cost belongs.
-- ---------------------------------------------------------------------------
create extension if not exists pg_trgm;

create index if not exists orders_order_no_trgm_idx
  on public.orders using gin (order_no gin_trgm_ops);

create index if not exists orders_customer_name_trgm_idx
  on public.orders using gin (customer_name gin_trgm_ops);

create index if not exists orders_customer_mobile_trgm_idx
  on public.orders using gin (customer_mobile gin_trgm_ops);

-- ===========================================================================
-- Section B. The status change note reaches order_status_history
-- ===========================================================================

-- The admin brief asks for an optional internal note on every stage change.
-- `order_status_history.note` has existed since migration 04 and is already
-- projected by the customer query, but nothing ever wrote it: the trigger
-- inserted four columns and left it null, so every note was silently dropped.
--
-- The note cannot be passed as a trigger argument, because `orders_on_status_change`
-- is an AFTER UPDATE trigger and Postgres gives triggers no parameters. The
-- standard way through is a transaction-local GUC: `admin_change_order_status`
-- (section C) sets `app.status_note` and this trigger reads it back with
-- `current_setting`. Both run inside the same transaction, which is exactly what
-- makes it safe.
--
-- Everything else here is unchanged from migration 08: same history insert, same
-- audit row, same template mapping, same queued WhatsApp. SECURITY DEFINER is
-- retained so the history, audit and notification writes still bypass RLS.
create or replace function public.handle_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template public.notification_template;
  v_note text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Null rather than '' when unset, so a stage change made anywhere other than
  -- admin_change_order_status stores a null note exactly as it did before.
  v_note := nullif(current_setting('app.status_note', true), '');

  insert into public.order_status_history (order_id, from_status, to_status, changed_by, note)
  values (new.id, old.status, new.status, auth.uid(), v_note);

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

-- ===========================================================================
-- Section C. admin_change_order_status
-- ===========================================================================

-- The one function the admin Bookings module uses to move a booking forward.
--
-- It exists as a single function rather than as separate PostgREST calls for
-- three reasons that only work together:
--
--   1. NOTE PLUMBING. `set_config(..., true)` is transaction-local. PostgREST
--      opens a fresh transaction per HTTP request, so setting the GUC in one
--      call and updating the row in another would leave the trigger reading an
--      empty setting. One function is one transaction, so the note survives.
--
--   2. ATOMICITY. The status write, the history row, the audit row and the
--      queued notification all commit together or not at all. The customer
--      timeline and the admin audit log cannot disagree about what happened.
--
--   3. CONCURRENCY. Two admins with the same booking open can both pass an
--      application-level "is this transition legal" check before either writes.
--      The second write then silently wins, and the first admin is shown a
--      success for a change that was overwritten. Passing the status the caller
--      last read, and comparing it under a row lock, turns that into a conflict
--      the UI can report.
--
-- On security: this is SECURITY DEFINER because it must write `audit_logs`
-- rows naming the acting admin, and RLS on audit_logs is admin-or-self. It does
-- not widen access, because the very first statement re-checks `is_admin()` and
-- raises otherwise. `enforce_order_transition` still runs as a BEFORE UPDATE
-- trigger on this statement, so the state machine is still the gate: passing
-- `p_expected_status` correctly is necessary, never sufficient.
--
-- Grant is to `authenticated` rather than `service_role` because the admin is a
-- signed-in browser session, and the whole point of routing through this rather
-- than the service client is that `auth.uid()` is the real admin, so the history
-- and audit rows name them rather than nobody.
create or replace function public.admin_change_order_status(
  p_order_id uuid,
  p_to_status public.order_status,
  p_expected_status public.order_status,
  p_note text default null,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from public.order_status;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can change an order status'
      using errcode = '42501';
  end if;

  if p_order_id is null or p_to_status is null then
    raise exception 'Order id and target status are required'
      using errcode = '22023';
  end if;

  if p_expected_status is null then
    raise exception 'Expected status is required so a concurrent change is detected'
      using errcode = '22023';
  end if;

  -- Serialise against any other status change on this row. Without the lock
  -- two admins could both read the same p_expected_status and both proceed.
  select status into v_from
  from public.orders
  where id = p_order_id
  for update;

  if v_from is null then
    raise exception 'Order % not found', p_order_id using errcode = 'P0002';
  end if;

  -- 40001 is serialization_failure, which the client reads as "someone else got
  -- there first" rather than as a bug.
  if v_from is distinct from p_expected_status then
    raise exception
      'This booking has already moved to %, so your change was not applied.',
      v_from
      using errcode = '40001';
  end if;

  perform set_config('app.status_note', coalesce(p_note, ''), true);

  update public.orders
  set
    status = p_to_status,
    -- Only ever the reason a cancellation was given. This deliberately does NOT
    -- reuse cancellation_reason as a general note field: the admin action used
    -- to write every stage note there, which meant a "left at the gate" note on
    -- a pickup attempt would later be read as the reason the booking was
    -- cancelled.
    cancellation_reason = case
      when p_to_status = 'cancelled' then coalesce(p_reason, 'No reason given')
      else cancellation_reason
    end,
    updated_at = now()
  where id = p_order_id;
end;
$$;

revoke all on function public.admin_change_order_status(uuid, public.order_status, public.order_status, text, text) from public;
grant execute on function public.admin_change_order_status(uuid, public.order_status, public.order_status, text, text) to authenticated;

-- ===========================================================================
-- Section D. Invoice lookup for the admin list
-- ===========================================================================

-- `invoices.order_id` is already unique, so this is a uniqueness constraint
-- doing index duty. It is created only if missing, because a database that
-- already has the unique constraint cannot create a second index on the column.
-- The admin bookings list filters on invoice status, and without an index on
-- `status` that filter is a scan of every invoice ever issued.
create index if not exists invoices_status_idx
  on public.invoices (status);
