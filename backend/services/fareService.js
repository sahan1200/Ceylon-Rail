const { dbGet } = require('../database');
const { getTrainStops, getStationByIdOrCode } = require('../repositories/railwayRepository');

/**
 * Calculate exact route distance, duration, and fare breakdown for a train journey segment.
 * Strictly validates that both stations are on the train's route and in valid travel order.
 */
function calculateSegmentFare({
  trainId,
  fromStation,
  toStation,
  className = '2nd Class Reserved',
  passengers = [{ passenger_type: 'ADULT' }]
}) {
  const stops = getTrainStops(Number(trainId));
  if (!stops || stops.length === 0) {
    const err = new Error('Selected train has no configured route stops.');
    err.statusCode = 400;
    throw err;
  }

  const fromResolved = fromStation ? getStationByIdOrCode(fromStation) : null;
  const toResolved = toStation ? getStationByIdOrCode(toStation) : null;

  const fromStop = fromResolved
    ? stops.find((s) => s.station_id === fromResolved.id)
    : stops[0];
  const toStop = toResolved
    ? stops.find((s) => s.station_id === toResolved.id)
    : stops[stops.length - 1];

  if (!fromStop || !toStop) {
    const err = new Error('Selected origin or destination station is not served by this train.');
    err.statusCode = 400;
    throw err;
  }

  if (fromStop.stop_order >= toStop.stop_order) {
    const err = new Error(
      `Invalid station travel order: ${fromStop.station_name} (stop #${fromStop.stop_order}) does not precede ${toStop.station_name} (stop #${toStop.stop_order}) on this route.`
    );
    err.statusCode = 400;
    throw err;
  }

  const distanceKm = Math.max(
    1.0,
    Number((toStop.distance_from_origin_km - fromStop.distance_from_origin_km).toFixed(1))
  );
  const durationMins = Math.max(
    10,
    (toStop.arrival_offset_mins || 60) - (fromStop.arrival_offset_mins || 0)
  );

  // Lookup fare rule from database
  const fareRule =
    dbGet('SELECT * FROM fare_rules WHERE class_name = ? AND is_active = 1', [className]) ||
    dbGet('SELECT * FROM fare_rules WHERE is_active = 1 ORDER BY id ASC LIMIT 1');

  const baseFareCents = fareRule ? Number(fareRule.base_fare_cents) : 50000;
  const perKmRateCents = fareRule ? Number(fareRule.per_km_rate_cents) : 500;
  const reservationFeeCentsPerSeat = fareRule ? Number(fareRule.reservation_fee_cents) : 15000;
  const taxRatePct = fareRule ? Number(fareRule.tax_rate_pct) : 0;
  const cancellationFeePct = fareRule ? Number(fareRule.cancellation_fee_pct) : 20;

  // Compute adult single-seat base ticket price in cents (rounded to nearest 100 cents = 1 LKR)
  const rawAdultTicketCents = baseFareCents + Math.round(distanceKm * perKmRateCents);
  const adultTicketCents = Math.round(rawAdultTicketCents / 100) * 100;

  const passengerList = Array.isArray(passengers) && passengers.length > 0
    ? passengers
    : [{ passenger_type: 'ADULT' }];

  let subtotalCents = 0;
  let totalReservationFeeCents = 0;
  const passengerBreakdowns = passengerList.map((p, idx) => {
    const pType = ['ADULT', 'CHILD', 'SENIOR'].includes(p.passenger_type) ? p.passenger_type : 'ADULT';
    let discountFactor = 1.0;
    if (pType === 'CHILD') discountFactor = 0.5;
    if (pType === 'SENIOR') discountFactor = 0.75;

    const ticketFareCents = Math.round((adultTicketCents * discountFactor) / 100) * 100;
    const lineTotalCents = ticketFareCents + reservationFeeCentsPerSeat;
    subtotalCents += ticketFareCents;
    totalReservationFeeCents += reservationFeeCentsPerSeat;

    return {
      index: idx,
      full_name: p.full_name || `Passenger ${idx + 1}`,
      passenger_type: pType,
      seat_number: p.seat_number || null,
      ticket_fare_cents: ticketFareCents,
      reservation_fee_cents: reservationFeeCentsPerSeat,
      fare_cents: lineTotalCents,
      fare_lkr: Number((lineTotalCents / 100).toFixed(2))
    };
  });

  const taxCents = Math.round(((subtotalCents + totalReservationFeeCents) * taxRatePct) / 100);
  const totalAmountCents = subtotalCents + totalReservationFeeCents + taxCents;

  return {
    train_id: Number(trainId),
    from_station_id: fromStop.station_id,
    from_station_code: fromStop.station_code,
    from_station_name: fromStop.station_name,
    from_stop_order: fromStop.stop_order,
    to_station_id: toStop.station_id,
    to_station_code: toStop.station_code,
    to_station_name: toStop.station_name,
    to_stop_order: toStop.stop_order,
    distance_km: distanceKm,
    duration_mins: durationMins,
    class_name: className,
    adult_unit_fare_cents: adultTicketCents + reservationFeeCentsPerSeat,
    adult_unit_fare_lkr: Number(((adultTicketCents + reservationFeeCentsPerSeat) / 100).toFixed(2)),
    subtotal_cents: subtotalCents,
    reservation_fee_cents: totalReservationFeeCents,
    tax_cents: taxCents,
    total_amount_cents: totalAmountCents,
    total_amount_lkr: Number((totalAmountCents / 100).toFixed(2)),
    cancellation_fee_pct: cancellationFeePct,
    passengers: passengerBreakdowns
  };
}

module.exports = {
  calculateSegmentFare
};
