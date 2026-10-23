-- ---------------------------------------------------------------------------
-- 19_pricing_catalog
--
-- The public price list (`src/lib/pricing.ts` and everything it feeds: /pricing,
-- the /book wizard, the walk-in counter and the invoice's option lookup) as
-- database tables, so admins can maintain it in one place instead of shipping a
-- code change for every price.
--
-- Three tables mirror the shape the UI already renders:
--
--   pricing_groups   the six subcategories (Laundry Services, Adult Wear, ...)
--   pricing_items    one service ("Shirt / Pant / T-shirt / Kurta")
--   pricing_options  one priced line under it (Dry Cleaning at 99 / piece)
--
-- Express is NOT stored. It is derived at read time as a flat multiple of the
-- Regular list (see `deriveExpressCategory` in src/lib/pricing.ts), so the two
-- speeds can never drift apart. That single decision is why this seed is only
-- the Regular figures.
--
-- The legacy flat `services` table is dropped: nothing reads it anymore except
-- the old admin catalogue page it backed, and bookings/invoices carry their own
-- line name and price, so history survives untouched.
-- ---------------------------------------------------------------------------

create table public.pricing_groups (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  -- Group-wide turnaround, used where every item shares one (Shoe Cleaning).
  turnaround text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint pricing_groups_slug_unique unique (slug)
);

create trigger pricing_groups_set_updated_at
  before update on public.pricing_groups
  for each row execute function public.set_updated_at();

create table public.pricing_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.pricing_groups (id) on delete cascade,
  -- Stable within its group; the booking wizard's selection key is
  -- "<group slug>/<item slug>/<option index>", so renames must not regenerate it.
  slug text not null,
  name text not null,
  image_url text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint pricing_items_slug_unique unique (group_id, slug)
);

create trigger pricing_items_set_updated_at
  before update on public.pricing_items
  for each row execute function public.set_updated_at();

create index pricing_items_group_sort_idx
  on public.pricing_items (group_id, is_active, sort_order);

create table public.pricing_options (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.pricing_items (id) on delete cascade,
  -- What the price covers, e.g. "Dry Cleaning". Left null on items the name
  -- says enough (Wash & Fold), which is how the price list is printed too.
  label text,
  -- The struck-through figure printed in the list; always >= price.
  original_price numeric(10, 2) not null check (original_price >= 0),
  price numeric(10, 2) not null check (price >= 0),
  unit text not null default 'piece',
  turnaround text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint pricing_options_label_unique unique (item_id, label)
);

create trigger pricing_options_set_updated_at
  before update on public.pricing_options
  for each row execute function public.set_updated_at();

create index pricing_options_item_sort_idx
  on public.pricing_options (item_id, sort_order);

-- --- RLS -------------------------------------------------------------------
-- Public catalog rows, exactly like `services`: anyone may read what is active
-- (and an admin may read retired rows to restore them), writes are admin only.
-- Options have no is_active of their own; their visibility is their item's,
-- which the read path filters.

alter table public.pricing_groups  enable row level security;
alter table public.pricing_items   enable row level security;
alter table public.pricing_options enable row level security;

create policy pricing_groups_public_read
  on public.pricing_groups for select
  using (is_active or public.is_admin());

create policy pricing_groups_admin_write
  on public.pricing_groups for all
  using (public.is_admin())
  with check (public.is_admin());

create policy pricing_items_public_read
  on public.pricing_items for select
  using (is_active or public.is_admin());

create policy pricing_items_admin_write
  on public.pricing_items for all
  using (public.is_admin())
  with check (public.is_admin());

create policy pricing_options_public_read
  on public.pricing_options for select
  using (true);

create policy pricing_options_admin_write
  on public.pricing_options for all
  using (public.is_admin())
  with check (public.is_admin());

