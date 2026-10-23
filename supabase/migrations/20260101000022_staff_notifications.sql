-- ---------------------------------------------------------------------------
-- 22_staff_notifications
--
-- The staff notification + reminder inbox: a bell in the staff panel topbar
-- with an unread badge, a newest-first scrollable list, a "read all" action,
-- and an instant toast when an order is assigned to the signed-in staff member.
--
-- This is deliberately a new table rather than a reuse of
-- `public.notifications`, which is the customer WhatsApp delivery queue: its
-- rows are drained by the send worker, retried with backoff, and logged in the
-- admin message log. A staff row queued there would be dispatched to a
-- WhatsApp provider as if it were a customer message. Staff notifications are
-- panel-only and never leave the database.
--
-- Assignment notifications are written by a trigger on `pickup_assignments`,
-- next to the existing `assignments_refresh_agent_load` trigger. That one hook
-- covers every writer - the manual upsert in `assignPickupAgent`, the
-- `auto_assign_agent` RPC, a release-and-reassign - including the delivery
-- leg, which does not touch `orders.status` and therefore fires no other
-- trigger today. Dedupe is structural: a row is written only when the
-- assignment actually gained a new agent (or came back from 'cancelled'), so
-- re-running the same upsert writes nothing.
--
-- Read state mirrors migrations 13/14 (`notifications.read_at`): it lives in
-- its own column written only by the recipient, through SECURITY DEFINER
-- functions read from `auth.uid()`, because an UPDATE policy cannot be limited
-- to one column and there is nothing to column-lock away here except the
-- principle. Realtime replication is added in the same idempotent block
-- migration 10 used; the streamed rows pass through the same RLS policy as a
-- select, so a staff session only ever receives its own rows.
-- ---------------------------------------------------------------------------

