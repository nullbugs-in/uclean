-- Admin pickup management: realtime delivery of customer bookings.
--
-- Two things this adds, both additive:
--
--   1. `orders` and `pickup_assignments` are published to Supabase Realtime, so
--      a booking made in the customer wizard reaches the admin panel without a
--      refresh. The architecture doc (section 7.1) requires the request to
--      "appear instantly in the admin and staff dashboards"; nothing published
--      either table before this, so that could not have worked.
--
--   2. A composite index for the admin pickup list, which filters on exactly
--      this pair. The existing indexes are single-column (`orders_status`,
--      `orders_customer_id`), so the list query would have had to pick one and
--      filter on the other.

-- ---------------------------------------------------------------------------
-- Realtime publication
-- ---------------------------------------------------------------------------

-- Idempotent: `alter publication ... add table` raises when the table is
-- already a member, and this migration may be replayed against a database where
-- someone enabled realtime by hand in the dashboard.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'pickup_assignments'
  ) then
    alter publication supabase_realtime add table public.pickup_assignments;
  end if;
end;
$$;

-- Realtime delivers rows through the same RLS policies as a normal select, so
-- this changes what an admin sees and nothing else. A customer subscribing to
-- `orders` gets only their own rows, because `orders_select_by_visibility`
-- already requires `customer_id = auth.uid() or public.is_admin() or ...`.

-- ---------------------------------------------------------------------------
-- Index for the admin pickup list
-- ---------------------------------------------------------------------------

-- Status first, then slot date: the list is always "these statuses, over this
-- date window", and it is ordered by slot date so the agent's day reads top to
-- bottom.
create index if not exists orders_status_slot_date_idx
  on public.orders (status, pickup_slot_date);