-- --- Seed ------------------------------------------------------------------
-- Transcribed 1:1 from the regular list in src/data/pricing.ts at the time of
-- the change. IDs are fixed, readable values (a v4-shaped block with a running
-- tail) so supabase/seed.sql can upsert the identical rows and item-to-option
-- links stay literal in both files.
--
-- Tail numbering: groups 001-006, items 011+, options 201+.

insert into public.pricing_groups (id, slug, name, turnaround, sort_order)
values
  ('00000000-0000-4000-8000-000000000001', 'laundry-services',  'Laundry Services', null,      1),
  ('00000000-0000-4000-8000-000000000002', 'adult-wear',        'Adult Wear',       null,      2),
  ('00000000-0000-4000-8000-000000000003', 'kids-wear',         'Kids Wear',        null,      3),
  ('00000000-0000-4000-8000-000000000004', 'shoe-cleaning',     'Shoe Cleaning',    '3 days',  4),
  ('00000000-0000-4000-8000-000000000005', 'household',         'Household',        '3 days',  5),
  ('00000000-0000-4000-8000-000000000006', 'curtain-cleaning',  'Curtain Cleaning', '3 days',  6)
on conflict (id) do update
  set slug = excluded.slug, name = excluded.name, turnaround = excluded.turnaround,
      sort_order = excluded.sort_order;

-- Laundry Services (3 items, one price each)
insert into public.pricing_items (id, group_id, slug, name, sort_order)
values
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001', 'wash-and-fold',   'Wash & Fold', 1),
  ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000001', 'wash-and-iron',   'Wash & Iron', 2),
  ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000001', 'premium-laundry', 'Premium Laundry', 3)
on conflict (id) do update
  set group_id = excluded.group_id, slug = excluded.slug, name = excluded.name, sort_order = excluded.sort_order;

insert into public.pricing_options (id, item_id, label, original_price, price, unit, turnaround, sort_order)
values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000011', null, 107,  89, 'kg', '24 to 48 hours', 1),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000012', null, 155, 129, 'kg', '2 to 3 days',    1),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000013', null, 239, 199, 'kg', '2 to 3 days',    1)
on conflict (id) do update
  set label = excluded.label, original_price = excluded.original_price, price = excluded.price,
      unit = excluded.unit, turnaround = excluded.turnaround, sort_order = excluded.sort_order;

