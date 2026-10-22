-- Seed time slots for testing

INSERT INTO public.time_slots (start_time, end_time, label, capacity, is_active)
VALUES
  ('10:00', '11:00', '10:00 - 11:00 AM', 5, true),
  ('11:00', '12:00', '11:00 AM - 12:00 PM', 5, true),
  ('12:00', '13:00', '12:00 - 1:00 PM', 5, true),
  ('13:00', '14:00', '1:00 - 2:00 PM', 5, true),
  ('15:00', '16:00', '3:00 - 4:00 PM', 5, true),
  ('16:00', '17:00', '4:00 - 5:00 PM', 5, true),
  ('17:00', '18:00', '5:00 - 6:00 PM', 5, true),
  ('18:00', '19:00', '6:00 - 7:00 PM', 5, true),
  ('19:00', '20:00', '7:00 - 8:00 PM', 5, true)
ON CONFLICT (start_time, end_time) DO NOTHING;
