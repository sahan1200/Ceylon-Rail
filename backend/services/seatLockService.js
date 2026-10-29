const { dbAll, dbGet, dbRun, withTransaction } = require('../database');
const { getTrainStops, getStationByIdOrCode } = require('../repositories/railwayRepository');
const env = require('../config/env');

function purgeExpiredSeatLocks() {
  dbRun(
    `DELETE FROM seat_reservations
     WHERE status = 'LOCKED'
       AND expires_at IS NOT NULL
       AND datetime(expires_at) <= datetime('now')`
  );
}

function resolveStopOrders(trainId, fromStation, toStation) {
  const stops = getTrainStops(Number(trainId));
  if (!stops || stops.length === 0) {
    return { fromStopOrder: 1, toStopOrder: 99 };
  }
  const fromResolved = fromStation ? getStationByIdOrCode(fromStation) : null;
  const toResolved = toStation ? getStationByIdOrCode(toStation) : null;
  const fromStop = fromResolved ? stops.find((s) => s.station_id === fromResolved.id) : stops[0];
  const toStop = toResolved ? stops.find((s) => s.station_id === toResolved.id) : stops[stops.length - 1];
  return {
    fromStopOrder: fromStop ? fromStop.stop_order : 1,
    toStopOrder: toStop ? toStop.stop_order : stops[stops.length - 1].stop_order
  };
}

/**
 * Retrieve carriage seat map and reservation states for a specific train, carriage, date, and optional route segment.
 */
function getCarriageSeatAvailability({ trainId, carriageCode, travelDate, fromStation, toStation }) {
  purgeExpiredSeatLocks();
  const { fromStopOrder, toStopOrder } = resolveStopOrders(trainId, fromStation, toStation);

  const carriage = dbGet(
    'SELECT * FROM carriages WHERE train_id = ? AND carriage_code = ?',
    [Number(trainId), String(carriageCode).trim()]
  );

  const seats = carriage
    ? dbAll('SELECT * FROM seats WHERE carriage_id = ? AND is_active = 1 ORDER BY row_number ASC, col_letter ASC', [carriage.id])
    : [];

  const reservations = dbAll(
    `SELECT id, carriage_code, seat_number, status, locked_by_session, locked_by_user_id,
            expires_at, from_stop_order, to_stop_order
     FROM seat_reservations
     WHERE train_id = ?
       AND carriage_code = ?
       AND travel_date = ?
       AND (status = 'BOOKED' OR (status = 'LOCKED' AND datetime(expires_at) > datetime('now')))
       AND NOT (to_stop_order <= ? OR from_stop_order >= ?)`,
    [Number(trainId), String(carriageCode).trim(), travelDate, fromStopOrder, toStopOrder]
  );

  return {
    carriage,
    seats,
    reservations,
    from_stop_order: fromStopOrder,
    to_stop_order: toStopOrder
  };
}

/**
 * Atomically lock one or more seats for a passenger session inside an IMMEDIATE transaction.
 * Rejects the entire request if any requested seat is already BOOKED or actively LOCKED by another session/user.
 */