-- Adult Wear (24 items, each with Dry Cleaning and Steam Ironing prices)
insert into public.pricing_items (id, group_id, slug, name, sort_order)
values
  ('00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000002', 'shirt-pant-tee-kurta',      'Shirt / Pant / T-shirt / Kurta',  1),
  ('00000000-0000-4000-8000-000000000022', '00000000-0000-4000-8000-000000000002', 'dhoti-long-top',            'Dhoti / Long top',                2),
  ('00000000-0000-4000-8000-000000000023', '00000000-0000-4000-8000-000000000002', 'kurta-designer-stone',      'Kurta (Designer / Stone work)',   3),
  ('00000000-0000-4000-8000-000000000024', '00000000-0000-4000-8000-000000000002', 'shorts',                    'Shorts',                          4),
  ('00000000-0000-4000-8000-000000000025', '00000000-0000-4000-8000-000000000002', 'blazer',                    'Blazer',                          5),
  ('00000000-0000-4000-8000-000000000026', '00000000-0000-4000-8000-000000000002', 'waistcoat-half-jacket',     'Waistcoat / Half Jacket',         6),
  ('00000000-0000-4000-8000-000000000027', '00000000-0000-4000-8000-000000000002', 'sweater-cardigan',          'Sweater / Cardigan',              7),
  ('00000000-0000-4000-8000-000000000028', '00000000-0000-4000-8000-000000000002', 'sharwani-plain',            'Sharwani Plain',                  8),
  ('00000000-0000-4000-8000-000000000029', '00000000-0000-4000-8000-000000000002', 'sharwani',                  'Sharwani',                        9),
  ('00000000-0000-4000-8000-000000000030', '00000000-0000-4000-8000-000000000002', 'jacket',                    'Jacket',                          10),
  ('00000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000002', 'churidar-set',              'Churidar Set (3 Pcs)',            11),
  ('00000000-0000-4000-8000-000000000032', '00000000-0000-4000-8000-000000000002', 'dupatta-scarf-muffler',     'Dupatta / Scarf / Muffler',       12),
  ('00000000-0000-4000-8000-000000000033', '00000000-0000-4000-8000-000000000002', 'saree-light',               'Saree Light',                     13),
  ('00000000-0000-4000-8000-000000000034', '00000000-0000-4000-8000-000000000002', 'saree-medium',              'Saree Medium',                    14),
  ('00000000-0000-4000-8000-000000000035', '00000000-0000-4000-8000-000000000002', 'saree-heavy',               'Saree Heavy',                     15),
  ('00000000-0000-4000-8000-000000000036', '00000000-0000-4000-8000-000000000002', 'blouse',                    'Blouse',                          16),
  ('00000000-0000-4000-8000-000000000037', '00000000-0000-4000-8000-000000000002', 'petticoat',                 'Petticoat',                       17),
  ('00000000-0000-4000-8000-000000000038', '00000000-0000-4000-8000-000000000002', 'choli-plain',               'Choli Plain',                     18),
  ('00000000-0000-4000-8000-000000000039', '00000000-0000-4000-8000-000000000002', 'lehenga-plain',             'Lehenga Plain',                   19),
  ('00000000-0000-4000-8000-000000000040', '00000000-0000-4000-8000-000000000002', 'choli-beaded',              'Choli Beaded',                    20),
  ('00000000-0000-4000-8000-000000000041', '00000000-0000-4000-8000-000000000002', 'lehenga-beaded',            'Lehenga Beaded',                  21),
  ('00000000-0000-4000-8000-000000000042', '00000000-0000-4000-8000-000000000002', 'choli-bridal',              'Choli Bridal',                    22),
  ('00000000-0000-4000-8000-000000000043', '00000000-0000-4000-8000-000000000002', 'lehenga-bridal',            'Lehenga Bridal',                  23)
on conflict (id) do update
  set group_id = excluded.group_id, slug = excluded.slug, name = excluded.name, sort_order = excluded.sort_order;

