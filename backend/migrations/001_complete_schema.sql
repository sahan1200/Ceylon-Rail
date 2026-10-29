-- =============================================================================
-- CEYLON RAIL — SRI LANKA RAILWAY RESERVATION & MANAGEMENT SYSTEM
-- Complete Normalized Relational SQLite Schema (v2.1 — Guest + Staff + Planner)
-- Compatible with DB Browser for SQLite (database/ceylon_rail.db)
-- =============================================================================

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =============================================================================
-- 1. ROLES, PERMISSIONS, USERS, PASSENGER PROFILES, STAFF & SESSIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INTEGER NOT NULL,
  permission_id INTEGER NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  nic_passport TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'PASSENGER',
  preferred_language TEXT NOT NULL DEFAULT 'EN',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS passenger_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  date_of_birth TEXT,
  nationality TEXT DEFAULT 'Sri Lankan',
  address_line1 TEXT,
  city TEXT,
  country TEXT DEFAULT 'Sri Lanka',
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  default_seat_preference TEXT DEFAULT 'WINDOW',
  concession_type TEXT DEFAULT 'NONE',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_si TEXT,
  name_ta TEXT,
  line_name TEXT NOT NULL DEFAULT 'Main Line',
  province TEXT NOT NULL DEFAULT 'Western',
  elevation_m REAL NOT NULL DEFAULT 0,
  distance_from_fort_km REAL NOT NULL DEFAULT 0,
  lat REAL NOT NULL DEFAULT 6.9344,
  lng REAL NOT NULL DEFAULT 79.8501,
  facilities_json TEXT DEFAULT '["Ticket Counter","Waiting Hall","Restrooms"]',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS staff_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role_id INTEGER NOT NULL,
  employee_code TEXT,
  phone TEXT,
  department TEXT DEFAULT 'Railway Operations',
  assigned_station_id INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  password_changed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (role_id) REFERENCES roles(id),
  FOREIGN KEY (assigned_station_id) REFERENCES stations(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS staff_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (staff_user_id) REFERENCES staff_users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_type TEXT NOT NULL DEFAULT 'SYSTEM',
  actor_id INTEGER,
  actor_identifier TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details_json TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  staff_user_id INTEGER,
  type TEXT NOT NULL DEFAULT 'SYSTEM',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  related_entity_type TEXT,
  related_entity_id TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (staff_user_id) REFERENCES staff_users(id) ON DELETE CASCADE
);

-- =============================================================================
-- 2. TRAINS, SCHEDULES, OPERATING DAYS, ROUTE STOPS, CARRIAGES, SEATS & FARES
-- =============================================================================

CREATE TABLE IF NOT EXISTS trains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  train_number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_si TEXT,
  name_ta TEXT,
  type TEXT NOT NULL DEFAULT 'Intercity Express',
  route_name TEXT NOT NULL,
  origin_station_id INTEGER NOT NULL,
  destination_station_id INTEGER NOT NULL,
  departure_time TEXT NOT NULL,
  arrival_time TEXT NOT NULL,
  duration_mins INTEGER NOT NULL DEFAULT 300,
  frequency TEXT NOT NULL DEFAULT 'Daily',
  classes_available TEXT NOT NULL DEFAULT '2nd Class Reserved,3rd Class Reserved',
  base_speed_kmh INTEGER NOT NULL DEFAULT 45,
  has_gps_hardware INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (origin_station_id) REFERENCES stations(id),
  FOREIGN KEY (destination_station_id) REFERENCES stations(id)
);

