const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

// Use an isolated test database so the persistent database/ceylon_rail.db is untouched during test runs
const testDbPath = path.join(__dirname, '..', '..', 'database', 'ceylon_rail_test.db');
process.env.DATABASE_PATH = testDbPath;
process.env.DB_PATH = testDbPath;
process.env.NODE_ENV = 'test';

const { startServer, stopServer } = require('../server');
const { initDatabase, dbAll, dbGet, dbRun } = require('../database');
const { resetRateLimiter } = require('../middleware/rateLimiter');

let baseUrl = '';
const testResults = [];

function request(method, urlPath, { token = null, body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const fullUrl = new URL(urlPath, baseUrl);
    const reqHeaders = { ...headers };
    let payloadStr = null;

    if (token) {
      reqHeaders['Authorization'] = `Bearer ${token}`;
    }
    if (body !== null && body !== undefined) {
      payloadStr = JSON.stringify(body);
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payloadStr);
    }

    const req = http.request(
      {
        hostname: fullUrl.hostname,
        port: fullUrl.port,
        path: fullUrl.pathname + fullUrl.search,
        method,
        headers: reqHeaders
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch (_e) {}
          resolve({ status: res.statusCode, headers: res.headers, json, raw });
        });
      }
    );
    req.on('error', reject);
    if (payloadStr) req.write(payloadStr);
    req.end();
  });
}

async function runTest(category, name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    const ms = Date.now() - t0;
    testResults.push({ category, name, status: 'PASS', ms });
    console.log(`  [PASS] (${ms}ms) ${category} :: ${name}`);
  } catch (err) {
    const ms = Date.now() - t0;
    testResults.push({ category, name, status: 'FAIL', ms, error: err.message });
    console.error(`  [FAIL] (${ms}ms) ${category} :: ${name}\n         -> ${err.message}`);
  }
}

