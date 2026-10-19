-- ---------------------------------------------------------------------------
-- 14_notification_mark_one_read
--
-- Marking a single notification read when the customer taps it.
--
-- Migration 13 added `read_at` and `mark_all_notifications_read()`. Tapping a
-- message in the bell needs the same thing for one row rather than all of them,
-- and it needs the same guarantees:
--
--   - The caller may only touch their own notifications.
--   - The caller may only touch `read_at`. `status` is the delivery state owned
--     by the cron worker and shown in the admin message log (section 8.7), and an
--     UPDATE policy cannot be limited to a column, so granting one would also
--     hand the caller `status`, `attempts` and `last_error` - enough to make a
--     failed delivery look sent. Hence a function rather than a policy, for the
--     same reason as in 13.
--   - Only rows that are actually unread are touched, so `updated_at` is not
--     rewritten across a customer's whole history and a double tap is a no-op.
--
-- Returns whether a row was changed, rather than void. The bell uses it to keep
-- its optimistic badge honest: a tap on an already-read message should not
-- report work it did not do.
-- ---------------------------------------------------------------------------

create or replace function public.mark_notification_read(p_notification_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  marked boolean;
begin
  update public.notifications
     set read_at = now()
   where id = p_notification_id
     and user_id = auth.uid()
     and read_at is null;

  marked := found;

  return marked;
end;
$$;

revoke all on function public.mark_notification_read(bigint) from public, anon;
grant execute on function public.mark_notification_read(bigint) to authenticated, service_role;