-- Every Adult Wear item carries the same two-label shape; each pair of rows
-- below is (Dry Cleaning, Steam Ironing) for the item whose id precedes them.
insert into public.pricing_options (id, item_id, label, original_price, price, unit, turnaround, sort_order)
values
  ('00000000-0000-4000-8000-000000000221', '00000000-0000-4000-8000-000000000021', 'Dry Cleaning',   119,  99, 'piece', '3 days', 1),
  ('00000000-0000-4000-8000-000000000222', '00000000-0000-4000-8000-000000000021', 'Steam Ironing',   24,  20, 'piece', '2 days', 2),
  ('00000000-0000-4000-8000-000000000223', '00000000-0000-4000-8000-000000000022', 'Dry Cleaning',   179, 149, 'piece', '3 days', 1),
  ('00000000-0000-4000-8000-000000000224', '00000000-0000-4000-8000-000000000022', 'Steam Ironing',   35,  29, 'piece', '2 days', 2),
  ('00000000-0000-4000-8000-000000000225', '00000000-0000-4000-8000-000000000023', 'Dry Cleaning',   179, 149, 'piece', '3 days', 1),
  ('00000000-0000-4000-8000-000000000226', '00000000-0000-4000-8000-000000000023', 'Steam Ironing',   83,  69, 'piece', '2 days', 2),
  ('00000000-0000-4000-8000-000000000227', '00000000-0000-4000-8000-000000000024', 'Dry Cleaning',    71,  59, 'piece', '3 days', 1),
  ('00000000-0000-4000-8000-000000000228', '00000000-0000-4000-8000-000000000024', 'Steam Ironing',   18,  15, 'piece', '2 days', 2),
  ('00000000-0000-4000-8000-000000000229', '00000000-0000-4000-8000-000000000025', 'Dry Cleaning',   299, 249, 'piece', '3 days', 1),
  ('00000000-0000-4000-8000-000000000230', '00000000-0000-4000-8000-000000000025', 'Steam Ironing',   83,  69, 'piece', '2 days', 2),
  ('00000000-0000-4000-8000-000000000231', '00000000-0000-4000-8000-000000000026', 'Dry Cleaning',   119,  99, 'piece', '3 days', 1),
  ('00000000-0000-4000-8000-000000000232', '00000000-0000-4000-8000-000000000026', 'Steam Ironing',   24,  20, 'piece', '2 days', 2),
  ('00000000-0000-4000-8000-000000000233', '00000000-0000-4000-8000-000000000027', 'Dry Cleaning',   179, 149, 'piece', '3 days', 1),
  ('00000000-0000-4000-8000-000000000234', '00000000-0000-4000-8000-000000000027', 'Steam Ironing',   59,  49, 'piece', '2 days', 2),
  ('00000000-0000-4000-8000-000000000235', '00000000-0000-4000-8000-000000000028', 'Dry Cleaning',   299, 249, 'piece', '3 days', 1),
  ('00000000-0000-4000-8000-000000000236', '00000000-0000-4000-8000-000000000028', 'Steam Ironing',  107,  89, 'piece', '2 days', 2),
  ('00000000-0000-4000-8000-000000000237', '00000000-0000-4000-8000-000000000029', 'Dry Cleaning',   419, 349, 'piece', '3 days', 1),
  ('00000000-0000-4000-8000-000000000238', '00000000-0000-4000-8000-000000000029', 'Steam Ironing',  143, 119, 'piece', '2 days', 2),
  ('00000000-0000-4000-8000-000000000239', '00000000-0000-4000-8000-000000000030', 'Dry Cleaning',   239, 199, 'piece', '3 days', 1),
  ('00000000-0000-4000-8000-000000000240', '00000000-0000-4000-8000-000000000030', 'Steam Ironing',   71,  59, 'piece', '2 days', 2),
  ('00000000-0000-4000-8000-000000000241', '00000000-0000-4000-8000-000000000031', 'Dry Cleaning',   359, 299, 'piece', '3 days', 1),
  ('00000000-0000-4000-8000-000000000242', '00000000-0000-4000-8000-000000000031', 'Steam Ironing',   95,  79, 'piece', '2 days', 2),
  ('00000000-0000-4000-8000-000000000243', '00000000-0000-4000-8000-000000000032', 'Dry Cleaning',    95,  79, 'piece', '3 days', 1),
  ('00000000-0000-4000-8000-000000000244', '00000000-0000-4000-8000-000000000032', 'Steam Ironing',   24,  20, 'piece', '2 days', 2),
  ('00000000-0000-4000-8000-000000000245', '00000000-0000-4000-8000-000000000033', 'Dry Cleaning',   299, 249, 'piece', '3 days', 1),
  ('00000000-0000-4000-8000-000000000246', '00000000-0000-4000-8000-000000000033', 'Steam Ironing',   95,  79, 'piece', '2 days', 2),
  ('00000000-0000-4000-8000-000000000247', '00000000-0000-4000-8000-000000000034', 'Dry Cleaning',   359, 299, 'piece', '3 days', 1),
  ('00000000-0000-4000-8000-000000000248', '00000000-0000-4000-8000-000000000034', 'Steam Ironing',  107,  89, 'piece', '2 days', 2),
  ('00000000-0000-4000-8000-000000000249', '00000000-0000-4000-8000-000000000035', 'Dry Cleaning',   419, 349, 'piece', '3 days', 1),
  ('00000000-0000-4000-8000-000000000250', '00000000-0000-4000-8000-000000000035', 'Steam Ironing',  131, 109, 'piece', '2 days', 2),
  ('00000000-0000-4000-8000-000000000251', '00000000-0000-4000-8000-000000000036', 'Dry Cleaning',    59,  49, 'piece', '3 days', 1),
  ('00000000-0000-4000-8000-000000000252', '00000000-0000-4000-8000-000000000036', 'Steam Ironing',   24,  20, 'piece', '2 days', 2),
  ('00000000-0000-4000-8000-000000000253', '00000000-0000-4000-8000-000000000037', 'Dry Cleaning',    95,  79, 'piece', '3 days', 1),
  ('00000000-0000-4000-8000-000000000254', '00000000-0000-4000-8000-000000000037', 'Steam Ironing',   24,  20, 'piece', '2 days', 2),
  ('00000000-0000-4000-8000-000000000255', '00000000-0000-4000-8000-000000000038', 'Dry Cleaning',   107,  89, 'piece', '3 days', 1),
  ('00000000-0000-4000-8000-000000000256', '00000000-0000-4000-8000-000000000038', 'Steam Ironing',   35,  29, 'piece', '2 days', 2),
  ('00000000-0000-4000-8000-000000000257', '00000000-0000-4000-8000-000000000039', 'Dry Cleaning',   239, 199, 'piece', '3 days', 1),
  ('00000000-0000-4000-8000-000000000258', '00000000-0000-4000-8000-000000000039', 'Steam Ironing',  107,  89, 'piece', '2 days', 2),
  ('00000000-0000-4000-8000-000000000259', '00000000-0000-4000-8000-000000000040', 'Dry Cleaning',   155, 129, 'piece', '3 days', 1),
  ('00000000-0000-4000-8000-000000000260', '00000000-0000-4000-8000-000000000040', 'Steam Ironing',   59,  49, 'piece', '2 days', 2),
  ('00000000-0000-4000-8000-000000000261', '00000000-0000-4000-8000-000000000041', 'Dry Cleaning',   359, 299, 'piece', '3 days', 1),
  ('00000000-0000-4000-8000-000000000262', '00000000-0000-4000-8000-000000000041', 'Steam Ironing',  155, 129, 'piece', '2 days', 2),
  ('00000000-0000-4000-8000-000000000263', '00000000-0000-4000-8000-000000000042', 'Dry Cleaning',   179, 149, 'piece', '3 days', 1),
  ('00000000-0000-4000-8000-000000000264', '00000000-0000-4000-8000-000000000042', 'Steam Ironing',  107,  89, 'piece', '2 days', 2),
  ('00000000-0000-4000-8000-000000000265', '00000000-0000-4000-8000-000000000043', 'Dry Cleaning',   479, 399, 'piece', '3 days', 1),
  ('00000000-0000-4000-8000-000000000266', '00000000-0000-4000-8000-000000000043', 'Steam Ironing',  179, 149, 'piece', '2 days', 2)
