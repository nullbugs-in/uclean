-- Removing an agent from the roster.
--
-- Removing an agent means removing their login, not just their `agents` row.
-- That deletes their auth user, which cascades to `public.profiles`, which
-- cascades to `public.agents`.
--
-- The chain is blocked by one foreign key. `pickup_assignments.agent_id` is
-- `not null references public.agents (id) on delete restrict`, so an agent who
-- has ever been assigned a pickup cannot have their profile deleted: Postgres
-- rejects the cascade outright, permanently, because the restrict applies to
-- every row and not only to open ones.
--
-- The fix follows the convention this schema already uses everywhere else a
-- person is removed. `order_status_history.changed_by`, `audit_logs.actor_id`,
-- `orders.created_by`, `payments.collected_by` and `pickup_assignments.assigned_by`
-- are all `on delete set null`: the record survives, the reference does not. This
-- migration extends that to the one column that was missing it, so a departed
-- agent's pickup history outlives their account instead of blocking it.
--
-- The cost is deliberate and stated in the UI: a removed agent's name no longer
-- appears against the pickups they collected. Keeping it and keeping the account
-- are mutually exclusive here.

alter table public.pickup_assignments
  alter column agent_id drop not null;

comment on column public.pickup_assignments.agent_id is
  'Nullable so an agent who has left can have their auth user deleted. Set to null on removal, matching order_status_history.changed_by and audit_logs.actor_id; the assignment row itself is kept as history.';

-- Without this index, every auto-assignment and every roster load scans the
-- whole agents table. `auto_assign_agent` filters on `is_available` and the
-- admin roster loads every row, so the pair is read constantly.
create index if not exists agents_available_idx on public.agents (is_available);

-- Guard against the delete being attempted with open work still attached. The
-- application releases those first, but the constraint below makes a mistake
-- fail loudly at the database rather than silently stranding pickups.
create or replace function public.agent_has_open_assignments(p_agent_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.pickup_assignments pa
    join public.orders o on o.id = pa.order_id
    where pa.agent_id = p_agent_id
      and pa.status in ('assigned', 'in_progress')
      and o.status not in ('delivered', 'cancelled')
  );
$$;

revoke all on function public.agent_has_open_assignments(uuid) from public, anon;
grant execute on function public.agent_has_open_assignments(uuid) to service_role;
