const crypto = require('crypto');
const { dbGet, dbRun, withTransaction } = require('../database');
const {
  getBookingByPnrOrId,
  listBookingsForUser,
  listAllBookings,
  recordBookingStatusChange,
  verifyGuestBookingAccess
} = require('../repositories/bookingRepository');
const { getTrainById } = require('../repositories/railwayRepository');
const { createNotification } = require('../repositories/userRepository');
const { calculateSegmentFare } = require('../services/fareService');
const {
  getCarriageSeatAvailability,
  lockSeatsAtomically,
  releaseSeatLocks
} = require('../services/seatLockService');
const {
  getPaymentGatewayStatus,
  initiateBookingPayment,
  verifyAndSettlePayment,
  processCancellationAndRefund
} = require('../services/paymentService');
const {
  buildSignedQrPayload,
  verifyTicketQr,
  generateQrSvg
} = require('../services/qrService');
const { validateDateISO, sanitizeString } = require('../middleware/validation');
const { recordAuditLog } = require('../middleware/auth');

function calculateFarePreview(req, res) {
  const { train_id, from_station, to_station, class_name, passengers } = req.body || req.query || {};
  if (!train_id) {
    return res.status(400).json({ success: false, error: 'train_id is required.' });
  }
  const breakdown = calculateSegmentFare({
    trainId: Number(train_id),
    fromStation: from_station,
    toStation: to_station,
    className: class_name || '2nd Class Reserved',
    passengers: Array.isArray(passengers) ? passengers : [{ passenger_type: 'ADULT' }]
  });
  return res.json({
    success: true,
    fare: breakdown
  });
}

function getSeatMap(req, res) {
  const trainId = Number(req.params.trainId || req.query.train_id);
  const carriageCode = req.params.carriageCode || req.query.carriage_code || 'C1';
  const travelDate = req.query.travel_date || req.query.date || new Date().toISOString().slice(0, 10);
  const fromStation = req.query.from_station || req.query.from || null;
  const toStation = req.query.to_station || req.query.to || null;

  const data = getCarriageSeatAvailability({
    trainId,
    carriageCode,
    travelDate,
    fromStation,
    toStation
  });
  return res.json({
    success: true,
    ...data
  });
}

function lockSeats(req, res) {
  const {
    train_id,
    carriage_code,
    travel_date,
    seats,
    session_id,
    from_station,
    to_station
  } = req.body || {};

  if (!train_id || !carriage_code || !travel_date || !Array.isArray(seats) || seats.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'train_id, carriage_code, travel_date, and a non-empty seats array are required.'
    });
  }

  if (!validateDateISO(travel_date)) {
    return res.status(400).json({
      success: false,
      error: 'travel_date must be a valid YYYY-MM-DD date.'
    });
  }

  const effectiveSessionId = session_id || (req.user ? `USR-${req.user.id}` : `GUEST-${req.ip}`);
  const result = lockSeatsAtomically({
    trainId: Number(train_id),
    carriageCode: carriage_code,
    travelDate: travel_date,
    seats,
    sessionId: effectiveSessionId,
    userId: req.user?.id || null,
    fromStation: from_station,
    toStation: to_station
  });

  return res.json({
    success: true,
    lock: result
  });
}

function unlockSeats(req, res) {
  const { train_id, carriage_code, travel_date, seats, session_id } = req.body || {};
  const effectiveSessionId = session_id || (req.user ? `USR-${req.user.id}` : `GUEST-${req.ip}`);
  const result = releaseSeatLocks({
    trainId: Number(train_id),
    carriageCode: carriage_code,
    travelDate: travel_date,
    seats,
    sessionId: effectiveSessionId,
    userId: req.user?.id || null
  });
  return res.json({
    success: true,
    ...result
  });
}

/**
 * Create a booking and process/verify payment atomically.
 * Supports both Guest Bookings (no account required) and Registered Passenger Bookings.
 * Never trusts client-supplied user IDs, seat availability, fare amounts, or payment status.
 */