on conflict (id) do update
  set label = excluded.label, original_price = excluded.original_price, price = excluded.price,
      unit = excluded.unit, turnaround = excluded.turnaround, sort_order = excluded.sort_order;

-- Kids Wear (11 items, same two-label shape)
insert into public.pricing_items (id, group_id, slug, name, sort_order)
values
  ('00000000-0000-4000-8000-000000000051', '00000000-0000-4000-8000-000000000003', 'shirt-tee-pant-kurta',     'Shirt / T-shirt / Pant / Kurta', 1),
  ('00000000-0000-4000-8000-000000000052', '00000000-0000-4000-8000-000000000003', 'kurta-designer-frock',     'Kurta Designer / Frock',         2),
  ('00000000-0000-4000-8000-000000000053', '00000000-0000-4000-8000-000000000003', 'short-skirt-shorts',       'Short Skirt / Shorts',           3),
  ('00000000-0000-4000-8000-000000000054', '00000000-0000-4000-8000-000000000003', 'choli-plain',              'Choli Plain',                    4),
  ('00000000-0000-4000-8000-000000000055', '00000000-0000-4000-8000-000000000003', 'lehenga-plain',            'Lehenga Plain',                  5),
  ('00000000-0000-4000-8000-000000000056', '00000000-0000-4000-8000-000000000003', 'choli-stone-work',         'Choli Stone Work',               6),
  ('00000000-0000-4000-8000-000000000057', '00000000-0000-4000-8000-000000000003', 'lehenga-stone-work',       'Lehenga Stone Work',             7),
  ('00000000-0000-4000-8000-000000000058', '00000000-0000-4000-8000-000000000003', 'dupatta',                  'Dupatta',                        8),
  ('00000000-0000-4000-8000-000000000059', '00000000-0000-4000-8000-000000000003', 'blazer-coat',              'Blazer / Coat',                  9),
  ('00000000-0000-4000-8000-000000000060', '00000000-0000-4000-8000-000000000003', 'waist-coat-half-jacket',   'Waist Coat / Half Jacket',       10),
  ('00000000-0000-4000-8000-000000000061', '00000000-0000-4000-8000-000000000003', 'jacket',                   'Jacket',                         11)