create table public.staff_notifications (
  id bigint generated always as identity primary key,
  -- The staff member the notification belongs to. Agents.id is a profiles.id
  -- (migration 05, backfill 16), so this is the session identity, not a join.
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Null-able so a future reminder without an order (holiday notice, and so
  -- on) needs no schema change. Assignment and reminder rows always set it.
  order_id uuid references public.orders (id) on delete cascade,
  type text not null check (
    type in (
      'pickup_assigned',
      'delivery_assigned',
      'pickup_reminder',
      'delivery_reminder'
    )
  ),
  -- What the bell renders: order_no, customer name, slot, how the order was
  -- assigned. Kept in the row so the bell never has to join orders.
  payload jsonb not null default '{}'::jsonb,
  -- Null until the recipient reads it. Mirrors notifications.read_at: the
  -- recipient writes it and nobody else, through the functions below.
  read_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.staff_notifications is
  'Per-staff bell notifications and reminders (pickup/delivery leg assignments, slot reminders). Panel-only; never part of the customer WhatsApp queue.';

-- The badge counts unread rows on every staff page render and the read-all
-- update scans them, so this uses the index pair migration 13 chose for the
-- customer bell: partial on read_at is null, because a read notification
-- leaves the badge forever.
create index if not exists staff_notifications_user_unread_idx
  on public.staff_notifications (user_id, created_at desc)
  where read_at is null;

create index if not exists staff_notifications_user_created_idx
  on public.staff_notifications (user_id, created_at desc);

-- Reminder dedupe: the cron route checks (user, order, type) before
-- inserting, and this index keeps that check and the insert itself backed.
create index if not exists staff_notifications_user_order_type_idx
  on public.staff_notifications (user_id, order_id, type);

-- RLS. A staff member sees exactly their own rows; an admin resolves their own
-- id like anyone else, because the staff panel is the only surface that
-- renders these and admins appear there as agents-in-waiting, not as censors.
alter table public.staff_notifications enable row level security;

create policy staff_notifications_select_own
  on public.staff_notifications
  for select
  to authenticated
  using (user_id = auth.uid());

-- There is deliberately no UPDATE or DELETE policy: read state is written
-- through SECURITY DEFINER functions (below) for the same reason migrations
-- 13/14 avoided an update policy on the customer notifications - a function
-- can only do the one thing it is written to do.

-- ---------------------------------------------------------------------------
-- Read state (mirrors migrations 13/14).
--
-- `auth.uid()` is read from the request's JWT, so the WHERE clause is an
-- identity check rather than a hint. Marking is scoped to rows that are still
-- unread, so a double press is a no-op.
-- ---------------------------------------------------------------------------

create or replace function public.mark_all_staff_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  marked integer;
begin
  update public.staff_notifications
     set read_at = now()
   where user_id = auth.uid()
     and read_at is null;

  get diagnostics marked = row_count;

  return marked;
end;
$$;

revoke all on function public.mark_all_staff_notifications_read() from public, anon;
grant execute on function public.mark_all_staff_notifications_read() to authenticated, service_role;

create or replace function public.mark_staff_notification_read(p_notification_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  marked boolean;
begin
  update public.staff_notifications
     set read_at = now()
   where id = p_notification_id
     and user_id = auth.uid()
     and read_at is null;

  marked := found;

  return marked;
end;
$$;

revoke all on function public.mark_staff_notification_read(bigint) from public, anon;
grant execute on function public.mark_staff_notification_read(bigint) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Assignment notifications.
-- ---------------------------------------------------------------------------

create or replace function public.trg_staff_notifications_on_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_slot_label text;
  v_slot_start text;
  v_slot_date date;
  v_assigned_by_name text;
  v_type text;
begin
  -- An agent-less row is history (agent removal) or a placeholder; there is
  -- nobody to notify.
  if new.agent_id is null then
    return null;
  end if;

  -- Only a genuine hand-over is worth a notification: an insert, a move to a
  -- different agent, or a release followed by a re-assign (even to the same
  -- agent). Re-running an upsert with an unchanged agent writes nothing, which
  -- is the dedupe guarantee the bell relies on.
  if tg_op = 'UPDATE'
     and old.agent_id is not distinct from new.agent_id
     and not (old.status = 'cancelled' and new.status = 'assigned') then
    return null;
  end if;

  select o.order_no, o.customer_name, o.address_snapshot,
         o.pickup_slot_date, o.delivery_slot_date,
         o.pickup_slot_id, o.delivery_slot_id
    into v_order
    from public.orders o
   where o.id = new.order_id;

  if not found then
    return null;
  end if;

  if new.assigned_by is not null then
    select p.full_name into v_assigned_by_name
      from public.profiles p
     where p.id = new.assigned_by;
  end if;

  -- The label the staff panel already shows for a slot: the admin-set label
  -- when there is one, otherwise "10:00-12:00" from the times.
  if new.type = 'pickup' then
    v_type := 'pickup_assigned';
    v_slot_date := v_order.pickup_slot_date;

    if v_order.pickup_slot_id is not null then
      select coalesce(t.label, t.start_time || '-' || t.end_time),
             t.start_time
        into v_slot_label, v_slot_start
        from public.time_slots t
       where t.id = v_order.pickup_slot_id;
    end if;
  else
    v_type := 'delivery_assigned';
    v_slot_date := v_order.delivery_slot_date;

    if v_order.delivery_slot_id is not null then
      select coalesce(t.label, t.start_time || '-' || t.end_time),
             t.start_time
        into v_slot_label, v_slot_start
        from public.time_slots t
       where t.id = v_order.delivery_slot_id;
    end if;
  end if;

  insert into public.staff_notifications (user_id, order_id, type, payload)
  values (
    new.agent_id,
    new.order_id,
    v_type,
    jsonb_build_object(
      'leg', new.type,
      'order_no', v_order.order_no,
      'customer_name', v_order.customer_name,
      'address', v_order.address_snapshot,
      'slot_date', v_slot_date,
      'slot_label', v_slot_label,
      'slot_start', v_slot_start,
      'assigned_by_type', new.assigned_by_type,
      'assigned_by_name', v_assigned_by_name
    )
  );

  return null; -- ignored for AFTER triggers
end;
$$;

create trigger staff_notifications_on_assignment
  after insert or update of agent_id, status on public.pickup_assignments
  for each row execute function public.trg_staff_notifications_on_assignment();

-- ---------------------------------------------------------------------------
-- Realtime publication
--
-- Same idempotent block migration 10 used for orders/pickup_assignments,
-- because `alter publication ... add table` raises when the table is already a
-- member and this migration may be replayed against a database where realtime
-- was enabled by hand in the dashboard.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'staff_notifications'
  ) then
    alter publication supabase_realtime add table public.staff_notifications;
  end if;
end;
$$;

-- Realtime delivers rows through the same RLS policies as a normal select, so
-- the bell's browser client only ever receives the signed-in staff member's
-- own rows, never a colleague's.
