-- ---------------------------------------------------------------------------
-- 06_billing
--
-- Invoices and payment records. Phase 1 is Cash on Delivery; Phase 2 adds a
-- gateway confirmed by webhook, never by the browser redirect (section 9).
-- ---------------------------------------------------------------------------

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete cascade,

  invoice_no text not null unique default ('INV-' || to_char(now(), 'YYMM') || '-' ||
    lpad(nextval('public.order_no_seq')::text, 5, '0')),

  -- Snapshot of the billed customer, independent of later profile edits.
  customer_name text not null,
  customer_mobile text not null,
  billing_address text not null,

  subtotal numeric(10, 2) not null default 0 check (subtotal >= 0),
  tax numeric(10, 2) not null default 0 check (tax >= 0),
  discount numeric(10, 2) not null default 0 check (discount >= 0),
  delivery_charge numeric(10, 2) not null default 0 check (delivery_charge >= 0),
  total numeric(10, 2) not null default 0 check (total >= 0),

  status public.invoice_status not null default 'draft',

  -- Signed, single-invoice scoped, expiring token used by /pay/[token].
  -- Section 12 requires it be unguessable; the server signs a random nonce with
  -- PAYMENT_TOKEN_SECRET rather than storing the token itself.
  pay_token text,
  pay_token_expires_at timestamptz,

  sent_at timestamptz,
  paid_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

-- A pay token must carry an expiry whenever it exists, so a leaked link can
-- never become a permanent one.
create or replace function public.enforce_pay_token_expiry()
returns trigger
language plpgsql
as $$
begin
  if new.pay_token is not null and new.pay_token_expires_at is null then
    raise exception 'pay_token requires pay_token_expires_at'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger invoices_require_token_expiry
  before insert or update on public.invoices
  for each row execute function public.enforce_pay_token_expiry();

-- ---------------------------------------------------------------------------

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,

  mode public.payment_mode not null,
  -- Section 12: webhook handlers must be idempotent. This unique index is what
  -- makes replaying a gateway webhook a no-op instead of a double credit.
  gateway_payment_id text unique,
  gateway_order_id text,
  gateway_signature_valid boolean,

  amount numeric(10, 2) not null check (amount >= 0),
  status public.payment_status not null default 'pending',

  -- Set when a delivery agent records Cash on Delivery (section 6.4).
  collected_by uuid references public.profiles (id) on delete set null,
  collected_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

create index payments_invoice_lookup on public.payments (invoice_id);
