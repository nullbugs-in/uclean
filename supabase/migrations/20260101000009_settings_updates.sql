-- ---------------------------------------------------------------------------
-- 09_settings_updates
--
-- Add configurable cut-off and auto-assign settings.
-- ---------------------------------------------------------------------------

alter table public.store_settings
  add column if not exists cut_off_minutes integer not null default 60
    check (cut_off_minutes >= 0 and cut_off_minutes <= 480),
  add column if not exists auto_assign boolean not null default true;

comment on column public.store_settings.cut_off_minutes is
  'No bookings allowed within this many minutes of the pickup slot start time.';
comment on column public.store_settings.auto_assign is
  'If true, auto-assign agents when an order is created (Phase 1 rule).';
