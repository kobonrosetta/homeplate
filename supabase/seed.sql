-- ============================================================
--  Sample approved operators — for TESTING permit verification.
--  Run this in Supabase SQL Editor after schema.sql.
--  Replace these with the real Santa Clara County approved list later.
-- ============================================================

insert into approved_operators (name, permit_number, operation_type, county, city) values
  ('Sunshine Home Kitchen', 'MEHKO-2025-001', 'mehko',   'Santa Clara', 'San Jose'),
  ('Abuela''s Cocina',      'MEHKO-2025-014', 'mehko',   'Santa Clara', 'Gilroy'),
  ('Rise & Crumb Bakery',   'CFO-2025-007',   'cottage', 'Santa Clara', 'Sunnyvale'),
  ('The Daily Loaf',        'CFO-2025-022',   'cottage', 'Santa Clara', 'Mountain View'),
  ('Spice Route Tiffins',   'MEHKO-2025-031', 'mehko',   'Santa Clara', 'Santa Clara');

-- To TEST the "Verified" badge: when you list a kitchen, use one of the
-- permit numbers above (e.g. MEHKO-2025-001). Use a made-up number to see
-- the "Pending verification" state instead.
