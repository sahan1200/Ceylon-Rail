const { dbAll, dbGet, dbRun, withTransaction } = require('../database');

function listStations({ activeOnly = true } = {}) {
  const sql = activeOnly
    ? 'SELECT * FROM stations WHERE is_active = 1 ORDER BY line_name, distance_from_fort_km ASC'
    : 'SELECT * FROM stations ORDER BY line_name, distance_from_fort_km ASC';
  return dbAll(sql);
}

function getStationByIdOrCode(idOrCode) {
  if (idOrCode === undefined || idOrCode === null) return null;
  if (/^\d+$/.test(String(idOrCode))) {
    return dbGet('SELECT * FROM stations WHERE id = ?', [Number(idOrCode)]);
  }
  return dbGet(
    'SELECT * FROM stations WHERE upper(code) = upper(?) OR lower(name) = lower(?)',
    [String(idOrCode).trim(), String(idOrCode).trim()]
  );
}

function createOrUpdateStation(payload) {
  const code = String(payload.code).trim().toUpperCase();
  const existing = dbGet('SELECT id FROM stations WHERE code = ?', [code]);
  if (existing) {
    dbRun(
      `UPDATE stations
       SET name = ?, name_si = ?, name_ta = ?, line_name = ?, province = ?,
           elevation_m = ?, distance_from_fort_km = ?, lat = ?, lng = ?, is_active = ?
       WHERE id = ?`,
      [
        payload.name,
        payload.name_si || null,
        payload.name_ta || null,
        payload.line_name || 'Main Line',
        payload.province || 'Western',
        Number(payload.elevation_m) || 0,
        Number(payload.distance_from_fort_km) || 0,
        Number(payload.lat) || 6.9344,
        Number(payload.lng) || 79.8501,
        payload.is_active !== undefined ? (payload.is_active ? 1 : 0) : 1,
        existing.id
      ]
    );
    return getStationByIdOrCode(existing.id);
  }
  const res = dbRun(
    `INSERT INTO stations (
      code, name, name_si, name_ta, line_name, province,
      elevation_m, distance_from_fort_km, lat, lng, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      code,
      payload.name,
      payload.name_si || null,
      payload.name_ta || null,
      payload.line_name || 'Main Line',
      payload.province || 'Western',
      Number(payload.elevation_m) || 0,
      Number(payload.distance_from_fort_km) || 0,
      Number(payload.lat) || 6.9344,
      Number(payload.lng) || 79.8501
    ]
  );
  return getStationByIdOrCode(res.lastID);
}

function getTrainStops(trainId) {
  return dbAll(
    `SELECT rs.*, s.code AS station_code, s.name AS station_name,
            s.name_si AS station_name_si, s.name_ta AS station_name_ta,
            s.elevation_m, s.lat, s.lng, s.line_name
     FROM route_stops rs
     JOIN stations s ON s.id = rs.station_id
     WHERE rs.train_id = ?
     ORDER BY rs.stop_order ASC`,
    [trainId]
  );
}

function getTrainCarriages(trainId) {
  const carriages = dbAll(
    'SELECT * FROM carriages WHERE train_id = ? ORDER BY carriage_code ASC',
    [trainId]
  );
  return carriages.map((c) => {
    const seats = dbAll(
      'SELECT * FROM seats WHERE carriage_id = ? AND is_active = 1 ORDER BY row_number ASC, col_letter ASC',
      [c.id]
    );
    return { ...c, seats };
  });
}

function getTrainById(trainId) {
  const train = dbGet(
    `SELECT t.*,
            so.code AS origin_code, so.name AS origin_name, so.name_si AS origin_name_si, so.name_ta AS origin_name_ta,
            sd.code AS dest_code, sd.name AS dest_name, sd.name_si AS dest_name_si, sd.name_ta AS dest_name_ta
     FROM trains t
     JOIN stations so ON so.id = t.origin_station_id
     JOIN stations sd ON sd.id = t.destination_station_id
     WHERE t.id = ?`,
    [trainId]
  );
  if (!train) return null;
  train.stops = getTrainStops(train.id);
  train.carriages = getTrainCarriages(train.id);
  train.schedules = dbAll('SELECT * FROM train_schedules WHERE train_id = ?', [train.id]);
  return train;
}

/**
 * Search trains with strict ordered route-stop validation:
 * Ensures fromStation appears BEFORE toStation in route_stops (fromStop.stop_order < toStop.stop_order).
 */
function searchTrains({ fromStation, toStation, travelDate, travelClass, timeSlot }) {
  const allTrains = dbAll(
    `SELECT t.*,
            so.code AS origin_code, so.name AS origin_name, so.name_si AS origin_name_si, so.name_ta AS origin_name_ta,
            sd.code AS dest_code, sd.name AS dest_name, sd.name_si AS dest_name_si, sd.name_ta AS dest_name_ta
     FROM trains t
     JOIN stations so ON so.id = t.origin_station_id
     JOIN stations sd ON sd.id = t.destination_station_id
     WHERE t.is_active = 1
     ORDER BY t.departure_time ASC`
  );

  const fromResolved = fromStation ? getStationByIdOrCode(fromStation) : null;
  const toResolved = toStation ? getStationByIdOrCode(toStation) : null;

  // If caller specified both stations and they are identical, return empty with reason
  if (fromResolved && toResolved && fromResolved.id === toResolved.id) {
    const err = new Error('Origin and destination stations cannot be the same.');
    err.statusCode = 400;
    throw err;
  }

  const results = [];
  for (const t of allTrains) {
    const stops = getTrainStops(t.id);
    let fromStop = stops[0];
    let toStop = stops[stops.length - 1];

    if (fromResolved) {
      fromStop = stops.find((s) => s.station_id === fromResolved.id);
      if (!fromStop) continue;
    }
    if (toResolved) {
      toStop = stops.find((s) => s.station_id === toResolved.id);
      if (!toStop) continue;
    }

    // Strict ordered route validation
    if (!fromStop || !toStop || fromStop.stop_order >= toStop.stop_order) {
      continue;
    }

    if (travelClass && travelClass !== 'ALL') {
      if (!t.classes_available.toLowerCase().includes(travelClass.toLowerCase())) {
        continue;
      }
    }

    const effectiveDeparture = fromStop.departure_time || t.departure_time;
    const effectiveArrival = toStop.arrival_time || t.arrival_time;

    if (timeSlot && timeSlot !== 'ALL') {
      const hour = parseInt(String(effectiveDeparture).split(':')[0], 10);
      if (timeSlot === 'MORNING' && (hour < 4 || hour >= 12)) continue;
      if (timeSlot === 'AFTERNOON' && (hour < 12 || hour >= 17)) continue;
      if (timeSlot === 'EVENING' && hour < 17 && hour >= 4) continue;
    }

    const segmentDistanceKm = Math.max(
      1,
      Number((toStop.distance_from_origin_km - fromStop.distance_from_origin_km).toFixed(1))
    );
    const segmentDurationMins = Math.max(
      10,
      (toStop.arrival_offset_mins || t.duration_mins) - (fromStop.arrival_offset_mins || 0)
    );

    const carriages = getTrainCarriages(t.id);
    const totalCapacity = carriages.reduce((acc, c) => acc + c.total_seats, 0);

    // Count overlapping reservations on this travelDate
    const dateToCheck = travelDate || new Date().toISOString().slice(0, 10);
    const activeLocksRow = dbGet(
      `SELECT COUNT(*) AS cnt
       FROM seat_reservations
       WHERE train_id = ?
         AND travel_date = ?
         AND (status = 'BOOKED' OR (status = 'LOCKED' AND datetime(expires_at) > datetime('now')))
         AND NOT (to_stop_order <= ? OR from_stop_order >= ?)`,
      [t.id, dateToCheck, fromStop.stop_order, toStop.stop_order]
    );

    const bookedCount = activeLocksRow?.cnt || 0;
    const availableSeats = Math.max(0, totalCapacity - bookedCount);
    let occupancyStatus = 'Available';
    if (availableSeats === 0) occupancyStatus = 'Sold Out';
    else if (availableSeats <= 15) occupancyStatus = 'Limited Seats';
    else if (availableSeats <= 35) occupancyStatus = 'Filling Fast';

    results.push({
      ...t,
      segment_from_station_id: fromStop.station_id,
      segment_from_code: fromStop.station_code,
      segment_from_name: fromStop.station_name,
      segment_from_stop_order: fromStop.stop_order,
      segment_to_station_id: toStop.station_id,
      segment_to_code: toStop.station_code,
      segment_to_name: toStop.station_name,
      segment_to_stop_order: toStop.stop_order,
      segment_departure_time: effectiveDeparture,
      segment_arrival_time: effectiveArrival,
      segment_distance_km: segmentDistanceKm,
      segment_duration_mins: segmentDurationMins,
      total_capacity: totalCapacity,
      booked_seats: bookedCount,
      available_seats: availableSeats,
      occupancy_status: occupancyStatus,
      stops,
      carriages
    });
  }

  return results;
}

function listFareRules() {
  return dbAll('SELECT * FROM fare_rules WHERE is_active = 1 ORDER BY base_fare_cents DESC');
}

function upsertFareRule(payload) {
  const className = String(payload.class_name).trim();
  const baseFareCents = Number(payload.base_fare_cents);
  const perKmRateCents = Number(payload.per_km_rate_cents);
  const classMultiplier = Number(payload.class_multiplier || 1.0);
  const reservationFeeCents = Number(payload.reservation_fee_cents || 0);
  const taxRatePct = Number(payload.tax_rate_pct || 0);
  const cancellationFeePct = Number(payload.cancellation_fee_pct || 20);

  dbRun(
    `INSERT INTO fare_rules (
      class_name, base_fare_cents, per_km_rate_cents, min_distance_km,
      class_multiplier, reservation_fee_cents, tax_rate_pct, cancellation_fee_pct, is_active, updated_at
    ) VALUES (?, ?, ?, 10.0, ?, ?, ?, ?, 1, datetime('now'))
    ON CONFLICT(class_name) DO UPDATE SET
      base_fare_cents = excluded.base_fare_cents,
      per_km_rate_cents = excluded.per_km_rate_cents,
      class_multiplier = excluded.class_multiplier,
      reservation_fee_cents = excluded.reservation_fee_cents,
      tax_rate_pct = excluded.tax_rate_pct,
      cancellation_fee_pct = excluded.cancellation_fee_pct,
      updated_at = datetime('now')`,
    [className, baseFareCents, perKmRateCents, classMultiplier, reservationFeeCents, taxRatePct, cancellationFeePct]
  );

  return dbGet('SELECT * FROM fare_rules WHERE class_name = ?', [className]);
}

function createOrUpdateTrain(payload) {
  return withTransaction(() => {
    const trainNumber = String(payload.train_number).trim();
    const existing = dbGet('SELECT id FROM trains WHERE train_number = ?', [trainNumber]);
    let trainId;
    if (existing) {
      dbRun(
        `UPDATE trains
         SET name = ?, name_si = COALESCE(?, name_si), name_ta = COALESCE(?, name_ta),
             type = ?, route_name = ?, origin_station_id = ?, destination_station_id = ?,
             departure_time = ?, arrival_time = ?, duration_mins = ?,
             frequency = COALESCE(?, frequency), classes_available = COALESCE(?, classes_available),
             base_speed_kmh = COALESCE(?, base_speed_kmh), is_active = COALESCE(?, is_active)
         WHERE id = ?`,
        [
          payload.name,
          payload.name_si ?? null,
          payload.name_ta ?? null,
          payload.type || 'Intercity Express',
          payload.route_name || 'Main Line',
          Number(payload.origin_station_id),
          Number(payload.destination_station_id),
          payload.departure_time,
          payload.arrival_time,
          Number(payload.duration_mins) || 300,
          payload.frequency ?? null,
          payload.classes_available ?? null,
          payload.base_speed_kmh ? Number(payload.base_speed_kmh) : null,
          payload.is_active !== undefined ? (payload.is_active ? 1 : 0) : null,
          existing.id
        ]
      );
      trainId = existing.id;
    } else {
      const res = dbRun(
        `INSERT INTO trains (
          train_number, name, name_si, name_ta, type, route_name,
          origin_station_id, destination_station_id, departure_time, arrival_time,
          duration_mins, frequency, classes_available, base_speed_kmh, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          trainNumber,
          payload.name,
          payload.name_si || null,
          payload.name_ta || null,
          payload.type || 'Intercity Express',
          payload.route_name || 'Main Line',
          Number(payload.origin_station_id),
          Number(payload.destination_station_id),
          payload.departure_time,
          payload.arrival_time,
          Number(payload.duration_mins) || 300,
          payload.frequency || 'Daily',
          payload.classes_available || '2nd Class Reserved,3rd Class Reserved',
          Number(payload.base_speed_kmh) || 45
        ]
      );
      trainId = res.lastID;
    }
    return getTrainById(trainId);
  });
}

module.exports = {
  listStations,
  getStationByIdOrCode,
  createOrUpdateStation,
  getTrainStops,
  getTrainCarriages,
  getTrainById,
  searchTrains,
  listFareRules,
  upsertFareRule,
  createOrUpdateTrain
};
