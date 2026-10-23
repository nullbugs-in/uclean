-- ---------------------------------------------------------------------------
-- 13_notification_read_at
--
-- Recording that a customer has seen a message.
--
-- The navbar bell counted "messages from the last week" rather than unread ones,
-- because there was nowhere to record the difference. `notifications.status`
-- carries `read` as a value, which made it look like the column that should be
-- used, but `status` is the *delivery* state owned by the cron worker and shown
-- in the admin message log (section 8.7). Writing 'read' there would record
-- "seen" in the one column that means "delivered" - marking messages that were
-- never actually sent as read, and blinding the admin log to real delivery
-- failures.
--
-- So `read_at` is a separate column, written only by the recipient and by
-- nobody else. The delivery worker never touches it.
--
-- Marking is done through a function rather than a policy, and that is the whole
-- point of the design. An UPDATE policy could not be restricted to a column, so
-- granting one would also have granted the caller `status`, `attempts`,
-- `last_error` and the rest - a customer would be able to stamp their own
-- history 'sent' and hide a failed delivery from the admin. A function can only
-- do the one thing it is written to do.
-- ---------------------------------------------------------------------------

alter table public.notifications
  add column if not exists read_at timestamptz;

comment on column public.notifications.read_at is
  'When the recipient saw this message in the navbar bell. NULL means unread. Deliberately separate from status, which records delivery and is owned by the send worker.';

-- The bell counts unread rows on every render of every public page, and the
-- read-all update scans for them too, so this pair is read constantly. Partial
-- on read_at is null because once a message is read it leaves the badge forever
-- and only the queue and the admin log still care about it.
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

-- Marks every one of the caller's own unread messages as read.
--
-- SECURITY DEFINER because the row-level policies on `notifications` allow a
-- user to select their rows but not to update them - deliberately, since an
-- update policy cannot be limited to one column (see the header). `auth.uid()`
-- is read from the request's JWT, so it is the caller's id and not the function
-- owner's, which is what makes the WHERE clause an identity check rather than a
-- hint.
--
-- Scoped to rows that are already unread so the update is a no-op on a second
-- press, and so `updated_at` is not rewritten across the customer's whole
-- history each time they open the bell.
create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  marked integer;
begin
  update public.notifications
     set read_at = now()
   where user_id = auth.uid()
     and read_at is null;

  get diagnostics marked = row_count;

  return marked;
end;
$$;

revoke all on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.mark_all_notifications_read() to authenticated, service_role;