CREATE TABLE IF NOT EXISTS train_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  train_id INTEGER NOT NULL,
  schedule_code TEXT NOT NULL UNIQUE,
  direction TEXT NOT NULL DEFAULT 'OUTBOUND',
  departure_time TEXT NOT NULL,
  arrival_time TEXT NOT NULL,
  duration_mins INTEGER NOT NULL,
  effective_from TEXT NOT NULL DEFAULT '2025-01-01',
  effective_to TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (train_id) REFERENCES trains(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS operating_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id INTEGER NOT NULL UNIQUE,
  mon INTEGER NOT NULL DEFAULT 1,
  tue INTEGER NOT NULL DEFAULT 1,
  wed INTEGER NOT NULL DEFAULT 1,
  thu INTEGER NOT NULL DEFAULT 1,
  fri INTEGER NOT NULL DEFAULT 1,
  sat INTEGER NOT NULL DEFAULT 1,
  sun INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (schedule_id) REFERENCES train_schedules(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS route_stops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  train_id INTEGER NOT NULL,
  station_id INTEGER NOT NULL,
  stop_order INTEGER NOT NULL,
  arrival_time TEXT,
  departure_time TEXT,
  dwell_mins INTEGER NOT NULL DEFAULT 2,
  platform TEXT DEFAULT '01',
  distance_from_origin_km REAL NOT NULL DEFAULT 0,
  arrival_offset_mins INTEGER NOT NULL DEFAULT 0,
  UNIQUE(train_id, stop_order),
  FOREIGN KEY (train_id) REFERENCES trains(id) ON DELETE CASCADE,
  FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS carriages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  train_id INTEGER NOT NULL,
  carriage_code TEXT NOT NULL,
  class_name TEXT NOT NULL,
  total_seats INTEGER NOT NULL DEFAULT 44,
  total_rows INTEGER NOT NULL DEFAULT 11,
  seats_per_row INTEGER NOT NULL DEFAULT 4,
  layout_type TEXT NOT NULL DEFAULT '2+2',
  price_lkr REAL NOT NULL DEFAULT 1500,
  has_air_conditioning INTEGER NOT NULL DEFAULT 0,
  has_observation_glass INTEGER NOT NULL DEFAULT 0,
  UNIQUE(train_id, carriage_code),
  FOREIGN KEY (train_id) REFERENCES trains(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS seats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  carriage_id INTEGER NOT NULL,
  seat_number TEXT NOT NULL,
  row_number INTEGER NOT NULL,
  col_letter TEXT NOT NULL,
  is_window INTEGER NOT NULL DEFAULT 0,
  is_aisle INTEGER NOT NULL DEFAULT 0,
  is_accessible INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(carriage_id, seat_number),
  FOREIGN KEY (carriage_id) REFERENCES carriages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fare_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_name TEXT NOT NULL UNIQUE,
  base_fare_cents INTEGER NOT NULL,
  per_km_rate_cents INTEGER NOT NULL,
  min_distance_km REAL NOT NULL DEFAULT 10.0,
  class_multiplier REAL NOT NULL DEFAULT 1.0,
  reservation_fee_cents INTEGER NOT NULL DEFAULT 15000,
  tax_rate_pct REAL NOT NULL DEFAULT 0.0,
  cancellation_fee_pct REAL NOT NULL DEFAULT 20.0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =============================================================================
-- 3. BOOKINGS (SUPPORTS BOTH GUEST AND REGISTERED PASSENGERS), SEATS & PAYMENTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pnr TEXT NOT NULL UNIQUE,
  user_id INTEGER,
  is_guest_booking INTEGER NOT NULL DEFAULT 0,
  booking_lookup_token TEXT,
  train_id INTEGER NOT NULL,
  schedule_id INTEGER,
  from_station_id INTEGER NOT NULL,
  to_station_id INTEGER NOT NULL,
  travel_date TEXT NOT NULL,
  carriage_code TEXT NOT NULL,
  class_name TEXT NOT NULL,
  seats_csv TEXT NOT NULL,
  passengers_count INTEGER NOT NULL DEFAULT 1,
  distance_km REAL NOT NULL DEFAULT 0,
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  reservation_fee_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_amount_cents INTEGER NOT NULL DEFAULT 0,
  total_amount_lkr REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
  payment_status TEXT NOT NULL DEFAULT 'UNPAID',
  payment_method TEXT NOT NULL DEFAULT 'CARD',
  passenger_name TEXT NOT NULL,
  passenger_nic TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  qr_payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (train_id) REFERENCES trains(id),
  FOREIGN KEY (schedule_id) REFERENCES train_schedules(id) ON DELETE SET NULL,
  FOREIGN KEY (from_station_id) REFERENCES stations(id),
  FOREIGN KEY (to_station_id) REFERENCES stations(id)
);

CREATE TABLE IF NOT EXISTS booking_passengers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL,
  full_name TEXT NOT NULL,
  nic_passport TEXT,
  passenger_type TEXT NOT NULL DEFAULT 'ADULT',
  age INTEGER,
  seat_id INTEGER,
  carriage_code TEXT NOT NULL,
  seat_number TEXT NOT NULL,
  fare_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (seat_id) REFERENCES seats(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS seat_reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  train_id INTEGER NOT NULL,
  carriage_code TEXT NOT NULL,
  seat_id INTEGER,
  seat_number TEXT NOT NULL,
  travel_date TEXT NOT NULL,
  from_stop_order INTEGER NOT NULL DEFAULT 1,
  to_stop_order INTEGER NOT NULL DEFAULT 99,
  status TEXT NOT NULL DEFAULT 'LOCKED',
  booking_id INTEGER,
  locked_by_session TEXT,
  locked_by_user_id INTEGER,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (train_id) REFERENCES trains(id) ON DELETE CASCADE,
  FOREIGN KEY (seat_id) REFERENCES seats(id) ON DELETE SET NULL,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (locked_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS booking_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  changed_by_type TEXT NOT NULL DEFAULT 'SYSTEM',
  changed_by_id INTEGER,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL,
  payment_reference TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'SANDBOX_VERIFIER',
  payment_method TEXT NOT NULL DEFAULT 'CARD',
  amount_cents INTEGER NOT NULL,
  amount_lkr REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'LKR',
  status TEXT NOT NULL DEFAULT 'INITIATED',
  gateway_transaction_id TEXT,
  card_last4 TEXT,
  failure_reason TEXT,
  idempotency_key TEXT UNIQUE,
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payment_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  gateway_event_id TEXT,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL,
  signature_verified INTEGER NOT NULL DEFAULT 0,
  raw_response_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cancellations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL,
  cancelled_by_type TEXT NOT NULL DEFAULT 'PASSENGER',
  cancelled_by_id INTEGER,
  reason TEXT,
  cancellation_fee_cents INTEGER NOT NULL DEFAULT 0,
  refundable_amount_cents INTEGER NOT NULL DEFAULT 0,
  cancelled_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS refunds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL,
  payment_id INTEGER NOT NULL,
  cancellation_id INTEGER,
  refund_reference TEXT NOT NULL UNIQUE,
  amount_cents INTEGER NOT NULL,
  amount_lkr REAL NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'PROCESSED',
  processed_by_staff_id INTEGER,
  processed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE,
  FOREIGN KEY (cancellation_id) REFERENCES cancellations(id) ON DELETE SET NULL,
  FOREIGN KEY (processed_by_staff_id) REFERENCES staff_users(id) ON DELETE SET NULL
);

-- =============================================================================
-- 4. SMART TRAVEL PLANNER (DESTINATIONS, ATTRACTIONS, SCENIC ROUTES & ITINERARIES)
-- =============================================================================

CREATE TABLE IF NOT EXISTS tourist_destinations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_si TEXT,
  name_ta TEXT,
  region TEXT NOT NULL,
  category TEXT NOT NULL,
  summary TEXT NOT NULL,
  description TEXT NOT NULL,
  best_season TEXT,
  recommended_days INTEGER NOT NULL DEFAULT 2,
  hero_image_url TEXT,
  gallery_images_json TEXT,
  suggested_itinerary_json TEXT,
  lat REAL,
  lng REAL,
  is_featured INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tourist_attractions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  destination_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  image_url TEXT,
  distance_from_station_km REAL NOT NULL DEFAULT 1.0,
  estimated_visit_mins INTEGER NOT NULL DEFAULT 90,
  entry_fee_lkr REAL NOT NULL DEFAULT 0,
  opening_hours TEXT DEFAULT '06:00 - 18:00',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (destination_id) REFERENCES tourist_destinations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS destination_station_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  destination_id INTEGER NOT NULL,
  station_id INTEGER NOT NULL,
  distance_km REAL NOT NULL DEFAULT 1.0,
  travel_time_mins INTEGER NOT NULL DEFAULT 10,
  transport_mode TEXT NOT NULL DEFAULT 'Tuk-Tuk / Walk',
  estimated_transfer_fare_lkr REAL NOT NULL DEFAULT 300,
  notes TEXT,
  is_primary INTEGER NOT NULL DEFAULT 1,
  UNIQUE(destination_id, station_id),
  FOREIGN KEY (destination_id) REFERENCES tourist_destinations(id) ON DELETE CASCADE,
  FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scenic_routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  origin_station_id INTEGER NOT NULL,
  destination_station_id INTEGER NOT NULL,
  distance_km REAL NOT NULL,
  duration_mins INTEGER NOT NULL,
  max_elevation_m REAL NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  highlights_json TEXT,
  image_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (origin_station_id) REFERENCES stations(id),
  FOREIGN KEY (destination_station_id) REFERENCES stations(id)
);

CREATE TABLE IF NOT EXISTS saved_itineraries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  title TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  total_days INTEGER NOT NULL DEFAULT 1,
  companion_type TEXT NOT NULL DEFAULT 'SOLO',
  estimated_budget_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  is_public INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS itinerary_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  itinerary_id INTEGER NOT NULL,
  day_number INTEGER NOT NULL,
  travel_date TEXT,
  title TEXT NOT NULL,
  destination_id INTEGER,
  notes TEXT,
  FOREIGN KEY (itinerary_id) REFERENCES saved_itineraries(id) ON DELETE CASCADE,
  FOREIGN KEY (destination_id) REFERENCES tourist_destinations(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS itinerary_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  itinerary_day_id INTEGER NOT NULL,
  item_order INTEGER NOT NULL DEFAULT 1,
  item_type TEXT NOT NULL DEFAULT 'ATTRACTION',
  title TEXT NOT NULL,
  train_id INTEGER,
  from_station_id INTEGER,
  to_station_id INTEGER,
  attraction_id INTEGER,
  start_time TEXT,
  end_time TEXT,
  estimated_cost_cents INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  FOREIGN KEY (itinerary_day_id) REFERENCES itinerary_days(id) ON DELETE CASCADE,
  FOREIGN KEY (train_id) REFERENCES trains(id) ON DELETE SET NULL,
  FOREIGN KEY (from_station_id) REFERENCES stations(id) ON DELETE SET NULL,
  FOREIGN KEY (to_station_id) REFERENCES stations(id) ON DELETE SET NULL,
  FOREIGN KEY (attraction_id) REFERENCES tourist_attractions(id) ON DELETE SET NULL
);

-- =============================================================================
-- 5. PASSENGER COMPLAINTS & FEEDBACK (SUPPORTS GUEST AND REGISTERED PASSENGERS)
-- =============================================================================

CREATE TABLE IF NOT EXISTS complaints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complaint_reference TEXT NOT NULL UNIQUE,
  user_id INTEGER,
  guest_name TEXT,
  guest_email TEXT,
  guest_phone TEXT,
  booking_id INTEGER,
  booking_pnr TEXT,
  train_id INTEGER,
  station_id INTEGER,
  category TEXT NOT NULL DEFAULT 'SERVICE_QUALITY',
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'MEDIUM',
  status TEXT NOT NULL DEFAULT 'SUBMITTED',
  resolution_summary TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
  FOREIGN KEY (train_id) REFERENCES trains(id) ON DELETE SET NULL,
  FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS complaint_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complaint_id INTEGER NOT NULL,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  changed_by_type TEXT NOT NULL DEFAULT 'PASSENGER',
  changed_by_id INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS complaint_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complaint_id INTEGER NOT NULL,
  assigned_to_staff_id INTEGER NOT NULL,
  assigned_by_staff_id INTEGER,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_to_staff_id) REFERENCES staff_users(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by_staff_id) REFERENCES staff_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS complaint_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complaint_id INTEGER NOT NULL,
  author_type TEXT NOT NULL DEFAULT 'STAFF',
  author_id INTEGER,
  author_name TEXT NOT NULL,
  is_internal_note INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS complaint_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complaint_id INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  file_size_bytes INTEGER NOT NULL DEFAULT 0,
  content_url_or_data TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS feedback_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  guest_name TEXT,
  booking_id INTEGER,
  train_id INTEGER,
  overall_rating INTEGER NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  punctuality_rating INTEGER,
  cleanliness_rating INTEGER,
  staff_behavior_rating INTEGER,
  comments TEXT,
  is_public_testimonial INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
  FOREIGN KEY (train_id) REFERENCES trains(id) ON DELETE SET NULL
);

