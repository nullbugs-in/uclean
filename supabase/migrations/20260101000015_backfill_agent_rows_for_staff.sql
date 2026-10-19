-- ---------------------------------------------------------------------------
-- 15_backfill_agent_rows_for_staff
--
-- The agent roster drew from the `agents` table alone, so anyone who held the
-- staff role without an `agents` row was invisible on /admin/agents and could
-- not be assigned a pickup at all. `createAgent` writes both rows together, so
-- this gap only opens for accounts that reached the staff role by another
-- route - a seeded profile, or an existing customer promoted through
-- `setStaffRole`.
--
-- The backfill gives every staff account a roster row with the same defaults
-- `createAgent` uses, so the two paths produce the same shape.
--
-- Staff only. The roster is the pool of people who collect and return laundry,
-- which is the staff role; an admin who also carries an `agents` row (older
-- data did allow it) is not someone the shop dispatches, and listing them here
-- puts an administrator in the pool of people taking pickups.
--
-- `is_available` is true so they can be assigned immediately: someone who can
-- see the list and has never been dismissed should not have to be told they are
-- on duty before they can work. Someone who should not be taking pickups is
-- one click away from off duty, which is reversible; being invisible is not.
--
-- Idempotent: keyed on the primary key, so re-running is a no-op.
-- ---------------------------------------------------------------------------

insert into public.agents (id, zone, vehicle, is_available, current_load)
select
  p.id,
  null,
  null,
  true,
  0
from public.profiles as p
where p.role = 'staff'
  and not exists (
    select 1 from public.agents as a where a.id = p.id
  )
on conflict (id) do nothing;