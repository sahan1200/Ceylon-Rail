const { dbAll, dbGet, dbRun } = require('../database');

function getBookingByPnrOrId(pnrOrId) {
  if (!pnrOrId) return null;
  const isNumeric = /^\d+$/.test(String(pnrOrId));
  const booking = dbGet(
    `SELECT b.*,
            t.train_number, t.name AS train_name, t.name_si AS train_name_si, t.name_ta AS train_name_ta,
            t.type AS train_type, t.departure_time, t.arrival_time, t.duration_mins,
            sf.code AS from_code, sf.name AS from_station_name, sf.name_si AS from_station_name_si, sf.name_ta AS from_station_name_ta,
            st.code AS to_code, st.name AS to_station_name, st.name_si AS to_station_name_si, st.name_ta AS to_station_name_ta,
            COALESCE(u.email, b.contact_email) AS account_email,
            COALESCE(u.full_name, b.passenger_name) AS account_holder_name
     FROM bookings b
     JOIN trains t ON t.id = b.train_id
     JOIN stations sf ON sf.id = b.from_station_id
     JOIN stations st ON st.id = b.to_station_id
     LEFT JOIN users u ON u.id = b.user_id
     WHERE ${isNumeric ? 'b.id = ?' : 'upper(b.pnr) = upper(?)'}`,
    [isNumeric ? Number(pnrOrId) : String(pnrOrId).trim()]
  );

  if (!booking) return null;

  booking.passengers = dbAll(
    'SELECT * FROM booking_passengers WHERE booking_id = ? ORDER BY id ASC',
    [booking.id]
  );
  booking.status_history = dbAll(
    'SELECT * FROM booking_status_history WHERE booking_id = ? ORDER BY created_at ASC, id ASC',
    [booking.id]
  );
  booking.payments = dbAll(
    'SELECT * FROM payments WHERE booking_id = ? ORDER BY created_at DESC',
    [booking.id]
  );
  booking.cancellations = dbAll(
    'SELECT * FROM cancellations WHERE booking_id = ? ORDER BY cancelled_at DESC',
    [booking.id]
  );
  booking.refunds = dbAll(
    'SELECT * FROM refunds WHERE booking_id = ? ORDER BY created_at DESC',
    [booking.id]
  );
  booking.seats = String(booking.seats_csv || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return booking;
}

function listBookingsForUser(userId) {
  const rows = dbAll(
    `SELECT b.*,
            t.train_number, t.name AS train_name, t.type AS train_type,
            t.departure_time, t.arrival_time, t.duration_mins,
            sf.code AS from_code, sf.name AS from_station_name,
            st.code AS to_code, st.name AS to_station_name
     FROM bookings b
     JOIN trains t ON t.id = b.train_id
     JOIN stations sf ON sf.id = b.from_station_id
     JOIN stations st ON st.id = b.to_station_id
     WHERE b.user_id = ?
     ORDER BY b.created_at DESC, b.id DESC`,
    [userId]
  );
  return rows.map((b) => ({
    ...b,
    seats: String(b.seats_csv || '').split(',').map((s) => s.trim()).filter(Boolean),
    passengers: dbAll('SELECT * FROM booking_passengers WHERE booking_id = ?', [b.id]),
    refunds: dbAll('SELECT * FROM refunds WHERE booking_id = ?', [b.id])
  }));
}

function listAllBookings({ status, travelDate, trainId, search } = {}) {
  const conditions = ['1 = 1'];
  const params = [];

  if (status && status !== 'ALL') {
    conditions.push('b.status = ?');
    params.push(status);
  }
  if (travelDate) {
    conditions.push('b.travel_date = ?');
    params.push(travelDate);
  }
  if (trainId) {
    conditions.push('b.train_id = ?');
    params.push(Number(trainId));
  }
  if (search) {
    conditions.push(
      '(upper(b.pnr) LIKE upper(?) OR lower(b.passenger_name) LIKE lower(?) OR lower(COALESCE(u.email, b.contact_email, "")) LIKE lower(?) OR lower(COALESCE(b.contact_phone, "")) LIKE lower(?))'
    );
    const pat = `%${String(search).trim()}%`;
    params.push(pat, pat, pat, pat);
  }

  const rows = dbAll(
    `SELECT b.*,
            t.train_number, t.name AS train_name, t.type AS train_type,
            t.departure_time, t.arrival_time, t.duration_mins,
            sf.code AS from_code, sf.name AS from_station_name,
            st.code AS to_code, st.name AS to_station_name,
            COALESCE(u.email, b.contact_email) AS account_email
     FROM bookings b
     JOIN trains t ON t.id = b.train_id
     JOIN stations sf ON sf.id = b.from_station_id
     JOIN stations st ON st.id = b.to_station_id
     LEFT JOIN users u ON u.id = b.user_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY b.created_at DESC, b.id DESC
     LIMIT 250`,
    params
  );

  return rows.map((b) => ({
    ...b,
    seats: String(b.seats_csv || '').split(',').map((s) => s.trim()).filter(Boolean)
  }));
}

function recordBookingStatusChange({ bookingId, previousStatus, newStatus, changedByType, changedById, reason }) {
  return dbRun(
    `INSERT INTO booking_status_history (booking_id, previous_status, new_status, changed_by_type, changed_by_id, reason)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [bookingId, previousStatus || null, newStatus, changedByType || 'SYSTEM', changedById || null, reason || null]
  );
}

/**
 * Verify whether a guest verification string matches the booking's registered contact details
 * (email, phone, NIC/passport, or booking_lookup_token).
 */
function verifyGuestBookingAccess(booking, verificationInput) {
  if (!booking || !verificationInput) return false;
  const cleanInput = String(verificationInput).trim().toLowerCase();
  if (!cleanInput || cleanInput.length < 3) return false;

  const candidates = [
    booking.contact_email,
    booking.account_email,
    booking.contact_phone,
    booking.passenger_nic,
    booking.booking_lookup_token
  ]
    .filter(Boolean)
    .map((v) => String(v).trim().toLowerCase());

  if (Array.isArray(booking.passengers)) {
    for (const p of booking.passengers) {
      if (p.nic_passport) candidates.push(String(p.nic_passport).trim().toLowerCase());
    }
  }

  const normalizePhone = (s) => s.replace(/[\s\-()]/g, '');
  const normalizedInput = normalizePhone(cleanInput);

  for (const cand of candidates) {
    if (cand === cleanInput) return true;
    const normCand = normalizePhone(cand);
    if (normCand.length >= 6 && normCand === normalizedInput) return true;
  }
  return false;
}

module.exports = {
  getBookingByPnrOrId,
  listBookingsForUser,
  listAllBookings,
  recordBookingStatusChange,
  verifyGuestBookingAccess
};