function createBooking(req, res) {
  const userId = req.user ? req.user.id : null;
  const isGuestBooking = !userId;

  const {
    train_id,
    from_station_id,
    from_station,
    to_station_id,
    to_station,
    travel_date,
    carriage_code,
    seats,
    passengers,
    passenger_name,
    passenger_nic,
    passenger_phone,
    passenger_email,
    contact_phone,
    contact_email,
    payment_method = 'CARD',
    payment_details = {},
    defer_payment = false,
    session_id
  } = req.body || {};

  if (!train_id || !travel_date || !carriage_code || !Array.isArray(seats) || seats.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'train_id, travel_date, carriage_code, and seats[] are required.'
    });
  }

  if (!validateDateISO(travel_date)) {
    return res.status(400).json({
      success: false,
      error: 'travel_date must be a valid YYYY-MM-DD date.'
    });
  }

  const train = getTrainById(Number(train_id));
  if (!train) {
    return res.status(404).json({ success: false, error: 'Train not found.' });
  }

  const carriage = dbGet(
    'SELECT * FROM carriages WHERE train_id = ? AND carriage_code = ?',
    [train.id, String(carriage_code).trim()]
  );
  if (!carriage) {
    return res.status(404).json({
      success: false,
      error: `Carriage ${carriage_code} not found on train ${train.train_number}.`
    });
  }

  const cleanSeats = Array.from(new Set(seats.map((s) => String(s).trim().toUpperCase())));
  if (cleanSeats.length !== seats.length) {
    return res.status(400).json({
      success: false,
      error: 'Duplicate seat numbers in the same booking request are not allowed.'
    });
  }

  const rawLeadName = sanitizeString(
    passenger_name ||
      (Array.isArray(passengers) && passengers[0]?.full_name) ||
      req.user?.full_name ||
      '',
    120
  );
  const rawLeadNic = sanitizeString(
    passenger_nic ||
      (Array.isArray(passengers) && passengers[0]?.nic_passport) ||
      req.user?.nic_passport ||
      '',
    40
  );
  const rawPhone = sanitizeString(contact_phone || passenger_phone || req.user?.phone || '', 40);
  const rawEmail = sanitizeString(contact_email || passenger_email || req.user?.email || '', 160).toLowerCase();

  // For guest bookings, validate lead passenger name and at least one contact/verification identifier
  if (isGuestBooking) {
    if (!rawLeadName) {
      return res.status(400).json({
        success: false,
        error: 'Lead passenger full name is required for guest booking.'
      });
    }
    if (!rawEmail && !rawPhone && !rawLeadNic) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a contact phone number, email address, or NIC/Passport number so you can securely retrieve your ticket.'
      });
    }
  }

  const fallbackLeadName = rawLeadName || req.user?.full_name || 'Passenger';
  const passengerInputList =
    Array.isArray(passengers) && passengers.length === cleanSeats.length
      ? passengers
      : cleanSeats.map((seatNum, idx) => ({
          full_name: idx === 0 ? fallbackLeadName : `${fallbackLeadName} (Passenger ${idx + 1})`,
          nic_passport: idx === 0 ? rawLeadNic : '',
          passenger_type: 'ADULT',
          seat_number: seatNum
        }));

  // Calculate server-authoritative route distance & fare
  const fareCalc = calculateSegmentFare({
    trainId: train.id,
    fromStation: from_station_id || from_station || train.origin_station_id,
    toStation: to_station_id || to_station || train.destination_station_id,
    className: carriage.class_name,
    passengers: passengerInputList
  });

  const effectiveSessionId = session_id || (userId ? `USR-${userId}` : `GUEST-${crypto.randomBytes(6).toString('hex')}`);
  const lookupToken = crypto.randomBytes(8).toString('hex').toUpperCase();

  // Step 1: Lock seats & create booking in PENDING_PAYMENT state inside an atomic transaction
  const createdBookingAndPayment = withTransaction(() => {
    lockSeatsAtomically({
      trainId: train.id,
      carriageCode: carriage.carriage_code,
      travelDate: travel_date,
      seats: cleanSeats,
      sessionId: effectiveSessionId,
      userId,
      fromStation: fareCalc.from_station_id,
      toStation: fareCalc.to_station_id
    });

    const pnr = `SLR-${Date.now().toString(36).slice(-4).toUpperCase()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const leadName = sanitizeString(passengerInputList[0]?.full_name || fallbackLeadName, 120);
    const leadNic = sanitizeString(passengerInputList[0]?.nic_passport || rawLeadNic, 40);

    const scheduleRow = dbGet('SELECT id FROM train_schedules WHERE train_id = ? LIMIT 1', [train.id]);

    const bRes = dbRun(
      `INSERT INTO bookings (
        pnr, user_id, is_guest_booking, booking_lookup_token,
        train_id, schedule_id, from_station_id, to_station_id,
        travel_date, carriage_code, class_name, seats_csv, passengers_count,
        distance_km, subtotal_cents, reservation_fee_cents, tax_cents,
        total_amount_cents, total_amount_lkr, status, payment_status,
        payment_method, passenger_name, passenger_nic, contact_phone, contact_email, qr_payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_PAYMENT', 'UNPAID', ?, ?, ?, ?, ?, '')`,
      [
        pnr,
        userId,
        isGuestBooking ? 1 : 0,
        lookupToken,
        train.id,
        scheduleRow ? scheduleRow.id : null,
        fareCalc.from_station_id,
        fareCalc.to_station_id,
        travel_date,
        carriage.carriage_code,
        carriage.class_name,
        cleanSeats.join(','),
        cleanSeats.length,
        fareCalc.distance_km,
        fareCalc.subtotal_cents,
        fareCalc.reservation_fee_cents,
        fareCalc.tax_cents,
        fareCalc.total_amount_cents,
        fareCalc.total_amount_lkr,
        payment_method,
        leadName,
        leadNic,
        rawPhone,
        rawEmail
      ]
    );
    const bookingId = bRes.lastID;

    cleanSeats.forEach((seatNum, idx) => {
      const pInfo = passengerInputList[idx] || {};
      const pFare = fareCalc.passengers[idx] || { fare_cents: Math.round(fareCalc.total_amount_cents / cleanSeats.length) };
      const seatRow = dbGet(
        'SELECT id FROM seats WHERE carriage_id = ? AND seat_number = ?',
        [carriage.id, seatNum]
      );

      dbRun(
        `INSERT INTO booking_passengers (
          booking_id, full_name, nic_passport, passenger_type, age,
          seat_id, carriage_code, seat_number, fare_cents
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          bookingId,
          sanitizeString(pInfo.full_name || leadName, 120),
          sanitizeString(pInfo.nic_passport, 40) || null,
          ['ADULT', 'CHILD', 'SENIOR'].includes(pInfo.passenger_type) ? pInfo.passenger_type : 'ADULT',
          pInfo.age ? Number(pInfo.age) : null,
          seatRow ? seatRow.id : null,
          carriage.carriage_code,
          seatNum,
          pFare.fare_cents
        ]
      );
    });

    recordBookingStatusChange({
      bookingId,
      previousStatus: null,
      newStatus: 'PENDING_PAYMENT',
      changedByType: isGuestBooking ? 'GUEST' : 'PASSENGER',
      changedById: userId,
      reason: 'Booking created and seats locked pending payment verification'
    });

    const payment = initiateBookingPayment({
      bookingId,
      amountCents: fareCalc.total_amount_cents,
      paymentMethod: payment_method
    });

    return { bookingId, pnr, payment, leadName, leadNic };
  });

  if (defer_payment === true) {
    const pendingBooking = getBookingByPnrOrId(createdBookingAndPayment.bookingId);
    return res.status(201).json({
      success: true,
      booking: pendingBooking,
      payment: createdBookingAndPayment.payment,
      payment_gateway_status: getPaymentGatewayStatus()
    });
  }

  // Step 2: Verify and settle payment on the server
  const settlement = verifyAndSettlePayment({
    paymentId: createdBookingAndPayment.payment.id,
    bookingId: createdBookingAndPayment.bookingId,
    paymentMethod: payment_method,
    paymentDetails: payment_details,
    webhookSignature: req.headers?.['x-webhook-signature']
  });

  if (!settlement.verified) {
    withTransaction(() => {
      dbRun(
        `UPDATE bookings SET payment_status = 'FAILED', updated_at = datetime('now') WHERE id = ?`,
        [createdBookingAndPayment.bookingId]
      );
      recordBookingStatusChange({
        bookingId: createdBookingAndPayment.bookingId,
        previousStatus: 'PENDING_PAYMENT',
        newStatus: 'PENDING_PAYMENT',
        changedByType: 'SYSTEM',
        reason: `Payment verification failed: ${settlement.failure_reason}`
      });
      releaseSeatLocks({
        trainId: train.id,
        carriageCode: carriage.carriage_code,
        travelDate: travel_date,
        seats: cleanSeats,
        sessionId: effectiveSessionId,
        userId
      });
    });

    return res.status(402).json({
      success: false,
      code: 'PAYMENT_VERIFICATION_FAILED',
      error: settlement.failure_reason,
      booking: getBookingByPnrOrId(createdBookingAndPayment.bookingId),
      payment: settlement.payment
    });
  }

  // Step 3: Payment verified -> transition seat_reservations to BOOKED, generate HMAC-signed QR, confirm booking
  withTransaction(() => {
    for (const seatNum of cleanSeats) {
      const upd = dbRun(
        `UPDATE seat_reservations
         SET status = 'BOOKED',
             booking_id = ?,
             expires_at = NULL,
             updated_at = datetime('now')
         WHERE train_id = ?
           AND carriage_code = ?
           AND seat_number = ?
           AND travel_date = ?
           AND (locked_by_session = ? OR (? IS NOT NULL AND locked_by_user_id = ?))`,
        [
          createdBookingAndPayment.bookingId,
          train.id,
          carriage.carriage_code,
          seatNum,
          travel_date,
          effectiveSessionId,
          userId,
          userId
        ]
      );
      if (upd.changes === 0) {
        const err = new Error(`Seat lock for ${seatNum} expired or was lost prior to confirmation.`);
        err.statusCode = 409;
        throw err;
      }
    }

    const tempBooking = dbGet('SELECT * FROM bookings WHERE id = ?', [createdBookingAndPayment.bookingId]);
    const signedQr = buildSignedQrPayload(tempBooking);

    dbRun(
      `UPDATE bookings
       SET status = 'CONFIRMED',
           payment_status = 'PAID',
           qr_payload = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
      [signedQr, createdBookingAndPayment.bookingId]
    );

    recordBookingStatusChange({
      bookingId: createdBookingAndPayment.bookingId,
      previousStatus: 'PENDING_PAYMENT',
      newStatus: 'CONFIRMED',
      changedByType: 'SYSTEM',
      reason: `Payment verified (${settlement.payment.payment_reference})`
    });

    if (userId) {
      createNotification({
        userId,
        type: 'BOOKING',
        title: `Booking Confirmed — PNR ${createdBookingAndPayment.pnr}`,
        message: `Your reservation on ${train.train_number} ${train.name} (${fareCalc.from_station_name} to ${fareCalc.to_station_name}) on ${travel_date} for seats ${cleanSeats.join(', ')} is confirmed.`,
        relatedEntityType: 'bookings',
        relatedEntityId: createdBookingAndPayment.pnr
      });
    }
  });

  const confirmedBooking = getBookingByPnrOrId(createdBookingAndPayment.bookingId);
  confirmedBooking.qr_svg = generateQrSvg(confirmedBooking.qr_payload);

  recordAuditLog({
    actorType: isGuestBooking ? 'GUEST' : 'PASSENGER',
    actorId: userId,
    actorIdentifier: rawEmail || rawPhone || createdBookingAndPayment.leadName,
    action: 'BOOKING_CONFIRMED',
    entityType: 'bookings',
    entityId: confirmedBooking.pnr,
    details: {
      is_guest_booking: isGuestBooking,
      train_number: train.train_number,
      seats: cleanSeats,
      total_amount_cents: confirmedBooking.total_amount_cents
    },
    ipAddress: req.ip
  });

  return res.status(201).json({
    success: true,
    booking: confirmedBooking,
    payment: settlement.payment,
    payment_gateway_status: getPaymentGatewayStatus()
  });
}

function getPassengerBookings(req, res) {
  const bookings = listBookingsForUser(req.user.id).map((b) => ({
    ...b,
    qr_svg: b.qr_payload ? generateQrSvg(b.qr_payload) : null
  }));
  return res.json({
    success: true,
    bookings
  });
}

/**
 * Retrieve booking details securely:
 * - Authorized staff can view any booking.
 * - Authenticated passenger who owns the booking can view it.
 * - Guest or unauthenticated passenger must supply matching verification (contact email, phone, or NIC/Passport) AND a non-guessable PNR.
 */
function getBookingDetails(req, res) {
  const pnrOrId = req.params.pnrOrId || req.body?.pnr || req.query?.pnr;
  const verification =
    req.query?.verification ||
    req.query?.contact ||
    req.body?.verification ||
    req.body?.contact ||
    req.headers?.['x-booking-verification'];

  const booking = getBookingByPnrOrId(pnrOrId);
  if (!booking) {
    return res.status(404).json({ success: false, error: 'Booking not found.' });
  }

  const isStaff = Boolean(req.staff);
  const isOwnerUser = Boolean(req.user && booking.user_id && booking.user_id === req.user.id);
  const isVerifiedGuest =
    ! /^\d+$/.test(String(pnrOrId).trim()) &&
    verifyGuestBookingAccess(booking, verification);

  if (!isStaff && !isOwnerUser && !isVerifiedGuest) {
    if (!req.user && !verification) {
      return res.status(401).json({
        success: false,
        error: 'Verification required. Please provide your booking reference (PNR) along with your registered phone, email, or NIC/Passport.'
      });
    }
    return res.status(403).json({
      success: false,
      error: 'Access denied. Verification details do not match this booking.'
    });
  }

  booking.qr_svg = booking.qr_payload ? generateQrSvg(booking.qr_payload) : null;
  return res.json({
    success: true,
    booking
  });
}

/**
 * Dedicated Guest Booking Lookup endpoint (POST /api/bookings/lookup).
 * Requires unpredictable PNR + matching registered contact (phone, email, or NIC/passport).
 */
function lookupGuestBooking(req, res) {
  const pnr = sanitizeString(req.body?.pnr || req.query?.pnr, 40);
  const verification = sanitizeString(
    req.body?.verification || req.body?.contact || req.query?.verification || req.query?.contact,
    160
  );

  if (!pnr || !verification) {
    return res.status(400).json({
      success: false,
      error: 'Both Booking Reference (PNR) and Contact Verification (Phone, Email, or NIC/Passport) are required.'
    });
  }

  if (/^\d+$/.test(pnr)) {
    return res.status(400).json({
      success: false,
      error: 'Please enter your official Booking Reference (e.g., SLR-...), not a numeric ID.'
    });
  }

  const booking = getBookingByPnrOrId(pnr);
  if (!booking || !verifyGuestBookingAccess(booking, verification)) {
    return res.status(403).json({
      success: false,
      error: 'No booking matched the provided Booking Reference and Contact Verification details.'
    });
  }

  booking.qr_svg = booking.qr_payload ? generateQrSvg(booking.qr_payload) : null;
  return res.json({
    success: true,
    booking
  });
}

function cancelBooking(req, res) {
  const pnrOrId = req.params.pnrOrId;
  const verification =
    req.body?.verification ||
    req.body?.contact ||
    req.query?.verification ||
    req.headers?.['x-booking-verification'];

  const booking = getBookingByPnrOrId(pnrOrId);
  if (!booking) {
    return res.status(404).json({ success: false, error: 'Booking not found.' });
  }

  const isStaff = Boolean(req.staff);
  const isOwnerUser = Boolean(req.user && booking.user_id && booking.user_id === req.user.id);
  const isVerifiedGuest =
    ! /^\d+$/.test(String(pnrOrId).trim()) &&
    verifyGuestBookingAccess(booking, verification);

  if (!isStaff && !isOwnerUser && !isVerifiedGuest) {
    if (!req.user && !verification) {
      return res.status(401).json({
        success: false,
        error: 'Verification required to cancel this booking.'
      });
    }
    return res.status(403).json({
      success: false,
      error: 'Access denied. You can only cancel your own verified bookings.'
    });
  }

  if (booking.status === 'CANCELLED') {
    return res.status(400).json({
      success: false,
      error: 'This booking has already been cancelled.'
    });
  }

  const cancelledByType = isStaff ? 'STAFF' : isOwnerUser ? 'PASSENGER' : 'GUEST';
  const cancelledById = isStaff ? req.staff.id : isOwnerUser ? req.user.id : null;
  const reason = req.body?.reason || (isStaff ? 'Cancelled by railway staff' : 'Cancelled by passenger');

  const result = withTransaction(() => {
    const prevStatus = booking.status;
    const { cancellation, refund } = processCancellationAndRefund({
      booking,
      cancelledByType,
      cancelledById,
      reason,
      overrideRefundCents: isStaff ? req.body?.override_refund_cents : null
    });

    const newPaymentStatus = refund
      ? refund.amount_cents === booking.total_amount_cents
        ? 'REFUNDED'
        : 'PARTIALLY_REFUNDED'
      : booking.payment_status;

    dbRun(
      `UPDATE bookings
       SET status = 'CANCELLED',
           payment_status = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
      [newPaymentStatus, booking.id]
    );

    dbRun('DELETE FROM seat_reservations WHERE booking_id = ?', [booking.id]);

    recordBookingStatusChange({
      bookingId: booking.id,
      previousStatus: prevStatus,
      newStatus: 'CANCELLED',
      changedByType: cancelledByType,
      changedById: cancelledById,
      reason
    });

    if (booking.user_id) {
      createNotification({
        userId: booking.user_id,
        type: 'REFUND',
        title: `Booking Cancelled — PNR ${booking.pnr}`,
        message: refund
          ? `Your booking ${booking.pnr} has been cancelled. A refund of LKR ${refund.amount_lkr.toLocaleString()} (${refund.refund_reference}) has been processed.`
          : `Your booking ${booking.pnr} has been cancelled.`,
        relatedEntityType: 'bookings',
        relatedEntityId: booking.pnr
      });
    }

    return { cancellation, refund };
  });

  const updatedBooking = getBookingByPnrOrId(booking.id);
  updatedBooking.qr_svg = updatedBooking.qr_payload ? generateQrSvg(updatedBooking.qr_payload) : null;

  recordAuditLog({
    actorType: cancelledByType,
    actorId: cancelledById,
    actorIdentifier: isStaff ? req.staff.username : (req.user?.email || booking.contact_email || booking.contact_phone || booking.passenger_name),
    action: 'BOOKING_CANCELLED',
    entityType: 'bookings',
    entityId: booking.pnr,
    details: {
      reason,
      refund_cents: result.refund?.amount_cents || 0
    },
    ipAddress: req.ip
  });

  return res.json({
    success: true,
    booking: updatedBooking,
    cancellation: result.cancellation,
    refund: result.refund
  });
}

function verifyQrTicketEndpoint(req, res) {
  const qrPayloadOrPnr = req.body?.qr_payload || req.body?.pnr || req.query?.qr_payload || req.query?.pnr;
  const verification = verifyTicketQr(qrPayloadOrPnr);
  const booking = verification.pnr ? getBookingByPnrOrId(verification.pnr) : null;
  return res.json({
    success: true,
    verification,
    booking
  });
}

function listBookingsForStaff(req, res) {
  const bookings = listAllBookings({
    status: req.query?.status,
    travelDate: req.query?.travel_date,
    trainId: req.query?.train_id,
    search: req.query?.search
  });
  return res.json({
    success: true,
    bookings
  });
}

module.exports = {
  calculateFarePreview,
  getSeatMap,
  lockSeats,
  unlockSeats,
  createBooking,
  getPassengerBookings,
  getBookingDetails,
  lookupGuestBooking,
  cancelBooking,
  verifyQrTicketEndpoint,
  listBookingsForStaff
};
