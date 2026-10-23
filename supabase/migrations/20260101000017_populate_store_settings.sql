-- Populate store settings with coordinates for testing

INSERT INTO public.store_settings (id, lat, lng, address, phone, whatsapp_number, max_radius_km)
VALUES (true, 12.3248091, 76.6288967, '2979/1, D21/1, 6th Main Rd, Vani Vilas Mohalla, Mysuru, Karnataka 570002', '+91 80739 74160', '918073974160', 6)
ON CONFLICT (id) DO UPDATE SET
  lat = 12.3248091,
  lng = 76.6288967,
  address = '2979/1, D21/1, 6th Main Rd, Vani Vilas Mohalla, Mysuru, Karnataka 570002',
  phone = '+91 80739 74160',
  whatsapp_number = '918073974160',
  max_radius_km = 6,
  updated_at = now();
