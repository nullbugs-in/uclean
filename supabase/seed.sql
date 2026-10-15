-- ---------------------------------------------------------------------------
-- seed.sql
--
-- Safe to run repeatedly: every statement is idempotent.
--
-- Deliberately NOT seeded with values that would be invented business
-- decisions:
--   * store lat/lng stay NULL. The exact store coordinates are an open
--     question in the source design, so book_pickup refuses to run until an
--     admin sets them in /admin/settings.
--   * time_slots.capacity is 9. A capacity of 0 makes every slot report full
--     rather than guessing, so it has to be a real number for the wizard to
--     offer anything. Change it here, or per slot in /admin/slots.
-- ---------------------------------------------------------------------------

-- --- Store -----------------------------------------------------------------
insert into public.store_settings (id, address, phone, whatsapp_number, max_radius_km)
values (
  true,
  null,
  null,
  null,
  6
)
on conflict (id) do update set max_radius_km = excluded.max_radius_km;

-- --- Nine daily slots (section 6.2, step 3) --------------------------------
-- 10-11, 11-12, 12-1, 1-2, then the 2 PM-3 PM break is skipped, then 3-4
-- through 7-8. capacity 0 means "not configured yet" and blocks booking.
insert into public.time_slots (start_time, end_time, label, capacity, is_active)
values
  ('10:00', '11:00', '10 AM - 11 AM',  0, true),
  ('11:00', '12:00', '11 AM - 12 PM',  0, true),
  ('12:00', '13:00', '12 PM - 1 PM',   0, true),
  ('13:00', '14:00', '1 PM - 2 PM',    0, true),
  ('15:00', '16:00', '3 PM - 4 PM',    0, true),
  ('16:00', '17:00', '4 PM - 5 PM',    0, true),
  ('17:00', '18:00', '5 PM - 6 PM',    0, true),
  ('18:00', '19:00', '6 PM - 7 PM',    0, true),
  ('19:00', '20:00', '7 PM - 8 PM',    0, true)
on conflict (start_time, end_time) do update set label = excluded.label;

-- --- Services --------------------------------------------------------------
-- Indicative sample rows so the public Services section renders. Admin edits
-- prices in /admin/services; the section reads live from this table.
insert into public.services (name, description, unit, price, sort_order)
values
  ('Washing and Folding', 'Machine wash, dry and neatly folded', 'kg', 60.00, 1),
  ('Wash and Iron', 'Machine wash with steam ironing', 'kg', 80.00, 2),
  ('Dry Cleaning', 'Specialist dry cleaning for delicate fabrics', 'piece', 250.00, 3),
  ('Shoe Cleaning', 'Deep clean and polish for sneakers and formals', 'pair', 299.00, 4),
  ('Curtain Cleaning', 'Steam cleaned and dust free', 'kg', 120.00, 5),
  ('Bedsheet Cleaning', 'Fresh wash and sanitised', 'piece', 180.00, 6),
  ('Express Service', 'Same day pickup and delivery', 'kg', 120.00, 7)
on conflict (name) do update set price = excluded.price, sort_order = excluded.sort_order;

-- --- Hero slides (section 5.1) --------------------------------------------
insert into public.hero_slides (title, subtitle, image_url, link, sort_order)
values
  ('Express Service', 'Same day pickup and delivery', '/images/hero/express.jpg', '/services', 1),
  ('Shoe Cleaning',  'Bring your sneakers back to life', '/images/hero/shoes.jpg',   '/services', 2),
  ('Curtain Cleaning', 'Dust free, steam cleaned curtains', '/images/hero/curtains.jpg', '/services', 3)
on conflict do nothing;
