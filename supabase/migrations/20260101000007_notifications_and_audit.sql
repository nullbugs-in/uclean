-- ---------------------------------------------------------------------------
-- 07_notifications_and_audit
--
-- The notification queue described in section 13: events insert rows here, a
-- worker sends them and retries failures, and webhooks write back delivery
-- status. Nothing in the request path calls WhatsApp or SMS directly.
-- ---------------------------------------------------------------------------

create table public.notifications (
  id bigint generated always as identity primary key,

  -- NULL for system-initiated messages with no user context, e.g. a slot
  -- reminder broadcast. Rows that do have a user are visible to that user.
  user_id uuid references public.profiles (id) on delete cascade,

  -- E.164, or NULL to fall back to profiles.mobile / profiles.whatsapp_number.
  destination text,

  channel public.notification_channel not null,
  template public.notification_template not null,
  payload jsonb not null default '{}'::jsonb,

  status public.notification_status not null default 'queued',
  provider_message_id text,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts > 0),
  last_error text,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,

  -- Links an invoice message to the invoice it points at, for the admin
  -- message log (section 8.7).
  invoice_id uuid references public.invoices (id) on delete cascade,
  order_id uuid references public.orders (id) on delete cascade,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger notifications_set_updated_at
  before update on public.notifications
  for each row execute function public.set_updated_at();

create index notifications_queue
  on public.notifications (status, next_attempt_at)
  where status in ('queued', 'failed');

create index notifications_user_log
  on public.notifications (user_id, created_at desc);

-- Provider webhook correlation. Section 12 requires verifying signatures; the
-- provider message id is what lets us find the row to update.
create index notifications_provider_id
  on public.notifications (provider_message_id);

-- ---------------------------------------------------------------------------
-- OTP log (section 11): supports rate limiting per mobile and keeps an audit
-- trail of verification attempts.
-- ---------------------------------------------------------------------------

create table public.otp_logs (
  id bigint generated always as identity primary key,
  mobile text not null,
  user_id uuid references public.profiles (id) on delete set null,
  purpose public.otp_purpose not null default 'login',
  sent_at timestamptz not null default now(),
  verified_at timestamptz,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  -- Client IP, kept so OTP requests can be rate limited per IP as well as per
  -- mobile number (section 12).
  request_ip inet
);

create index otp_logs_rate_limit on public.otp_logs (mobile, sent_at desc);

-- ---------------------------------------------------------------------------
-- Audit log (section 12): price edits, reassignments, manual status changes.
-- ---------------------------------------------------------------------------

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_entity_lookup
  on public.audit_logs (entity, entity_id, created_at desc);

create index audit_logs_actor_lookup
  on public.audit_logs (actor_id, created_at desc);