on conflict (id) do update
  set group_id = excluded.group_id, slug = excluded.slug, name = excluded.name, sort_order = excluded.sort_order;

insert into public.pricing_options (id, item_id, label, original_price, price, unit, turnaround, sort_order)
values
  ('00000000-0000-4000-8000-000000000271', '00000000-0000-4000-8000-000000000051', 'Dry Cleaning',   95,  79, 'piece', '3 days', 1),
  ('00000000-0000-4000-8000-000000000272', '00000000-0000-4000-8000-000000000051', 'Steam Ironing',  18,  15, 'piece', '2 days', 2),
  ('00000000-0000-4000-8000-000000000273', '00000000-0000-4000-8000-000000000052', 'Dry Cleaning',  155, 129, 'piece', '3 days', 1),
  ('00000000-0000-4000-8000-000000000274', '00000000-0000-4000-8000-000000000052', 'Steam Ironing',  47,  39, 'piece', '2 days', 2),
  ('00000000-0000-4000-8000-000000000275', '00000000-0000-4000-8000-000000000053', 'Dry Cleaning',   59,  49, 'piece', '3 days', 1),
  ('00000000-0000-4000-8000-000000000276', '00000000-0000-4000-8000-000000000053', 'Steam Ironing',  18,  15, 'piece', '2 days', 2),
  ('00000000-0000-4000-8000-000000000277', '00000000-0000-4000-8000-000000000054', 'Dry Cleaning',   95,  79, 'piece', '3 days', 1),
  ('00000000-0000-4000-8000-000000000278', '00000000-0000-4000-8000-000000000054', 'Steam Ironing',  18,  15, 'piece', '2 days', 2),
  ('00000000-0000-4000-8000-000000000279', '00000000-0000-4000-8000-000000000055', 'Dry Cleaning',  239, 199, 'piece', '3 days', 1),
  ('00000000-0000-4000-8000-000000000280', '00000000-0000-4000-8000-000000000055', 'Steam Ironing',  59,  49, 'piece', '2 days', 2),
  ('00000000-0000-4000-8000-000000000281', '00000000-0000-4000-8000-000000000056', 'Dry Cleaning',  155, 129, 'piece', '3 days', 1),
  ('00000000-0000-4000-8000-000000000282', '00000000-0000-4000-8000-000000000056', 'Steam Ironing',  47,  39, 'piece', '2 days', 2),
  ('00000000-0000-4000-8000-000000000283', '00000000-0000-4000-8000-000000000057', 'Dry Cleaning',  359, 299, 'piece', '3 days', 1),
  ('00000000-0000-4000-8000-000000000284', '00000000-0000-4000-8000-000000000057', 'Steam Ironing', 107,  89, 'piece', '2 days', 2),
  ('00000000-0000-4000-8000-000000000285', '00000000-0000-4000-8000-000000000058', 'Dry Cleaning',   59,  49, 'piece', '3 days', 1),
  ('00000000-0000-4000-8000-000000000286', '00000000-0000-4000-8000-000000000058', 'Steam Ironing',  18,  15, 'piece', '2 days', 2),
  ('00000000-0000-4000-8000-000000000287', '00000000-0000-4000-8000-000000000059', 'Dry Cleaning',  215, 179, 'piece', '3 days', 1),
  ('00000000-0000-4000-8000-000000000288', '00000000-0000-4000-8000-000000000059', 'Steam Ironing',  71,  59, 'piece', '2 days', 2),
  ('00000000-0000-4000-8000-000000000289', '00000000-0000-4000-8000-000000000060', 'Dry Cleaning',   95,  79, 'piece', '3 days', 1),
  ('00000000-0000-4000-8000-000000000290', '00000000-0000-4000-8000-000000000060', 'Steam Ironing',  18,  15, 'piece', '2 days', 2),
  ('00000000-0000-4000-8000-000000000291', '00000000-0000-4000-8000-000000000061', 'Dry Cleaning',  155, 129, 'piece', '3 days', 1),
  ('00000000-0000-4000-8000-000000000292', '00000000-0000-4000-8000-000000000061', 'Steam Ironing',  47,  39, 'piece', '2 days', 2)