-- =============================================================================
-- 6. OPERATING EXPENSES & FINANCIAL REPORT RUNS
-- =============================================================================

CREATE TABLE IF NOT EXISTS operating_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_reference TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT 'STATION_OPERATIONS',
  title TEXT NOT NULL,
  description TEXT,
  amount_cents INTEGER NOT NULL,
  amount_lkr REAL NOT NULL,
  incurred_date TEXT NOT NULL,
  train_id INTEGER,
  station_id INTEGER,
  vendor_name TEXT,
  recorded_by_staff_id INTEGER NOT NULL,
  approved_by_staff_id INTEGER,
  status TEXT NOT NULL DEFAULT 'APPROVED',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (train_id) REFERENCES trains(id) ON DELETE SET NULL,
  FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE SET NULL,
  FOREIGN KEY (recorded_by_staff_id) REFERENCES staff_users(id),
  FOREIGN KEY (approved_by_staff_id) REFERENCES staff_users(id)
);

CREATE TABLE IF NOT EXISTS financial_report_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_reference TEXT NOT NULL UNIQUE,
  period_type TEXT NOT NULL DEFAULT 'CUSTOM',
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  total_bookings_count INTEGER NOT NULL DEFAULT 0,
  confirmed_bookings_count INTEGER NOT NULL DEFAULT 0,
  cancelled_bookings_count INTEGER NOT NULL DEFAULT 0,
  gross_revenue_cents INTEGER NOT NULL DEFAULT 0,
  total_refunds_cents INTEGER NOT NULL DEFAULT 0,
  net_revenue_cents INTEGER NOT NULL DEFAULT 0,
  operating_expenses_cents INTEGER NOT NULL DEFAULT 0,
  net_profit_cents INTEGER NOT NULL DEFAULT 0,
  has_sufficient_data INTEGER NOT NULL DEFAULT 0,
  report_payload_json TEXT,
  generated_by_staff_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (generated_by_staff_id) REFERENCES staff_users(id)
);

-- =============================================================================
-- 7. PERFORMANCE INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_route_stops_train_order ON route_stops(train_id, stop_order);
CREATE INDEX IF NOT EXISTS idx_route_stops_station ON route_stops(station_id);
CREATE INDEX IF NOT EXISTS idx_bookings_pnr ON bookings(pnr);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_train_date ON bookings(train_id, travel_date);
CREATE INDEX IF NOT EXISTS idx_seat_res_lookup ON seat_reservations(train_id, carriage_code, travel_date, status);
CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id, status);
CREATE INDEX IF NOT EXISTS idx_refunds_booking ON refunds(booking_id, status);
CREATE INDEX IF NOT EXISTS idx_complaints_ref ON complaints(complaint_reference);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON operating_expenses(incurred_date, status);