function lockSeatsAtomically({
  trainId,
  carriageCode,
  travelDate,
  seats,
  sessionId,
  userId = null,
  fromStation = null,
  toStation = null
}) {
  if (!Array.isArray(seats) || seats.length === 0) {
    const err = new Error('At least one seat number must be specified.');
    err.statusCode = 400;
    throw err;
  }

  return withTransaction(() => {
    purgeExpiredSeatLocks();

    const carriage = dbGet(
      'SELECT * FROM carriages WHERE train_id = ? AND carriage_code = ?',
      [Number(trainId), String(carriageCode).trim()]
    );
    if (!carriage) {
      const err = new Error(`Carriage ${carriageCode} does not exist on train #${trainId}.`);
      err.statusCode = 404;
      throw err;
    }

    const { fromStopOrder, toStopOrder } = resolveStopOrders(trainId, fromStation, toStation);
    const ttlMinutes = env.SEAT_LOCK_TTL_MINUTES || 10;
    const expiresAtRow = dbGet(`SELECT datetime('now', '+' || ? || ' minutes') AS exp`, [ttlMinutes]);
    const expiresAt = expiresAtRow.exp;

    const lockedSeats = [];
    for (const rawSeat of seats) {
      const seatNumber = String(rawSeat).trim().toUpperCase();
      const seatRow = dbGet(
        'SELECT * FROM seats WHERE carriage_id = ? AND seat_number = ? AND is_active = 1',
        [carriage.id, seatNumber]
      );
      if (!seatRow) {
        const err = new Error(`Seat ${seatNumber} is invalid for carriage ${carriageCode}.`);
        err.statusCode = 400;
        throw err;
      }

      // Check existing reservation row for this train + carriage + seat + travel_date
      const existing = dbGet(
        `SELECT * FROM seat_reservations
         WHERE train_id = ? AND carriage_code = ? AND seat_number = ? AND travel_date = ?`,
        [Number(trainId), carriage.carriage_code, seatNumber, travelDate]
      );

      if (existing) {
        const isConfirmed = existing.status === 'BOOKED';
        const isLockedByOther =
          existing.status === 'LOCKED' &&
          existing.locked_by_session !== sessionId &&
          (!userId || existing.locked_by_user_id !== userId);

        if (isConfirmed || isLockedByOther) {
          const err = new Error(
            `Seat ${seatNumber} in carriage ${carriageCode} is already ${isConfirmed ? 'booked' : 'locked by another passenger'}.`
          );
          err.statusCode = 409;
          throw err;
        }

        // Safe update of own lock
        dbRun(
          `UPDATE seat_reservations
           SET seat_id = ?,
               status = 'LOCKED',
               locked_by_session = ?,
               locked_by_user_id = ?,
               from_stop_order = ?,
               to_stop_order = ?,
               expires_at = ?,
               updated_at = datetime('now')
           WHERE id = ?`,
          [seatRow.id, sessionId, userId, fromStopOrder, toStopOrder, expiresAt, existing.id]
        );
      } else {
        dbRun(
          `INSERT INTO seat_reservations (
            train_id, carriage_code, seat_id, seat_number, travel_date,
            from_stop_order, to_stop_order, status, locked_by_session, locked_by_user_id, expires_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'LOCKED', ?, ?, ?)`,
          [
            Number(trainId),
            carriage.carriage_code,
            seatRow.id,
            seatNumber,
            travelDate,
            fromStopOrder,
            toStopOrder,
            sessionId,
            userId,
            expiresAt
          ]
        );
      }

      lockedSeats.push(seatNumber);
    }

    return {
      train_id: Number(trainId),
      carriage_code: carriage.carriage_code,
      travel_date: travelDate,
      seats: lockedSeats,
      locked_by_session: sessionId,
      expires_at: expiresAt,
      ttl_minutes: ttlMinutes
    };
  });
}

function releaseSeatLocks({ trainId, carriageCode, travelDate, seats, sessionId, userId = null }) {
  return withTransaction(() => {
    let released = 0;
    for (const rawSeat of seats || []) {
      const seatNumber = String(rawSeat).trim().toUpperCase();
      const res = dbRun(
        `DELETE FROM seat_reservations
         WHERE train_id = ?
           AND carriage_code = ?
           AND seat_number = ?
           AND travel_date = ?
           AND status = 'LOCKED'
           AND (locked_by_session = ? OR (? IS NOT NULL AND locked_by_user_id = ?))`,
        [Number(trainId), String(carriageCode).trim(), seatNumber, travelDate, sessionId, userId, userId]
      );
      released += res.changes;
    }
    return { released };
  });
}

module.exports = {
  purgeExpiredSeatLocks,
  getCarriageSeatAvailability,
  lockSeatsAtomically,
  releaseSeatLocks,
  resolveStopOrders
};