on conflict (id) do update
  set label = excluded.label, original_price = excluded.original_price, price = excluded.price,
      unit = excluded.unit, turnaround = excluded.turnaround, sort_order = excluded.sort_order;

-- Shoe Cleaning (4 items, one price each; group turnaround)
insert into public.pricing_items (id, group_id, slug, name, sort_order)
values
  ('00000000-0000-4000-8000-000000000071', '00000000-0000-4000-8000-000000000004', 'slipper-sandal',      'Slipper / Sandal',      1),
  ('00000000-0000-4000-8000-000000000072', '00000000-0000-4000-8000-000000000004', 'clogs',               'Clogs',                 2),
  ('00000000-0000-4000-8000-000000000073', '00000000-0000-4000-8000-000000000004', 'sports-shoe-sneaker', 'Sports Shoe / Sneaker', 3),
  ('00000000-0000-4000-8000-000000000074', '00000000-0000-4000-8000-000000000004', 'boots-leather-shoe',  'Boots / Leather Shoe',  4)
on conflict (id) do update
  set group_id = excluded.group_id, slug = excluded.slug, name = excluded.name, sort_order = excluded.sort_order;

insert into public.pricing_options (id, item_id, label, original_price, price, unit, sort_order)
values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000071', null, 179, 149, 'pair',  1),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000072', null, 239, 199, 'pair',  1),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000073', null, 299, 249, 'pair',  1),
  ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000074', null, 359, 299, 'pair',  1)
on conflict (id) do update
  set label = excluded.label, original_price = excluded.original_price, price = excluded.price,
      unit = excluded.unit, turnaround = excluded.turnaround, sort_order = excluded.sort_order;

-- Household (6 items; carpet is priced per sq ft, unlike every other line)
insert into public.pricing_items (id, group_id, slug, name, sort_order)
values
  ('00000000-0000-4000-8000-000000000081', '00000000-0000-4000-8000-000000000005', 'blanket-quilt-single', 'Blanket / Quilt - Single',      1),
  ('00000000-0000-4000-8000-000000000082', '00000000-0000-4000-8000-000000000005', 'blanket-quilt-double', 'Blanket / Quilt - Double',      2),
  ('00000000-0000-4000-8000-000000000083', '00000000-0000-4000-8000-000000000005', 'blanket-quilt-king',   'Blanket / Quilt - King Size',   3),
  ('00000000-0000-4000-8000-000000000084', '00000000-0000-4000-8000-000000000005', 'pillow',               'Pillow',                        4),
  ('00000000-0000-4000-8000-000000000085', '00000000-0000-4000-8000-000000000005', 'bathmat-foot-mat',     'Bathmat / Foot Mat',            5),
  ('00000000-0000-4000-8000-000000000086', '00000000-0000-4000-8000-000000000005', 'carpet-cleaning',      'Carpet Cleaning',               6)