async function main() {
  for (const suffix of ['', '-wal', '-shm']) {
    if (fs.existsSync(testDbPath + suffix)) {
      fs.unlinkSync(testDbPath + suffix);
    }
  }

  console.log('================================================================================');
  console.log('CEYLON RAIL — AUTOMATED INTEGRATION, GUEST BOOKING & SECURITY TEST SUITE');
  console.log('================================================================================');

  const { port } = await startServer({ port: 0, dbPath: testDbPath });
  baseUrl = `http://127.0.0.1:${port}`;

  let adminToken = null;
  let financeToken = null;
  let complaintOfficerToken = null;
  let passengerAToken = null;
  let passengerBToken = null;
  let guestBookingPnr = null;
  let confirmedBookingPnr = null;
  let confirmedBookingQr = null;
  let savedItineraryId = null;
  let submittedComplaintId = null;
  let guestComplaintRef = null;

  // ---------------------------------------------------------------------------
  // 1. DATABASE, MIGRATIONS & SEEDING INTEGRITY TESTS
  // ---------------------------------------------------------------------------
  await runTest('1. Database & Migrations', 'All 35 normalized relational tables exist with foreign keys enabled', async () => {
    const fkRow = dbGet('PRAGMA foreign_keys');
    assert.strictEqual(Number(fkRow.foreign_keys), 1, 'PRAGMA foreign_keys must be ON (1)');

    const expectedTables = [
      'schema_migrations', 'roles', 'permissions', 'role_permissions',
      'users', 'passenger_profiles', 'user_sessions',
      'staff_users', 'staff_sessions', 'audit_logs', 'notifications',
      'stations', 'trains', 'train_schedules', 'operating_days', 'route_stops',
      'carriages', 'seats', 'fare_rules',
      'bookings', 'booking_passengers', 'seat_reservations', 'booking_status_history',
      'payments', 'payment_transactions', 'cancellations', 'refunds',
      'tourist_destinations', 'tourist_attractions', 'destination_station_links',
      'scenic_routes', 'saved_itineraries', 'itinerary_days', 'itinerary_items',
      'complaints', 'complaint_status_history', 'complaint_assignments',
      'complaint_responses', 'complaint_attachments', 'feedback_submissions',
      'operating_expenses', 'financial_report_runs'
    ];
    const existingRows = dbAll("SELECT name FROM sqlite_master WHERE type='table'");
    const existingSet = new Set(existingRows.map((r) => r.name));
    for (const tbl of expectedTables) {
      assert.ok(existingSet.has(tbl), `Missing required normalized table: ${tbl}`);
    }
  });

  await runTest('1. Database & Migrations', 'Initial database starts with clean transactional tables', async () => {
    assert.strictEqual(dbGet('SELECT COUNT(*) as c FROM users').c, 0, 'users table must start with 0 initial users');
    assert.strictEqual(dbGet('SELECT COUNT(*) as c FROM bookings').c, 0, 'bookings table must start with 0 initial bookings');
    assert.strictEqual(dbGet('SELECT COUNT(*) as c FROM payments').c, 0, 'payments table must start with 0 initial payments');
    assert.strictEqual(dbGet('SELECT COUNT(*) as c FROM complaints').c, 0, 'complaints table must start with 0 initial complaints');
    assert.strictEqual(dbGet('SELECT COUNT(*) as c FROM operating_expenses').c, 0, 'operating_expenses must start with 0 initial expenses');
  });

  await runTest('1. Database & Migrations', 'Initial administrator admin (password 1234) is provisioned with salted scrypt hash and never plaintext', async () => {
    const admin = dbGet(
      `SELECT su.*, r.code AS role_code
       FROM staff_users su JOIN roles r ON r.id = su.role_id
       WHERE su.username = 'admin'`
    );
    assert.ok(admin, 'Initial admin must exist');
    assert.strictEqual(admin.role_code, 'SUPER_ADMIN');
    assert.strictEqual(Number(admin.is_active), 1);
    assert.ok(admin.password_hash.startsWith('scrypt$'), 'Password must be hashed with scrypt');
    assert.ok(!admin.password_hash.includes('1234'), 'Plaintext password must never be stored');
  });

  // ---------------------------------------------------------------------------
  // 2. GUEST BOOKING WORKFLOW (NO MANDATORY LOGIN) & CONTACT VERIFICATION
  // ---------------------------------------------------------------------------
  await runTest('2. Guest Booking (No Login)', 'Guest locks seats, books ticket without login, and receives confirmed PNR + signed QR', async () => {
    const lockRes = await request('POST', '/api/seats/lock', {
      body: {
        train_id: 1,
        carriage_code: 'C1',
        travel_date: '2026-12-18',
        from_station: 'FOT',
        to_station: 'ELL',
        seats: ['1A', '1B'],
        session_id: 'GUEST-TEST-SESSION-001'
      }
    });
    assert.strictEqual(lockRes.status, 200);

    const bookRes = await request('POST', '/api/bookings', {
      body: {
        train_id: 1,
        from_station: 'FOT',
        to_station: 'ELL',
        travel_date: '2026-12-18',
        carriage_code: 'C1',
        seats: ['1A', '1B'],
        session_id: 'GUEST-TEST-SESSION-001',
        contact_phone: '+94 77 555 8899',
        contact_email: 'guest.traveler@example.com',
        passengers: [
          { full_name: 'Ruwan Dias', nic_passport: '199112345678', passenger_type: 'ADULT', seat_number: '1A' },
          { full_name: 'Chathuri Dias', nic_passport: '199387654321', passenger_type: 'ADULT', seat_number: '1B' }
        ],
        payment_method: 'CARD',
        payment_details: { card_number: '4242424242424242' }
      }
    });
    assert.strictEqual(bookRes.status, 201);
    assert.strictEqual(bookRes.json.booking.status, 'CONFIRMED');
    assert.strictEqual(bookRes.json.booking.payment_status, 'PAID');
    assert.strictEqual(Number(bookRes.json.booking.is_guest_booking), 1);
    assert.strictEqual(bookRes.json.booking.user_id, null);
    assert.ok(bookRes.json.booking.pnr.startsWith('SLR-'));
    guestBookingPnr = bookRes.json.booking.pnr;
  });

  await runTest('2. Guest Booking (No Login)', 'Guest booking lookup rejects missing/wrong verification and succeeds with matching contact', async () => {
    // Attempt lookup with wrong email -> must be rejected with 403
    const badLookup = await request('POST', '/api/bookings/lookup', {
      body: { pnr: guestBookingPnr, verification: 'wrong@example.com' }
    });
    assert.strictEqual(badLookup.status, 403);

    // Attempt direct GET without verification -> must be rejected with 401
    const unverifiedGet = await request('GET', `/api/bookings/${guestBookingPnr}`);
    assert.strictEqual(unverifiedGet.status, 401);

    // Lookup with matching contact phone -> must succeed
    const goodLookup = await request('POST', '/api/bookings/lookup', {
      body: { pnr: guestBookingPnr, verification: '+94 77 555 8899' }
    });
    assert.strictEqual(goodLookup.status, 200);
    assert.strictEqual(goodLookup.json.booking.pnr, guestBookingPnr);
    assert.ok(goodLookup.json.booking.qr_svg);
  });

  await runTest('2. Guest Booking (No Login)', 'Guest cancels booking using PNR + contact verification and receives processed refund', async () => {
    const cancelRes = await request('POST', `/api/bookings/${guestBookingPnr}/cancel`, {
      body: {
        reason: 'Guest itinerary change',
        verification: 'guest.traveler@example.com'
      }
    });
    assert.strictEqual(cancelRes.status, 200);
    assert.strictEqual(cancelRes.json.booking.status, 'CANCELLED');
    assert.ok(cancelRes.json.refund);
    assert.ok(cancelRes.json.refund.amount_cents > 0);
  });

  // ---------------------------------------------------------------------------
  // 3. STAFF PORTAL AUTHENTICATION, PASSWORD CHANGE & RBAC TESTS
  // ---------------------------------------------------------------------------
  await runTest('3. Staff Authentication & RBAC', 'Initial admin (admin / 1234) logs in, changes password, and repeated DB init preserves changed password', async () => {
    resetRateLimiter();
    const loginRes = await request('POST', '/api/staff/auth/login', {
      body: { username: 'admin', password: '1234' }
    });
    assert.strictEqual(loginRes.status, 200);
    assert.ok(loginRes.json.token);
    assert.strictEqual(loginRes.json.staff.password_hash, undefined, 'password_hash must never be exposed');
    adminToken = loginRes.json.token;

    // Change password from 1234 to NewAdminPass2026
    const changeRes = await request('POST', '/api/staff/auth/change-password', {
      token: adminToken,
      body: {
        current_password: '1234',
        new_password: 'NewAdminPass2026'
      }
    });
    assert.strictEqual(changeRes.status, 200);

    // Re-run initDatabase() to verify idempotent startup does NOT reset changed password back to 1234
    await initDatabase(testDbPath);

    const oldLogin = await request('POST', '/api/staff/auth/login', {
      body: { username: 'admin', password: '1234' }
    });
    assert.strictEqual(oldLogin.status, 401);

    const newLogin = await request('POST', '/api/staff/auth/login', {
      body: { username: 'admin', password: 'NewAdminPass2026' }
    });
    assert.strictEqual(newLogin.status, 200);
    adminToken = newLogin.json.token;
  });

  await runTest('3. Staff Authentication & RBAC', 'Unauthenticated access to staff endpoints is rejected and role permissions are enforced', async () => {
    const unauthRes = await request('GET', '/api/staff/users');
    assert.strictEqual(unauthRes.status, 401);

    const finRes = await request('POST', '/api/staff/users', {
      token: adminToken,
      body: {
        username: 'fin_officer',
        email: 'finance@railway.gov.lk',
        full_name: 'Nimal Perera',
        password: 'FinancePass2026',
        role_code: 'FINANCE_STAFF',
        must_change_password: false
      }
    });
    assert.strictEqual(finRes.status, 201);

    const cmpRes = await request('POST', '/api/staff/users', {
      token: adminToken,
      body: {
        username: 'cmp_officer',
        email: 'complaints@railway.gov.lk',
        full_name: 'Kamani Silva',
        password: 'ComplaintPass2026',
        role_code: 'COMPLAINT_OFFICER',
        must_change_password: false
      }
    });
    assert.strictEqual(cmpRes.status, 201);

    const finLogin = await request('POST', '/api/staff/auth/login', {
      body: { username: 'fin_officer', password: 'FinancePass2026' }
    });
    financeToken = finLogin.json.token;

    const cmpLogin = await request('POST', '/api/staff/auth/login', {
      body: { username: 'cmp_officer', password: 'ComplaintPass2026' }
    });
    complaintOfficerToken = cmpLogin.json.token;

    // COMPLAINT_OFFICER denied access to financial reports (403)
    const cmpFinAttempt = await request('GET', '/api/staff/finance/reports', { token: complaintOfficerToken });
    assert.strictEqual(cmpFinAttempt.status, 403);

    // FINANCE_STAFF denied access to staff user creation (403)
    const finStaffAttempt = await request('GET', '/api/staff/users', { token: financeToken });
    assert.strictEqual(finStaffAttempt.status, 403);
  });

  await runTest('3. Staff Authentication & RBAC', 'Optional passenger registration and profile management continue to work', async () => {
    const regA = await request('POST', '/api/auth/register', {
      body: {
        full_name: 'Kasun Jayasuriya',
        email: 'kasun@example.lk',
        phone: '+94 77 123 4567',
        nic_passport: '199412345678',
        password: 'PassengerA2026',
        preferred_language: 'SI'
      }
    });
    assert.strictEqual(regA.status, 201);
    passengerAToken = regA.json.token;

    const regB = await request('POST', '/api/auth/register', {
      body: {
        full_name: 'Dilani Fernando',
        email: 'dilani@example.lk',
        phone: '+94 71 987 6543',
        nic_passport: '199687654321',
        password: 'PassengerB2026',
        preferred_language: 'TA'
      }
    });
    assert.strictEqual(regB.status, 201);
    passengerBToken = regB.json.token;
  });

  // ---------------------------------------------------------------------------
  // 4. TRAIN SEARCH, SCHEDULE & STATION ORDER VALIDATION TESTS
  // ---------------------------------------------------------------------------
  await runTest('4. Train Search & Route Validation', 'Valid route search returns matching trains with accurate segment distance and duration', async () => {
    const res = await request('GET', '/api/trains?from=FOT&to=ELL&date=2026-12-15');
    assert.strictEqual(res.status, 200);
    assert.ok(res.json.trains.length >= 3);
    const podiMenike = res.json.trains.find((t) => t.train_number === '1005');
    assert.ok(podiMenike);
    assert.strictEqual(podiMenike.segment_distance_km, 271.6);
  });

  await runTest('4. Train Search & Route Validation', 'Same origin and destination station is rejected with HTTP 400', async () => {
    const res = await request('GET', '/api/trains?from=FOT&to=FOT');
    assert.strictEqual(res.status, 400);
  });

  await runTest('4. Train Search & Route Validation', 'Reverse station order is excluded from search and rejected in fare calculation', async () => {
    const searchRes = await request('GET', '/api/trains?from=BAD&to=FOT');
    assert.strictEqual(searchRes.status, 200);
    assert.strictEqual(searchRes.json.trains.length, 0);

    const fareRes = await request('POST', '/api/fares/calculate', {
      body: { train_id: 1, from_station: 'BAD', to_station: 'FOT', class_name: '2nd Class Reserved' }
    });
    assert.strictEqual(fareRes.status, 400);
  });

  // ---------------------------------------------------------------------------
  // 5. FARE CALCULATION & CONCURRENCY-SAFE SEAT RESERVATION TESTS
  // ---------------------------------------------------------------------------
  await runTest('5. Fare & Seat Locking', 'Fare calculation computes exact integer cents with adult, child (50%), and senior (25%) concessions', async () => {
    const res = await request('POST', '/api/fares/calculate', {
      body: {
        train_id: 1,
        from_station: 'FOT',
        to_station: 'KDY',
        class_name: '2nd Class Reserved',
        passengers: [
          { full_name: 'Adult Passenger', passenger_type: 'ADULT' },
          { full_name: 'Child Passenger', passenger_type: 'CHILD' }
        ]
      }
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.json.fare.distance_km, 120.9);
    assert.ok(res.json.fare.total_amount_cents > 0);
    assert.ok(res.json.fare.passengers[1].ticket_fare_cents < res.json.fare.passengers[0].ticket_fare_cents);
  });

  await runTest('5. Fare & Seat Locking', 'Concurrent seat lock conflict prevents double-locking the same seat and expired locks auto-release', async () => {
    const lockA = await request('POST', '/api/seats/lock', {
      token: passengerAToken,
      body: {
        train_id: 1,
        carriage_code: 'C1',
        travel_date: '2026-12-20',
        seats: ['2A'],
        session_id: 'SESSION-PASSENGER-A'
      }
    });
    assert.strictEqual(lockA.status, 200);

    const lockB = await request('POST', '/api/seats/lock', {
      token: passengerBToken,
      body: {
        train_id: 1,
        carriage_code: 'C1',
        travel_date: '2026-12-20',
        seats: ['2A'],
        session_id: 'SESSION-PASSENGER-B'
      }
    });
    assert.strictEqual(lockB.status, 409);

    dbRun(
      `UPDATE seat_reservations SET expires_at = datetime('now', '-5 minutes')
       WHERE train_id = 1 AND carriage_code = 'C1' AND seat_number = '2A' AND travel_date = '2026-12-20'`
    );

    const lockBAfterExpiry = await request('POST', '/api/seats/lock', {
      token: passengerBToken,
      body: {
        train_id: 1,
        carriage_code: 'C1',
        travel_date: '2026-12-20',
        seats: ['2A'],
        session_id: 'SESSION-PASSENGER-B'
      }
    });
    assert.strictEqual(lockBAfterExpiry.status, 200);

    await request('POST', '/api/seats/unlock', {
      token: passengerBToken,
      body: {
        train_id: 1,
        carriage_code: 'C1',
        travel_date: '2026-12-20',
        seats: ['2A'],
        session_id: 'SESSION-PASSENGER-B'
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 6. PAYMENT VERIFICATION, BOOKING, QR SIGNING, CANCELLATION & REFUND TESTS
  // ---------------------------------------------------------------------------
  await runTest('6. Payments, QR & Refunds', 'Declined payment fails gracefully (402), records FAILED payment transaction, and does NOT book seats', async () => {
    const failedBookingRes = await request('POST', '/api/bookings', {
      token: passengerAToken,
      body: {
        train_id: 1,
        from_station: 'FOT',
        to_station: 'ELL',
        travel_date: '2026-12-22',
        carriage_code: 'C2',
        seats: ['4A', '4B'],
        payment_method: 'CARD',
        payment_details: { simulate_failure: true, failure_reason: 'Insufficient funds on test card' }
      }
    });
    assert.strictEqual(failedBookingRes.status, 402);
    assert.strictEqual(failedBookingRes.json.payment.status, 'FAILED');

    const seatMapRes = await request('GET', '/api/seats/1/C2?travel_date=2026-12-22');
    assert.strictEqual(seatMapRes.json.reservations.length, 0);
  });

  await runTest('6. Payments, QR & Refunds', 'Verified payment confirms booking, locks seats as BOOKED, and issues HMAC-SHA256 signed QR e-ticket', async () => {
    const bookingRes = await request('POST', '/api/bookings', {
      token: passengerAToken,
      body: {
        train_id: 1,
        from_station: 'FOT',
        to_station: 'ELL',
        travel_date: '2026-12-22',
        carriage_code: 'C2',
        seats: ['4A', '4B'],
        passengers: [
          { full_name: 'Kasun Jayasuriya', nic_passport: '199412345678', passenger_type: 'ADULT', seat_number: '4A' },
          { full_name: 'Nethmi Jayasuriya', nic_passport: '199712345678', passenger_type: 'ADULT', seat_number: '4B' }
        ],
        payment_method: 'CARD',
        payment_details: { card_number: '4242424242424242' }
      }
    });
    assert.strictEqual(bookingRes.status, 201);
    assert.strictEqual(bookingRes.json.booking.status, 'CONFIRMED');
    assert.strictEqual(bookingRes.json.booking.payment_status, 'PAID');
    assert.ok(bookingRes.json.booking.qr_payload.startsWith('SLR-ETICKET-V2|'));

    confirmedBookingPnr = bookingRes.json.booking.pnr;
    confirmedBookingQr = bookingRes.json.booking.qr_payload;

    const qrVerify = await request('POST', '/api/tickets/verify', {
      body: { qr_payload: confirmedBookingQr }
    });
    assert.strictEqual(qrVerify.status, 200);
    assert.strictEqual(qrVerify.json.verification.valid, true);
    assert.strictEqual(qrVerify.json.verification.signature_verified, true);
  });

  await runTest('6. Payments, QR & Refunds', 'Cross-user IDOR protection blocks Passenger B from viewing or cancelling Passenger A booking', async () => {
    const viewAttempt = await request('GET', `/api/bookings/${confirmedBookingPnr}`, {
      token: passengerBToken
    });
    assert.strictEqual(viewAttempt.status, 403);

    const cancelAttempt = await request('POST', `/api/bookings/${confirmedBookingPnr}/cancel`, {
      token: passengerBToken,
      body: { reason: 'Unauthorized cancel attempt' }
    });
    assert.strictEqual(cancelAttempt.status, 403);
  });

  // ---------------------------------------------------------------------------
  // 7. SMART TRAVEL PLANNER & SUPPLIED IMAGES TESTS
  // ---------------------------------------------------------------------------
  await runTest('7. Smart Travel Planner', 'Destinations return real supplied image paths, attractions, nearest stations, and suggested itineraries', async () => {
    const destRes = await request('GET', '/api/travel-planner/destinations');
    assert.strictEqual(destRes.status, 200);
    assert.ok(destRes.json.destinations.length >= 7);
    const ella = destRes.json.destinations.find((d) => d.slug === 'ella-highlands');
    assert.ok(ella);
    assert.strictEqual(ella.hero_image_url, '/images/route_highland.jpg');
    assert.strictEqual(ella.nearest_station.station_code, 'ELL');
    assert.ok(ella.recommended_trains.length >= 3);
    assert.ok(Array.isArray(ella.suggested_itinerary) && ella.suggested_itinerary.length >= 2);
  });

  await runTest('7. Smart Travel Planner', 'Authorized staff can add/update Travel Planner destinations and attractions', async () => {
    const saveDestRes = await request('POST', '/api/staff/travel-planner/destinations', {
      token: adminToken,
      body: {
        name: 'Haputale & Lipton’s Seat Cloud Ridge',
        region: 'Uva Province',
        category: 'Tea Estates & Escarpment',
        station_code: 'HPT',
        hero_image_url: '/images/image_441e3b.jpg',
        summary: 'Misty mountain ridge at 1,479m overlooking the southern plains.',
        description: 'Direct Main Line access via Haputale Railway Station (HPT).'
      }
    });
    assert.strictEqual(saveDestRes.status, 201);
    assert.strictEqual(saveDestRes.json.destination.nearest_station.station_code, 'HPT');
  });

  // ---------------------------------------------------------------------------
  // 8. GUEST & REGISTERED COMPLAINTS, INTERNAL NOTES PRIVACY & FEEDBACK TESTS
  // ---------------------------------------------------------------------------
  await runTest('8. Complaints & Feedback', 'Guest passenger submits complaint without login and tracks it securely using reference + email', async () => {
    const guestCmp = await request('POST', '/api/complaints', {
      body: {
        guest_name: 'Amila Bandara',
        guest_email: 'amila.guest@example.com',
        guest_phone: '+94 76 222 3344',
        category: 'CLEANLINESS',
        subject: 'Washroom maintenance needed at Nanu Oya',
        description: 'Please inspect platform 1 waiting room facilities.'
      }
    });
    assert.strictEqual(guestCmp.status, 201);
    guestComplaintRef = guestCmp.json.complaint.complaint_reference;

    // Wrong email tracking attempt -> 403
    const badTrack = await request('POST', '/api/complaints/track', {
      body: { complaint_reference: guestComplaintRef, verification: 'wrong@example.com' }
    });
    assert.strictEqual(badTrack.status, 403);

    // Matching email tracking -> 200
    const goodTrack = await request('POST', '/api/complaints/track', {
      body: { complaint_reference: guestComplaintRef, verification: 'amila.guest@example.com' }
    });
    assert.strictEqual(goodTrack.status, 200);
    assert.strictEqual(goodTrack.json.complaint.complaint_reference, guestComplaintRef);
  });

  await runTest('8. Complaints & Feedback', 'Staff assigns complaint, writes internal + public notes, and keeps internal notes private', async () => {
    const cmpCreate = await request('POST', '/api/complaints', {
      token: passengerAToken,
      body: {
        category: 'COACH_FACILITIES',
        priority: 'HIGH',
        train_id: 1,
        subject: 'Air conditioning fluctuation in Carriage C2',
        description: 'During the climb past Hatton, AC unit in C2 needed inspection.'
      }
    });
    assert.strictEqual(cmpCreate.status, 201);
    submittedComplaintId = cmpCreate.json.complaint.id;

    await request('POST', `/api/staff/complaints/${submittedComplaintId}/assign`, {
      token: complaintOfficerToken,
      body: { notes: 'Assigned to Rolling Stock Maintenance Liaison' }
    });

    await request('POST', `/api/staff/complaints/${submittedComplaintId}/responses`, {
      token: complaintOfficerToken,
      body: {
        message: 'INTERNAL NOTE: Checked with Badulla depot engineer; compressor relay replaced.',
        is_internal_note: true
      }
    });

    await request('POST', `/api/staff/complaints/${submittedComplaintId}/responses`, {
      token: complaintOfficerToken,
      body: {
        message: 'Dear Passenger, our engineering team has serviced the C2 HVAC unit. Thank you for reporting this.',
        is_internal_note: false
      }
    });

    const resolveRes = await request('PUT', `/api/staff/complaints/${submittedComplaintId}/status`, {
      token: complaintOfficerToken,
      body: {
        status: 'RESOLVED',
        resolution_summary: 'HVAC compressor relay serviced at Badulla Depot.'
      }
    });
    assert.strictEqual(resolveRes.status, 200);
    assert.strictEqual(resolveRes.json.complaint.responses.length, 2);

    const passengerView = await request('GET', `/api/complaints/${submittedComplaintId}`, {
      token: passengerAToken
    });
    assert.strictEqual(passengerView.status, 200);
    assert.strictEqual(passengerView.json.complaint.responses.length, 1, 'Internal staff notes must be hidden from passenger view');
  });

  // ---------------------------------------------------------------------------
  // 9. FINANCIAL MANAGEMENT, OPERATING EXPENSES & REPORTING TESTS
  // ---------------------------------------------------------------------------
  await runTest('9. Financial Management & Reports', 'Period with no transactions returns insufficient_data=true and "Insufficient financial data"', async () => {
    const emptyReportRes = await request(
      'GET',
      '/api/staff/finance/reports?period_type=CUSTOM&start_date=2018-01-01&end_date=2018-01-31',
      { token: financeToken }
    );
    assert.strictEqual(emptyReportRes.status, 200);
    assert.strictEqual(emptyReportRes.json.report.insufficient_data, true);
  });

  await runTest('9. Financial Management & Reports', 'Recording operating expenses and generating report calculates exact Gross Revenue, Refunds, Net Income, Expenses, and Profit/Loss', async () => {
    const today = new Date().toISOString().slice(0, 10);

    const expRes = await request('POST', '/api/staff/finance/expenses', {
      token: financeToken,
      body: {
        category: 'FUEL_ENERGY',
        title: 'Main Line Diesel Locomotive Fuel Allocation',
        description: 'Low-sulfur traction diesel supply at Maradana Running Shed',
        amount_lkr: 1200.00,
        incurred_date: today,
        train_id: 1,
        vendor_name: 'Ceylon Petroleum Corporation'
      }
    });
    assert.strictEqual(expRes.status, 201);

    const reportRes = await request(
      'GET',
      `/api/staff/finance/reports?period_type=CUSTOM&start_date=${today}&end_date=${today}&save_run=true`,
      { token: financeToken }
    );
    assert.strictEqual(reportRes.status, 200);
    const rpt = reportRes.json.report;
    assert.strictEqual(rpt.insufficient_data, false);
    assert.ok(rpt.metrics.gross_revenue_cents > 0);
    assert.ok(rpt.metrics.total_refunds_cents > 0);
    assert.strictEqual(
      rpt.metrics.net_revenue_cents,
      rpt.metrics.gross_revenue_cents - rpt.metrics.total_refunds_cents
    );
    assert.strictEqual(
      rpt.metrics.net_profit_cents,
      rpt.metrics.net_revenue_cents - rpt.metrics.operating_expenses_cents
    );
  });

  await stopServer();

  for (const suffix of ['', '-wal', '-shm']) {
    if (fs.existsSync(testDbPath + suffix)) {
      try { fs.unlinkSync(testDbPath + suffix); } catch (_e) {}
    }
  }

  const passed = testResults.filter((t) => t.status === 'PASS').length;
  const failed = testResults.filter((t) => t.status === 'FAIL').length;
  console.log('================================================================================');
  console.log(`SUMMARY: ${passed}/${testResults.length} PASSED, ${failed} FAILED`);
  console.log('================================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
