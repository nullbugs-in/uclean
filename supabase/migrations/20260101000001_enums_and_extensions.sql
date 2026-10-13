-- ---------------------------------------------------------------------------
-- 01_enums_and_extensions
--
-- Shared types and generic helpers. Nothing here references a table, so this
-- migration is safe to run first and every later migration may depend on it.
--
-- Enum values mirror the order state machine in the architecture document
-- (section 7) exactly. Adding a value requires a matching entry in
-- src/lib/order-status.ts.
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto;

-- --- Roles -----------------------------------------------------------------
-- The architecture doc (section 11) defines exactly three roles. Store-wide
-- staff visibility is NOT a fourth role: it is the boolean
-- profiles.can_view_all_orders, because section 10 refers to a 'store staff'
-- role that section 11's enum does not contain.
create type public.app_role as enum ('customer', 'staff', 'admin');

-- --- Orders ----------------------------------------------------------------
create type public.order_status as enum (
  'pickup_requested',
  'agent_assigned',
  'picked_up',
  'under_analysis',
  'invoice_sent',
  'payment_pending',
  'paid',
  'in_process',
  'ready_for_delivery',
  'out_for_delivery',
  'delivered',
  'cancelled'
);

create type public.order_source as enum ('online', 'walk_in');

create type public.payment_mode as enum (
  'cod',
  'upi',
  'card',
  'netbanking',
  'wallet'
);

-- --- Billing ---------------------------------------------------------------
create type public.invoice_status as enum ('draft', 'sent', 'paid', 'void');
create type public.payment_status as enum (
  'pending',
  'collected',
  'failed',
  'refunded'
);

-- --- Logistics -------------------------------------------------------------
create type public.assignment_type as enum ('pickup', 'delivery');
create type public.assignment_status as enum (
  'assigned',
  'in_progress',
  'completed',
  'cancelled'
);

-- --- Notifications ---------------------------------------------------------
create type public.notification_channel as enum ('whatsapp', 'sms');
create type public.notification_status as enum (
  'queued',
  'sending',
  'sent',
  'failed',
  'read'
);

-- Template names map 1:1 onto the WhatsApp templates that need Meta approval
-- (architecture doc, section 13). Approval can take several days, so these
-- names should not be churned casually.
create type public.notification_template as enum (
  'otp',
  'order_confirmed',
  'agent_assigned',
  'picked_up',
  'invoice_ready',
  'payment_received',
  'out_for_delivery',
  'delivered'
);

create type public.otp_purpose as enum ('login', 'pickup_number_verify');

-- --- Generic helpers -------------------------------------------------------

-- Keeps updated_at honest without every writer remembering to set it.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Generic BEFORE UPDATE trigger that stamps new.updated_at = now().';