on conflict (id) do update
  set group_id = excluded.group_id, slug = excluded.slug, name = excluded.name, sort_order = excluded.sort_order;

insert into public.pricing_options (id, item_id, label, original_price, price, unit, sort_order)
values
  ('00000000-0000-4000-8000-000000000311', '00000000-0000-4000-8000-000000000081', null, 299, 249, 'piece', 1),
  ('00000000-0000-4000-8000-000000000312', '00000000-0000-4000-8000-000000000082', null, 479, 399, 'piece', 1),
  ('00000000-0000-4000-8000-000000000313', '00000000-0000-4000-8000-000000000083', null, 599, 499, 'piece', 1),
  ('00000000-0000-4000-8000-000000000314', '00000000-0000-4000-8000-000000000084', null, 143, 119, 'piece', 1),
  ('00000000-0000-4000-8000-000000000315', '00000000-0000-4000-8000-000000000085', null,  83,  69, 'piece', 1),
  ('00000000-0000-4000-8000-000000000316', '00000000-0000-4000-8000-000000000086', null,  48,  40, 'sq ft', 1)
on conflict (id) do update
  set label = excluded.label, original_price = excluded.original_price, price = excluded.price,
      unit = excluded.unit, turnaround = excluded.turnaround, sort_order = excluded.sort_order;

-- Curtain Cleaning (4 size bands, one price each)
insert into public.pricing_items (id, group_id, slug, name, sort_order)
values
  ('00000000-0000-4000-8000-000000000091', '00000000-0000-4000-8000-000000000006', 'curtain-0-4-feet',    '0 to 4 Feet',         1),
  ('00000000-0000-4000-8000-000000000092', '00000000-0000-4000-8000-000000000006', 'curtain-4-8-feet',    '4 to 8 Feet',         2),
  ('00000000-0000-4000-8000-000000000093', '00000000-0000-4000-8000-000000000006', 'curtain-8-12-feet',   '8 to 12 Feet',        3),
  ('00000000-0000-4000-8000-000000000094', '00000000-0000-4000-8000-000000000006', 'curtain-above-12-feet', 'More than 12 Feet', 4)
on conflict (id) do update
  set group_id = excluded.group_id, slug = excluded.slug, name = excluded.name, sort_order = excluded.sort_order;

insert into public.pricing_options (id, item_id, label, original_price, price, unit, sort_order)
values
  ('00000000-0000-4000-8000-000000000321', '00000000-0000-4000-8000-000000000091', null, 359, 299, 'piece', 1),
  ('00000000-0000-4000-8000-000000000322', '00000000-0000-4000-8000-000000000092', null, 539, 449, 'piece', 1),
  ('00000000-0000-4000-8000-000000000323', '00000000-0000-4000-8000-000000000093', null, 719, 599, 'piece', 1),
  ('00000000-0000-4000-8000-000000000324', '00000000-0000-4000-8000-000000000094', null, 959, 799, 'piece', 1)
on conflict (id) do update
  set label = excluded.label, original_price = excluded.original_price, price = excluded.price,
      unit = excluded.unit, turnaround = excluded.turnaround, sort_order = excluded.sort_order;

-- --- Drop the legacy flat catalogue -----------------------------------------
-- Nothing reads it anymore. Bookings carry their line names and prices inside
-- order_items, so history is unaffected by this.

alter table public.order_items drop column if exists service_id;

drop table if exists public.services cascade;

drop index if exists services_active_sort_idx;
