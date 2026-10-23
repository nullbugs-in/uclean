-- ---------------------------------------------------------------------------
-- 23_whatsapp_settings
--
-- The WhatsApp Cloud API configuration the admin Settings page edits.
--
-- Its neighbour `staff_notifications` (migration 22) documents the rule for
-- new tables: new table when the semantics differ. These are deliberately not
-- columns on `store_settings` -- that row is publicly readable
-- (`store_settings_public_read using (true)`) and pricing/pages read it from
-- everywhere, while this one is an integration switch only admins touch.
--
-- There are no credentials in here by design. The Cloud API access token and
-- phone number id live in server-side environment variables
-- (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID, already listed in
-- .env.example), because a secret at rest in Postgres would also be at rest in
-- audit_logs (writeAudit records plaintext before/after jsonb) and in any
-- future row export. What the panel needs - the on/off switch, the
-- Meta-approved template mapping, and the last connection test's outcome -
-- is all non-secret and lives here.
-- ---------------------------------------------------------------------------

create table public.whatsapp_settings (
  -- Singleton, exactly like store_settings (id = true).
  id boolean primary key check (id),
  -- The integration switch. When off, the notification queue worker keeps
  -- reporting a "no sender configured" failure instead of sending, which is
  -- the same behaviour as before this table existed.
  enabled boolean not null default false,
  -- Internal template name to Meta-approved template config:
  -- { "order_confirmed": { "name": "uclean_pickup_confirmed", "language": "en_US" }, ... }
  -- Names and languages are not secrets, but they are Meta approval state,
  -- so they live here rather than in code.
  template_mapping jsonb not null default '{}'::jsonb,
  -- The outcome of the admin panel's "send test message" action, which is
  -- what "connection status" is derived from. Null until the first test.
  last_test_ok boolean,
  last_test_at timestamptz,
  last_test_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_settings_last_test_requires_time check (
    last_test_at is not null or last_test_ok is null
  )
);

comment on table public.whatsapp_settings is
  'WhatsApp Cloud API integration state (enabled switch, Meta template mapping, last connection-test result). Credentials themselves live in server env, never here, because audit_logs stores plaintext before/after payloads.';

create trigger whatsapp_settings_set_updated_at
  before update on public.whatsapp_settings
  for each row execute function public.set_updated_at();

-- The migration writes the singleton row itself, so a project upgraded or
-- restored from a dump still has it without re-running the seed.
insert into public.whatsapp_settings (id) values (true)
  on conflict (id) do nothing;

-- RLS. Admins read and write through their request-scoped client (the calling
-- actions open with requireAdmin, and this policy is the second gate, the same
-- deliberate duplication as store_settings_admin_write). There is no insert
-- policy: the singleton row exists from this migration onwards, and the
-- service role that the notification worker uses bypasses RLS anyway.
alter table public.whatsapp_settings enable row level security;

create policy whatsapp_settings_admin_select
  on public.whatsapp_settings
  for select
  to authenticated
  using (public.is_admin());

create policy whatsapp_settings_admin_update
  on public.whatsapp_settings
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
